import { normalizeServerRole, requireActiveUserFromRequest } from "@/app/api/admin/_lib";

const enabled = (userData, key) => {
  const flags = userData?.featureFlags || userData?.features || {};
  return flags?.[key] !== false;
};

export async function requireStatisticsUser(req) {
  const access = await requireActiveUserFromRequest(req, { module: "statistics" });
  if (access.error) return access;
  const { idToken, verifiedUser, userData } = access;
  if (!enabled(userData, "statistics")) {
    return { error: Response.json({ error: "Statistics access is disabled." }, { status: 403 }) };
  }

  const role = normalizeServerRole(userData.role);
  const management = role === "admin" || role === "platformAdmin";
  return {
    idToken,
    verifiedUser,
    userData,
    companyId: String(userData.companyId || "").trim(),
    role,
    variant: management && enabled(userData, "finance") ? "management" : "booking",
    canManageRules: management,
  };
}
