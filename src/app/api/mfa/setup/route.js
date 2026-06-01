import { NextResponse } from "next/server";
import speakeasy from "speakeasy";
import { verifyFirebaseIdTokenFromRequest } from "../_lib";

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

    return NextResponse.json({
      base32: secret.base32,
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
