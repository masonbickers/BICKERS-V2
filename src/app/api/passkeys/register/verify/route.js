import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { adminCreateDocument, adminPatchDocument, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { findPasskeyCredential, isFreshChallenge, passkeyError, requireActiveUser, toBase64Url } from "../../_lib";
import { verifyFirebaseIdTokenFromRequest } from "@/app/api/mfa/_lib";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const decoded = await verifyFirebaseIdTokenFromRequest(req);
    if (!decoded?.uid) return passkeyError("Not authenticated.", 401);

    const userDoc = await requireActiveUser(decoded.uid);
    const { credential } = await req.json();
    const challengeDoc = await adminReadDocument("passkeyChallenges", decoded.uid);

    if (!isFreshChallenge(challengeDoc, "registrationChallenge", "registrationExpiresAt")) {
      return passkeyError("Passkey setup expired. Please try again.", 400);
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challengeDoc.registrationChallenge,
      expectedOrigin: challengeDoc.registrationOrigin,
      expectedRPID: challengeDoc.registrationRpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo?.credential) {
      return passkeyError("Passkey setup could not be verified.", 400);
    }

    const savedCredential = verification.registrationInfo.credential;
    const credentialId = savedCredential.id;
    const existing = await findPasskeyCredential(credentialId);
    if (existing && existing.uid !== decoded.uid) {
      return passkeyError("This passkey is already registered to another account.", 409);
    }

    const now = new Date().toISOString();
    await adminPatchDocument("passkeyCredentials", credentialId, {
      uid: decoded.uid,
      email: String(userDoc.email || decoded.email || "").trim().toLowerCase(),
      credentialId,
      publicKey: toBase64Url(savedCredential.publicKey),
      counter: savedCredential.counter || 0,
      transports: credential?.response?.transports || savedCredential.transports || [],
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastUsedAt: null,
    });

    await adminPatchDocument("users", decoded.uid, {
      passkeyEnabled: true,
      passkeyRegisteredAt: now,
      updatedAt: now,
    });

    await adminPatchDocument("passkeyChallenges", decoded.uid, {
      registrationChallenge: null,
      registrationExpiresAt: null,
      updatedAt: now,
    });

    await adminCreateDocument("adminAuditLogs", {
      action: "passkey_registered",
      adminUid: decoded.uid,
      adminEmail: userDoc.email || decoded.email || "",
      targetUid: decoded.uid,
      targetEmail: userDoc.email || decoded.email || "",
      details: { credentialId },
      createdAt: now,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Passkey registration verify failed", err);
    return passkeyError(err?.message || "Could not verify passkey setup.", 500);
  }
}
