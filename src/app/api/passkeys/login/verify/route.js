import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { adminPatchDocument, adminReadDocument, createFirebaseCustomToken } from "@/app/api/_firebaseAdminRest";
import { findPasskeyCredential, findUserByEmail, fromBase64Url, isFreshChallenge, passkeyError, requireActiveUser } from "../../_lib";

export const runtime = "nodejs";

export async function POST(req) {
  if (process.env.ALLOW_LEGACY_FIREBASE_LOGIN !== "true") {
    return NextResponse.json(
      { error: "Passkey login has moved to Clerk." },
      { status: 410 }
    );
  }

  try {
    const { email, credential } = await req.json();
    const user = await findUserByEmail(email);
    if (!user) return passkeyError("Passkey login failed.", 401);

    await requireActiveUser(user.id);

    const credentialId = credential?.id;
    const savedCredential = credentialId ? await findPasskeyCredential(credentialId) : null;
    if (!savedCredential || savedCredential.uid !== user.id) {
      return passkeyError("Passkey login failed.", 401);
    }

    const challengeDoc = await adminReadDocument("passkeyChallenges", user.id);
    if (!isFreshChallenge(challengeDoc, "authenticationChallenge", "authenticationExpiresAt")) {
      return passkeyError("Passkey login expired. Please try again.", 400);
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challengeDoc.authenticationChallenge,
      expectedOrigin: challengeDoc.authenticationOrigin,
      expectedRPID: challengeDoc.authenticationRpID,
      credential: {
        id: savedCredential.credentialId || savedCredential.id,
        publicKey: fromBase64Url(savedCredential.publicKey),
        counter: Number(savedCredential.counter || 0),
        transports: savedCredential.transports || [],
      },
      requireUserVerification: true,
    });

    if (!verification.verified) return passkeyError("Passkey login failed.", 401);

    const now = new Date().toISOString();
    await adminPatchDocument("passkeyCredentials", savedCredential.id, {
      counter: verification.authenticationInfo.newCounter,
      deviceType: verification.authenticationInfo.credentialDeviceType,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: now,
      updatedAt: now,
    });

    await adminPatchDocument("passkeyChallenges", user.id, {
      authenticationChallenge: null,
      authenticationExpiresAt: null,
      updatedAt: now,
    });

    const customToken = createFirebaseCustomToken(user.id, {
      passkey: true,
      authMethod: "passkey",
    });

    return NextResponse.json({ customToken });
  } catch (err) {
    console.error("Passkey login verify failed", err);
    return passkeyError(err?.message || "Could not verify passkey login.", 500);
  }
}
