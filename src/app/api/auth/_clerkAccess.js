import { auth, currentUser } from "@clerk/nextjs/server";
import { adminListDocuments } from "@/app/api/_firebaseAdminRest";
import { hasCanonicalAccessRecord, hasCompanyAccess, isAccountDisabled } from "@/app/utils/accountAccess";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

export function verifiedPrimaryEmail(clerkUser) {
  const addresses = Array.isArray(clerkUser?.emailAddresses) ? clerkUser.emailAddresses : [];
  const address = addresses.find((item) => item.id === clerkUser?.primaryEmailAddressId) || addresses[0];
  return String(address?.verification?.status || "").toLowerCase() === "verified"
    ? normalizeEmail(address?.emailAddress)
    : "";
}

export async function requireActiveClerkUser() {
  const session = await auth();
  if (!session?.isAuthenticated || !session?.userId) {
    return { error: Response.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  const clerkUser = await currentUser();
  const email = verifiedPrimaryEmail(clerkUser);
  if (!email) return { error: Response.json({ error: "Verified email required." }, { status: 403 }) };

  const users = await adminListDocuments("users");
  const matches = users.filter(({ data }) =>
    [data?.email, data?.workEmail, data?.emailAddress].map(normalizeEmail).includes(email)
  );
  if (matches.length !== 1 || !hasCanonicalAccessRecord(matches[0]?.data)) {
    return { error: Response.json({ error: "Canonical account link required." }, { status: 403 }) };
  }
  const userData = matches[0].data;
  if (isAccountDisabled(userData)) {
    return { error: Response.json({ error: "Account disabled." }, { status: 403 }) };
  }
  if (!hasCompanyAccess(userData) && String(userData.role || "").toLowerCase() !== "platformadmin") {
    return { error: Response.json({ error: "Company access is not configured." }, { status: 403 }) };
  }
  return { clerkUser, email, userData };
}
