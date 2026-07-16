import { adminCreateDocument, adminListDocuments, adminPatchDocument, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { loadCompanyAppearanceState, loadPlatformAppearanceState } from "@/app/api/_appearance";
import {
  adminCompanyId,
  canAccessCompany,
  isPlatformAdminAccess,
  jsonError,
  requireAdminFromRequest,
} from "@/app/api/admin/_lib";
import { appearanceVersionId, createAppearanceState, normalizeCompanyId, PLATFORM_APPEARANCE_ID } from "@/app/utils/appearanceModel";
import { normalizeContentLabels, validateContentLabels } from "@/app/utils/contentLabels";
import { normalizeGlobalTheme, validateThemeContrast } from "@/app/utils/globalTheme";

const validSection = (value) => value === "labels" ? "labels" : value === "theme" ? "theme" : "";

function requestedCompanyId(admin, raw) {
  const fallback = adminCompanyId(admin.userData) || "bickers-action";
  const companyId = normalizeCompanyId(raw, fallback);
  if (companyId === PLATFORM_APPEARANCE_ID && !isPlatformAdminAccess(admin.userData)) return "";
  return canAccessCompany(admin.userData, companyId) ? companyId : "";
}

async function loadState(companyId) {
  if (companyId === PLATFORM_APPEARANCE_ID) return loadPlatformAppearanceState();
  const platform = await loadPlatformAppearanceState();
  return loadCompanyAppearanceState(companyId, platform);
}

async function writeState(state) {
  await adminPatchDocument("companyAppearances", state.companyId, state);
}

async function audit(req, admin, action, companyId, section, before, after, version = 0) {
  try {
    await adminCreateDocument("adminAuditLogs", {
      action,
      area: "Appearance",
      actorUid: admin.verifiedUser.uid,
      actorEmail: admin.verifiedUser.email || "",
      actorRole: admin.userData.role || "admin",
      targetType: "companyAppearance",
      targetId: companyId,
      companyId: companyId === PLATFORM_APPEARANCE_ID ? "" : companyId,
      section,
      version,
      before,
      after,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[appearance] Audit log failed:", error);
  }
}

function publicState(state, companies = []) {
  return {
    companyId: state.companyId,
    schemaVersion: state.schemaVersion,
    theme: { ...state.theme, history: [] },
    labels: { ...state.labels, history: [] },
    companies,
  };
}

export async function GET(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin.error;
  const url = new URL(req.url);
  const companyId = requestedCompanyId(admin, url.searchParams.get("companyId"));
  if (!companyId) return jsonError("You cannot manage this company appearance.", 403);
  try {
    const historySection = validSection(url.searchParams.get("history"));
    if (historySection) {
      const versions = await adminListDocuments("appearanceVersions");
      const history = versions
        .map(({ data }) => data)
        .filter((item) => item?.companyId === companyId && item?.section === historySection)
        .map(({ version, publishedAt, publishedBy }) => ({ version, publishedAt, publishedBy }))
        .sort((a, b) => Number(b.version) - Number(a.version));
      return Response.json({ companyId, section: historySection, history }, { headers: { "Cache-Control": "no-store" } });
    }
    const state = await loadState(companyId);
    let companies = [];
    if (isPlatformAdminAccess(admin.userData) && url.searchParams.get("includeCompanies") === "1") {
      const rows = await adminListDocuments("platformCompanies");
      companies = rows.map(({ id, data }) => ({ id, name: data?.name || id, active: data?.active !== false })).sort((a, b) => a.name.localeCompare(b.name));
    }
    return Response.json(publicState(state, companies), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[appearance] Admin load failed:", error);
    return jsonError("Appearance settings could not be loaded.", 500);
  }
}

export async function PATCH(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin.error;
  try {
    const body = await req.json().catch(() => ({}));
    const companyId = requestedCompanyId(admin, body.companyId);
    const section = validSection(body.section);
    if (!companyId) return jsonError("You cannot manage this company appearance.", 403);
    if (!section) return jsonError("A valid appearance section is required.", 400);
    const current = await loadState(companyId);
    if (body.expectedVersion != null && Number(body.expectedVersion) !== Number(current[section].version)) return jsonError("This draft is out of date. Refresh before saving.", 409);
    const draft = section === "theme" ? normalizeGlobalTheme(body.draft) : normalizeContentLabels(body.draft);
    const validation = section === "theme" ? validateThemeContrast(draft) : validateContentLabels(body.draft);
    if (section === "labels" && !validation.valid) return Response.json({ error: "Some labels are invalid.", validation }, { status: 400 });
    const now = new Date().toISOString();
    const next = createAppearanceState({ companyId, existing: current });
    next[section] = { ...next[section], draft, draftUpdatedAt: now, draftUpdatedBy: admin.verifiedUser.email || "admin" };
    await writeState(next);
    await audit(req, admin, `Saved ${section} draft`, companyId, section, current[section].draft, draft, current[section].version);
    return Response.json({ ok: true, companyId, section: next[section], validation });
  } catch (error) {
    console.error("[appearance] Draft save failed:", error);
    return jsonError("Appearance draft could not be saved.", 500);
  }
}

export async function POST(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin.error;
  try {
    const body = await req.json().catch(() => ({}));
    const companyId = requestedCompanyId(admin, body.companyId);
    const section = validSection(body.section);
    const action = String(body.action || "");
    if (!companyId) return jsonError("You cannot manage this company appearance.", 403);
    if (!section || !["publish", "discard", "restore"].includes(action)) return jsonError("A valid appearance action is required.", 400);
    const current = await loadState(companyId);
    if (body.expectedVersion != null && Number(body.expectedVersion) !== Number(current[section].version)) return jsonError("This appearance changed in another session. Refresh and try again.", 409);
    const now = new Date().toISOString();
    const actor = admin.verifiedUser.email || "admin";
    const next = createAppearanceState({ companyId, existing: current });

    if (action === "discard") {
      const before = next[section].draft;
      next[section] = { ...next[section], draft: next[section].published, draftUpdatedAt: now, draftUpdatedBy: actor };
      await writeState(next);
      await audit(req, admin, `Discarded ${section} draft`, companyId, section, before, next[section].draft, next[section].version);
      return Response.json({ ok: true, companyId, section: next[section] });
    }

    if (action === "restore") {
      const version = Math.max(1, Number(body.version || 0));
      const snapshot = await adminReadDocument("appearanceVersions", appearanceVersionId(companyId, section, version));
      if (!snapshot?.value) return jsonError("That appearance version was not found.", 404);
      const restored = section === "theme" ? normalizeGlobalTheme(snapshot.value) : normalizeContentLabels(snapshot.value);
      const before = next[section].draft;
      next[section] = { ...next[section], draft: restored, draftUpdatedAt: now, draftUpdatedBy: actor };
      await writeState(next);
      await audit(req, admin, `Restored ${section} version ${version} to draft`, companyId, section, before, restored, next[section].version);
      return Response.json({ ok: true, companyId, section: next[section] });
    }

    const draft = section === "theme" ? normalizeGlobalTheme(next[section].draft) : normalizeContentLabels(next[section].draft);
    const validation = section === "theme" ? validateThemeContrast(draft) : validateContentLabels(draft);
    if (!validation.valid) return Response.json({ error: section === "theme" ? "Critical colour contrast checks must pass before publishing." : "Some labels are invalid.", validation }, { status: 400 });
    const version = Number(next[section].version || 0) + 1;
    await adminPatchDocument("appearanceVersions", appearanceVersionId(companyId, section, version), { companyId, section, version, value: draft, publishedAt: now, publishedBy: actor });
    const before = next[section].published;
    next[section] = {
      ...next[section],
      draft,
      published: draft,
      version,
      publishedAt: now,
      publishedBy: actor,
      history: [],
    };
    await writeState(next);
    await audit(req, admin, `Published ${section} version ${version}`, companyId, section, before, draft, version);
    return Response.json({ ok: true, companyId, section: next[section], validation });
  } catch (error) {
    console.error("[appearance] Action failed:", error);
    return jsonError("Appearance action could not be completed.", 500);
  }
}
