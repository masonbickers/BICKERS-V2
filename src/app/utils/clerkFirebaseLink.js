import { isAccountDisabled } from "./accountAccess.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const safeUid = (value) =>
  String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);

export function preferredVerifiedEmail(clerkUser) {
  const addresses = Array.isArray(clerkUser?.emailAddresses) ? clerkUser.emailAddresses : [];
  const primary = addresses.find((entry) => entry.id === clerkUser?.primaryEmailAddressId) || addresses[0];
  return String(primary?.verification?.status || "").toLowerCase() === "verified"
    ? normalizeEmail(primary?.emailAddress)
    : "";
}

export function chooseLinkedUid(userMatches = [], employeeMatches = []) {
  const activeUsers = userMatches.filter(({ data }) => !isAccountDisabled(data));
  const stableUser =
    activeUsers.find(({ id, data }) => safeUid(id) && safeUid(id) === safeUid(data?.uid)) ||
    activeUsers[0];
  if (stableUser) return safeUid(stableUser.data?.uid || stableUser.id);

  const activeEmployee = employeeMatches.find(
    ({ data }) => !isAccountDisabled(data) && safeUid(data?.authUid || data?.uid)
  );
  return safeUid(activeEmployee?.data?.authUid || activeEmployee?.data?.uid);
}
