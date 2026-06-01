import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { adminPatchDocument } from "@/app/api/_firebaseAdminRest";
import { requireActiveUser, getPasskeyRequestMeta, listPasskeysForUid, passkeyError, RP_NAME } from "../../_lib";
import { verifyFirebaseIdTokenFromRequest } from "@/app/api/mfa/_lib";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const decoded = await verifyFirebaseIdTokenFromRequest(req);
    if (!decoded?.uid) return passkeyError("Not authenticated.", 401);

    const userDoc = await requireActiveUser(decoded.uid);
    const { origin, rpID } = getPasskeyRequestMeta(req);
    const existingPasskeys = await listPasskeysForUid(decoded.uid);
    const email = String(userDoc.email || decoded.email || "").trim().toLowerCase();

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: email,
      userID: Buffer.from(decoded.uid),
      userDisplayName: userDoc.name || email,
      attestationType: "none",
      timeout: 60000,
      excludeCredentials: existingPasskeys.map((credential) => ({
        id: credential.credentialId || credential.id,
        transports: credential.transports || [],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    await adminPatchDocument("passkeyChallenges", decoded.uid, {
      uid: decoded.uid,
      email,
      registrationChallenge: options.challenge,
      registrationOrigin: origin,
      registrationRpID: rpID,
      registrationExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ options });
  } catch (err) {
    console.error("Passkey registration options failed", err);
    return passkeyError(err?.message || "Could not start passkey setup.", 500);
  }
}
