import { adminPatchDocument, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { jsonError } from "@/app/api/admin/_lib";
import { cleanId, jsonOk, requirePlatformAdmin, writePlatformAudit } from "../../_lib";

export const runtime = "nodejs";

const COMPANY_STATUSES = new Set(["active", "suspended", "archived"]);

function cleanCompanyPatch(raw = {}) {
  const patch = {};
  if ("name" in raw) patch.name = String(raw.name || "").trim().slice(0, 120);
  if ("companyName" in raw) patch.name = String(raw.companyName || "").trim().slice(0, 120);
  if ("domain" in raw) patch.domain = String(raw.domain || "").trim().toLowerCase().slice(0, 120);
  if ("status" in raw) {
    const status = String(raw.status || "").trim().toLowerCase();
    if (!COMPANY_STATUSES.has(status)) throw new Error("Invalid company status.");
    patch.status = status;
  }
  if ("plan" in raw) patch.plan = String(raw.plan || "").trim().toLowerCase().slice(0, 60);
  if ("maxUsers" in raw) patch.maxUsers = Math.max(1, Math.min(100000, Number.parseInt(raw.maxUsers, 10) || 1));
  if (raw.modules && typeof raw.modules === "object") patch.modules = raw.modules;
  if (raw.security && typeof raw.security === "object") patch.security = raw.security;
  if (raw.limits && typeof raw.limits === "object") patch.limits = raw.limits;
  if (raw.featureFlags && typeof raw.featureFlags === "object") patch.featureFlags = raw.featureFlags;
  return patch;
}

export async function POST(req) {
  try {
    const admin = await requirePlatformAdmin(req);
    if (admin.error) return admin.error;

    const body = await req.json().catch(() => ({}));
    const companyId = cleanId(body.companyId || body.id).toLowerCase();
    if (!companyId || companyId.includes("/")) return jsonError("Valid companyId is required.", 400);

    const before = await adminReadDocument("platformCompanies", companyId);
    if (!before) return jsonError("Company not found.", 404);

    const patch = cleanCompanyPatch(body.patch || body);
    if (!Object.keys(patch).length) return jsonError("No supported company fields supplied.", 400);

    const nowIso = new Date().toISOString();
    const after = {
      ...before,
      ...patch,
      createdAt: before.createdAt || nowIso,
      updatedAt: nowIso,
      updatedBy: admin.verifiedUser.email || "platform-admin",
      updatedByUid: admin.verifiedUser.uid,
    };

    await adminPatchDocument("platformCompanies", companyId, after);
    await writePlatformAudit(req, admin.verifiedUser, {
      action: cleanId(body.action) || "Updated platform company",
      targetType: "company",
      targetId: companyId,
      companyId,
      before,
      after,
      details: { changedFields: Object.keys(patch) },
    });

    return jsonOk({ company: { id: companyId, ...after } });
  } catch (error) {
    console.error("[platform/companies/update] failed:", error);
    return jsonError(error?.message || "Could not update company.", 500);
  }
}
