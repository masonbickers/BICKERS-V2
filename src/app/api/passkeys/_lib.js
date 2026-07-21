import { NextResponse } from "next/server";
import { adminListDocuments, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { hasCanonicalAccessRecord, hasCompanyAccess, isAccountDisabled } from "@/app/utils/accountAccess";

export const runtime = "nodejs";

export const RP_NAME = "Bickers Booking";

export function passkeyError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function getPasskeyRequestMeta(req) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .split(",")[0]
    .trim();
  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const cleanHost = host || "localhost";
  const hostname = cleanHost.split(":")[0];
  const rpID = process.env.PASSKEY_RP_ID || hostname;
  const origin =
    process.env.PASSKEY_ORIGIN ||
    `${hostname === "localhost" ? "http" : proto}://${cleanHost}`;

  return { origin, rpID };
}

export function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

export async function requireActiveUser(uid) {
  const userDoc = await adminReadDocument("users", uid);
  const isPlatformAdmin = String(userDoc?.role || "").trim() === "platformAdmin";
  if (!hasCanonicalAccessRecord(userDoc) || isAccountDisabled(userDoc) || (!hasCompanyAccess(userDoc) && !isPlatformAdmin)) {
    throw new Error("This account is disabled or does not have access.");
  }
  return userDoc;
}

export async function findUserByEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.endsWith("@bickers.co.uk")) return null;

  const users = await adminListDocuments("users");
  return (
    users.find(({ data }) => String(data?.email || "").trim().toLowerCase() === cleanEmail) ||
    null
  );
}

export async function listPasskeysForUid(uid) {
  const passkeys = await adminListDocuments("passkeyCredentials");
  return passkeys
    .filter(({ data }) => data?.uid === uid)
    .map(({ id, data }) => ({ id, ...data }));
}

export async function findPasskeyCredential(credentialId) {
  const credential = await adminReadDocument("passkeyCredentials", credentialId);
  return credential ? { id: credentialId, ...credential } : null;
}

export function isFreshChallenge(challengeDoc, challengeField, expiresAtField) {
  const expiresAt = challengeDoc?.[expiresAtField];
  return (
    !!challengeDoc?.[challengeField] &&
    !!expiresAt &&
    new Date(expiresAt).getTime() > Date.now()
  );
}
