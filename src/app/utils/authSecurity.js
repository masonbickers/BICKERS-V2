export function isPhoneVerified(userData = {}) {
  return userData?.phoneVerified === true;
}

export function hasAuthenticatorMfa(userData = {}) {
  return (
    userData?.mfaEnabled === true
    && typeof userData?.mfaSecret === "string"
    && userData.mfaSecret.trim().length > 0
  );
}

export function getMfaVerifiedStorageKey(uid) {
  return `mfa:verified:${uid}`;
}

export function getPendingMfaSetupStorageKey(uid) {
  return `mfa:pending-setup:${uid}`;
}

export function isMfaVerified(storage, uid) {
  if (!storage || !uid) return false;
  try {
    return storage.getItem(getMfaVerifiedStorageKey(uid)) === "true";
  } catch {
    return false;
  }
}

export function markMfaVerified(storage, uid) {
  if (!storage || !uid) return;
  try {
    storage.setItem(getMfaVerifiedStorageKey(uid), "true");
  } catch {}
}

export function clearMfaVerified(storage, uid) {
  if (!storage || !uid) return;
  try {
    storage.removeItem(getMfaVerifiedStorageKey(uid));
  } catch {}
}

export function getPendingMfaSetup(storage, uid) {
  if (!storage || !uid) return null;
  try {
    const raw = storage.getItem(getPendingMfaSetupStorageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const base32 = String(parsed.base32 || "").trim();
    const otpauthUrl = String(parsed.otpauthUrl || "").trim();
    if (!base32 || !otpauthUrl) return null;
    return { base32, otpauthUrl };
  } catch {
    return null;
  }
}

export function setPendingMfaSetup(storage, uid, value) {
  if (!storage || !uid || !value) return;
  try {
    storage.setItem(
      getPendingMfaSetupStorageKey(uid),
      JSON.stringify({
        base32: String(value.base32 || "").trim(),
        otpauthUrl: String(value.otpauthUrl || "").trim(),
      })
    );
  } catch {}
}

export function clearPendingMfaSetup(storage, uid) {
  if (!storage || !uid) return;
  try {
    storage.removeItem(getPendingMfaSetupStorageKey(uid));
  } catch {}
}
