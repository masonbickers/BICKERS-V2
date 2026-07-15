import { adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { normalizeServerRole, readBearerToken, verifyFirebaseIdToken } from "@/app/api/admin/_lib";

const enabled = (userData, key) => {
  const flags = userData?.featureFlags || userData?.features || {};
  return flags?.[key] !== false;
};

export async function requireStatisticsUser(req) {
  const idToken = readBearerToken(req);
  const verifiedUser = await verifyFirebaseIdToken(idToken);
  if (!verifiedUser?.uid) return { error: Response.json({ error: "Not signed in." }, { status: 401 }) };

  const userData = await adminReadDocument("users", verifiedUser.uid);
  if (!userData || userData.isEnabled === false) {
    return { error: Response.json({ error: "Account disabled or unavailable." }, { status: 403 }) };
  }
  if (!enabled(userData, "statistics")) {
    return { error: Response.json({ error: "Statistics access is disabled." }, { status: 403 }) };
  }

  const role = normalizeServerRole(userData.role);
  const management = role === "admin" || role === "platformAdmin";
  return {
    idToken,
    verifiedUser,
    userData,
    companyId: String(userData.companyId || "bickers-action").trim() || "bickers-action",
    role,
    variant: management && enabled(userData, "finance") ? "management" : "booking",
    canManageRules: management,
  };
}
