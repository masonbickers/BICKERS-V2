import "server-only";

import { adminListDocuments, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { jsonError, requireActiveUserFromRequest } from "@/app/api/admin/_lib";
import { isAccountDisabled } from "@/app/utils/accountAccess";
import { getDeploymentConfig } from "@/app/config/deploymentConfig";

const FINANCE_ROLES = new Set([
  "admin",
  "companyadmin",
  "company admin",
  "platformadmin",
  "platform admin",
  "superadmin",
  "super admin",
  "finance",
  "financemanager",
  "finance manager",
]);

export function isReceiptFinanceUser(userData = {}) {
  return FINANCE_ROLES.has(String(userData.role || "").trim().toLowerCase()) || userData.financeAccess === true;
}

export function receiptActor(access = {}) {
  const data = access.userData || {};
  return {
    uid: access.verifiedUser?.uid || data.uid || "",
    name: data.name || data.displayName || data.email || access.verifiedUser?.email || "User",
  };
}

export function receiptCompanyId(userData = {}) {
  return String(userData.companyId || getDeploymentConfig().companyId).trim();
}

export function canAccessReceiptCompany(userData = {}, companyId = "") {
  const role = String(userData.role || "").trim().toLowerCase().replace(/\s/g, "");
  return ["platformadmin", "superadmin"].includes(role) || receiptCompanyId(userData) === String(companyId || "").trim();
}

export async function requireReceiptUser(request) {
  const active = await requireActiveUserFromRequest(request, { module: "receipts" });
  if (active.error) return active;
  const rawUserData = await adminReadDocument("users", active.verifiedUser.uid);
  return { ...active, userData: rawUserData || active.userData };
}

export async function requireReceiptFinance(request) {
  const access = await requireReceiptUser(request);
  if (access.error) return access;
  if (!isReceiptFinanceUser(access.userData)) {
    return { error: jsonError("Finance receipt access is required.", 403) };
  }
  return access;
}

export async function companyReceiptRows(companyId) {
  const documents = await adminListDocuments("receipts");
  return documents
    .map((row) => ({ id: row.id, ...(row.data || {}) }))
    .filter((row) => String(row.companyId || "") === companyId);
}

export function activeReceiptParticipant(row = {}, companyId = "") {
  return String(row.companyId || "") === companyId && !isAccountDisabled(row) && row.isEnabled === true;
}
