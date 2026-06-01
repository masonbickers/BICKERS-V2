import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { adminPatchDocument } from "@/app/api/_firebaseAdminRest";
import { findUserByEmail, getPasskeyRequestMeta, listPasskeysForUid, passkeyError, requireActiveUser } from "../../_lib";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { email } = await req.json();
    const user = await findUserByEmail(email);
    if (!user) return passkeyError("No passkey is registered for that email.", 404);

    await requireActiveUser(user.id);
    const credentials = await listPasskeysForUid(user.id);
    if (!credentials.length) {
      return passkeyError("No passkey is registered for that email.", 404);
    }

    const { origin, rpID } = getPasskeyRequestMeta(req);
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60000,
      userVerification: "required",
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId || credential.id,
        transports: credential.transports || [],
      })),
    });

    await adminPatchDocument("passkeyChallenges", user.id, {
      uid: user.id,
      email: String(user.data?.email || email || "").trim().toLowerCase(),
      authenticationChallenge: options.challenge,
      authenticationOrigin: origin,
      authenticationRpID: rpID,
      authenticationExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ options });
  } catch (err) {
    console.error("Passkey login options failed", err);
    return passkeyError(err?.message || "Could not start passkey login.", 500);
  }
}
