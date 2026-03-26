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

    const body = await req.json();
    const token = String(body?.token || "").replace(/\s+/g, "").trim();
    const enrollmentSecret = String(body?.secret || "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing code." }, { status: 400 });
    }

    const secret = enrollmentSecret;

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("MFA verify route error:", error);
    return NextResponse.json(
      { error: error?.message || "Unable to verify authenticator code." },
      { status: 500 }
    );
  }
}
