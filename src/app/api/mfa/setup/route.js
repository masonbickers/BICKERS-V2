import { NextResponse } from "next/server";
import speakeasy from "speakeasy";
import { verifyFirebaseIdTokenFromRequest } from "../_lib";
import { adminCreateDocument, adminPatchDocument, adminReadDocument } from "../../_firebaseAdminRest";

export const runtime = "nodejs";

function headerValue(headers, name) {
  return String(headers?.get?.(name) || "").trim();
}

async function writeMfaAudit(req, verifiedUser, action, after = {}) {
  try {
    await adminCreateDocument("adminAuditLogs", {
      actorUid: verifiedUser?.uid || "",
      actorEmail: verifiedUser?.email || "",
      actorRole: "user",
      targetType: "mfa",
      targetId: verifiedUser?.uid || "",
      companyId: after?.companyId || "",
      action,
      area: "MFA",
      before: null,
      after,
      ip: headerValue(req.headers, "x-forwarded-for").split(",")[0] || "",
      userAgent: headerValue(req.headers, "user-agent"),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("MFA setup audit failed:", error);
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

    const secretDoc = (await adminReadDocument("mfaSecrets", verifiedUser.uid)) || {};
    const existingSecret = String(secretDoc?.secret || "").trim();
    if (existingSecret && userData?.mfaResetRequired !== true) {
      const nowIso = new Date().toISOString();
      await adminPatchDocument("users", verifiedUser.uid, {
        mfaMethod: "totp",
        mfaEnabled: true,
        mfaResetRequired: false,
        updatedAt: nowIso,
        ...(secretDoc.enrolledAt && !userData?.mfaEnrolledAt
          ? { mfaEnrolledAt: secretDoc.enrolledAt }
          : {}),
      });

      await writeMfaAudit(req, verifiedUser, "Confirmed existing MFA enrollment", {
        uid: verifiedUser.uid,
        companyId: userData?.companyId || "",
        mfaEnabled: true,
        mfaMethod: "totp",
      });
      return NextResponse.json({ alreadyEnrolled: true });
    }

    const secret = speakeasy.generateSecret({
      name: verifiedUser.email || "Bickers Booking",
      issuer: "Bickers Booking",
      length: 20,
    });

    const nowIso = new Date().toISOString();
    await adminPatchDocument("mfaSecrets", verifiedUser.uid, {
      pendingSecret: secret.base32,
      pendingCreatedAt: nowIso,
      updatedAt: nowIso,
      userEmail: verifiedUser.email || "",
    });
    await writeMfaAudit(req, verifiedUser, "Prepared MFA setup", {
      uid: verifiedUser.uid,
      companyId: userData?.companyId || "",
      pendingCreatedAt: nowIso,
    });

    return NextResponse.json({
      otpauthUrl: secret.otpauth_url,
    });
  } catch (error) {
    console.error("MFA setup route error:", error);
    return NextResponse.json(
      { error: error?.message || "Unable to prepare authenticator setup." },
      { status: 500 }
    );
  }
}
