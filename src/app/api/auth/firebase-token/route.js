import { auth, currentUser } from "@clerk/nextjs/server";
import {
  adminListDocuments,
  createFirebaseCustomToken,
} from "@/app/api/_firebaseAdminRest";

export const runtime = "nodejs";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const safeUid = (value) =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 128);

const isDisabled = (record = {}) =>
  record.isEnabled === false ||
  record.active === false ||
  record.archived === true ||
  record.isArchived === true ||
  record.disabled === true ||
  record.appDisabled === true ||
  String(record.role || "").trim().toLowerCase() === "archived";

const recordEmails = (record = {}) =>
  ["email", "workEmail", "personalEmail", "emailAddress", "contactEmail"]
    .map((key) => normalizeEmail(record[key]))
    .filter(Boolean);

function preferredEmail(clerkUser) {
  const primaryId = clerkUser?.primaryEmailAddressId;
  const addresses = Array.isArray(clerkUser?.emailAddresses) ? clerkUser.emailAddresses : [];
  return normalizeEmail(
    addresses.find((entry) => entry.id === primaryId)?.emailAddress || addresses[0]?.emailAddress
  );
}

function chooseUid(userMatches, employeeMatches) {
  const activeUsers = userMatches.filter(({ data }) => !isDisabled(data));
  const stableUser =
    activeUsers.find(({ id, data }) => safeUid(id) && safeUid(id) === safeUid(data?.uid)) ||
    activeUsers[0];
  if (stableUser) return safeUid(stableUser.data?.uid || stableUser.id);

  const activeEmployee = employeeMatches.find(({ data }) => !isDisabled(data));
  return safeUid(
    activeEmployee?.data?.authUid ||
      activeEmployee?.data?.uid ||
      activeEmployee?.id
  );
}

export async function POST() {
  try {
    const { isAuthenticated, userId: clerkUserId } = await auth();
    if (!isAuthenticated || !clerkUserId) {
      return Response.json({ error: "Not signed in with Clerk." }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const email = preferredEmail(clerkUser);
    if (!email.endsWith("@bickers.co.uk")) {
      return Response.json({ error: "Only @bickers.co.uk accounts can access this app." }, { status: 403 });
    }

    const [users, employees] = await Promise.all([
      adminListDocuments("users"),
      adminListDocuments("employees"),
    ]);
    const userMatches = users.filter(({ data }) => recordEmails(data).includes(email));
    const employeeMatches = employees.filter(({ data }) => recordEmails(data).includes(email));

    if (userMatches.some(({ data }) => isDisabled(data))) {
      return Response.json({ error: "This account has been disabled." }, { status: 403 });
    }

    const uid = chooseUid(userMatches, employeeMatches);
    if (!uid) {
      return Response.json(
        { error: "No linked Bickers employee or user record was found for this Clerk account." },
        { status: 403 }
      );
    }

    const customToken = createFirebaseCustomToken(uid, {
      authMethod: "clerk",
      clerkUserId,
      companyEmail: email,
    });

    return Response.json({ customToken, uid, email });
  } catch (error) {
    console.error("[clerk-firebase-token] failed:", error);
    return Response.json({ error: "Could not start the application session." }, { status: 500 });
  }
}
