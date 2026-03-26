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

export function getMfaBypassStorageKey(uid) {
  return `mfa:bypass:${uid}`;
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

export function isMfaBypassed(storage, uid) {
  if (!storage || !uid) return false;
  try {
    return storage.getItem(getMfaBypassStorageKey(uid)) === "true";
  } catch {
    return false;
  }
}

export function markMfaBypassed(storage, uid) {
  if (!storage || !uid) return;
  try {
    storage.setItem(getMfaBypassStorageKey(uid), "true");
  } catch {}
}

export function clearMfaBypassed(storage, uid) {
  if (!storage || !uid) return;
  try {
    storage.removeItem(getMfaBypassStorageKey(uid));
  } catch {}
}
