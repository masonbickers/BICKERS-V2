import { NextResponse } from "next/server";
import speakeasy from "speakeasy";
import { verifyFirebaseIdTokenFromRequest } from "../_lib";
import { adminCreateDocument, adminPatchDocument, adminReadDocument } from "../../_firebaseAdminRest";

export const runtime = "nodejs";

function headerValue(headers, name) {
  return String(headers?.get?.(name) || "").trim();
}

function clientIp(req) {
  const forwarded = headerValue(req.headers, "x-forwarded-for");
  return (
    headerValue(req.headers, "cf-connecting-ip") ||
    headerValue(req.headers, "x-real-ip") ||
    String(forwarded.split(",")[0] || "").trim() ||
    ""
  );
}

async function writeMfaLoginLog(req, verifiedUser, status, reason = "", mode = "") {
  try {
    await adminCreateDocument("loginSecurityLogs", {
      uid: verifiedUser?.uid || "",
      email: verifiedUser?.email || "",
      loginMethod: mode === "enroll" ? "mfa-enrollment" : "mfa",
      status,
      outcome: status,
      reason,
      ip: clientIp(req),
      userAgent: headerValue(req.headers, "user-agent"),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("MFA login security log failed:", error);
  }
}

async function writeMfaAudit(req, verifiedUser, action, before = null, after = {}) {
  try {
    await adminCreateDocument("adminAuditLogs", {
      actorUid: verifiedUser?.uid || "",
      actorEmail: verifiedUser?.email || "",
      actorRole: "user",
      targetType: "mfa",
      targetId: verifiedUser?.uid || "",
      companyId: after?.companyId || before?.companyId || "",
      action,
      area: "MFA",
      before,
      after,
      ip: clientIp(req),
      userAgent: headerValue(req.headers, "user-agent"),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("MFA audit failed:", error);
  }
}

export async function POST(req) {
  try {
    const verifiedUser = await verifyFirebaseIdTokenFromRequest(req);
    if (!verifiedUser?.uid) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const userData = await adminReadDocument("users", verifiedUser.uid);
    if (userData?.isEnabled === false) {
      return NextResponse.json({ error: "Account disabled." }, { status: 403 });
    }

    const body = await req.json();
    const token = String(body?.token || "").replace(/\s+/g, "").trim();
    const mode = String(body?.mode || "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing code." }, { status: 400 });
    }

    const secretDoc = await adminReadDocument("mfaSecrets", verifiedUser.uid);
    const isEnrollment = mode === "enroll";
    const secret = String(
      isEnrollment ? secretDoc?.pendingSecret || "" : secretDoc?.secret || ""
    ).trim();

    if (!secret) {
      await writeMfaLoginLog(req, verifiedUser, "failed", "MFA secret missing", mode);
      return NextResponse.json({ error: "MFA not set up." }, { status: 400 });
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      await writeMfaLoginLog(req, verifiedUser, "failed", "Invalid MFA code", mode);
      return NextResponse.json({ error: "Invalid code." }, { status: 401 });
    }

    if (isEnrollment) {
      const nowIso = new Date().toISOString();
      await Promise.all([
        adminPatchDocument(
          "mfaSecrets",
          verifiedUser.uid,
          {
            secret,
            enrolledAt: nowIso,
            updatedAt: nowIso,
            userEmail: verifiedUser.email || "",
          },
          { deleteFields: ["pendingSecret", "pendingCreatedAt"] }
        ),
        adminPatchDocument(
          "users",
          verifiedUser.uid,
          {
            mfaMethod: "totp",
            mfaEnabled: true,
            mfaEnrolledAt: nowIso,
            mfaResetRequired: false,
            updatedAt: nowIso,
          },
          { deleteFields: ["mfaSecret"] }
        ),
      ]);
      await writeMfaAudit(req, verifiedUser, "Completed MFA enrollment", userData, {
        ...userData,
        companyId: userData?.companyId || "",
        mfaMethod: "totp",
        mfaEnabled: true,
        mfaEnrolledAt: nowIso,
        mfaResetRequired: false,
      });
    }

    await writeMfaLoginLog(req, verifiedUser, "success", "", mode);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("MFA verify route error:", error);
    return NextResponse.json(
      { error: error?.message || "Unable to verify authenticator code." },
      { status: 500 }
    );
  }
}
