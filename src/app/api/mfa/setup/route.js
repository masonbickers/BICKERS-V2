import { NextResponse } from "next/server";
import speakeasy from "speakeasy";
import { verifyFirebaseIdTokenFromRequest } from "../_lib";
import { adminPatchDocument } from "../../_firebaseAdminRest";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const verifiedUser = await verifyFirebaseIdTokenFromRequest(req);
    if (!verifiedUser?.uid) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
