import { NextResponse } from "next/server";
import speakeasy from "speakeasy";
import { verifyFirebaseIdTokenFromRequest } from "../_lib";
import { adminPatchDocument, adminReadDocument } from "../../_firebaseAdminRest";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const verifiedUser = await verifyFirebaseIdTokenFromRequest(req);
    if (!verifiedUser?.uid) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
      return NextResponse.json({ error: "MFA not set up." }, { status: 400 });
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
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
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("MFA verify route error:", error);
    return NextResponse.json(
      { error: error?.message || "Unable to verify authenticator code." },
      { status: 500 }
    );
  }
}
