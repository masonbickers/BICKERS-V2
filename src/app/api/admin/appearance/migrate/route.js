import { adminCreateDocument, adminListDocuments, adminPatchDocument } from "@/app/api/_firebaseAdminRest";
import { loadCompanyAppearanceState, loadPlatformAppearanceState } from "@/app/api/_appearance";
import { jsonError, requirePlatformAdminFromRequest } from "@/app/api/admin/_lib";

export async function POST(req) {
  const admin = await requirePlatformAdminFromRequest(req);
  if (admin.error) return admin.error;
  try {
    const platform = await loadPlatformAppearanceState();
    await adminPatchDocument("companyAppearances", platform.companyId, platform);
    const companies = await adminListDocuments("platformCompanies");
    const migrated = [];
    for (const { id } of companies) {
      const state = await loadCompanyAppearanceState(id, platform);
      await adminPatchDocument("companyAppearances", id, state);
      migrated.push(id);
    }
    await adminCreateDocument("adminAuditLogs", {
      action: "Migrated legacy branding and global styling",
      area: "Appearance",
      actorUid: admin.verifiedUser.uid,
      actorEmail: admin.verifiedUser.email || "",
      actorRole: "platformAdmin",
      targetType: "appearanceMigration",
      targetId: "companyAppearances",
      migratedCompanies: migrated,
      createdAt: new Date().toISOString(),
    });
    return Response.json({ ok: true, platform: true, migratedCompanies: migrated });
  } catch (error) {
    console.error("[appearance] Migration failed:", error);
    return jsonError("Legacy appearance settings could not be migrated.", 500);
  }
}
