import {
  adminCreateDocument,
  adminPatchDocument,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import { requireAdminFromRequest } from "@/app/api/admin/_lib";
import { normalizeThemeSettings } from "@/app/utils/themeSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_COLLECTION = "settings";
const SETTINGS_DOCUMENT = "platformBranding";

export async function GET() {
  try {
    const document = (await adminReadDocument(SETTINGS_COLLECTION, SETTINGS_DOCUMENT)) || {};
    return Response.json(
      { theme: normalizeThemeSettings(document.theme) },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[theme] load failed", error);
    return Response.json({ theme: normalizeThemeSettings({}) }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;

    const body = await req.json().catch(() => ({}));
    const beforeDocument = (await adminReadDocument(SETTINGS_COLLECTION, SETTINGS_DOCUMENT)) || {};
    const before = normalizeThemeSettings(beforeDocument.theme);
    const theme = normalizeThemeSettings(body.theme);
    const updatedAt = new Date().toISOString();

    await adminPatchDocument(SETTINGS_COLLECTION, SETTINGS_DOCUMENT, {
      theme,
      updatedAt,
      updatedBy: admin.verifiedUser.email || "admin",
      updatedByUid: admin.verifiedUser.uid,
    });

    await adminCreateDocument("adminAuditLogs", {
      actorUid: admin.verifiedUser.uid,
      actorEmail: admin.verifiedUser.email || "",
      actorRole: admin.userData?.role || "admin",
      targetType: "settings",
      targetId: `${SETTINGS_COLLECTION}/${SETTINGS_DOCUMENT}`,
      action: "Updated global styling",
      area: "Global Styling",
      before,
      after: theme,
      createdAt: updatedAt,
    });

    return Response.json({ ok: true, theme });
  } catch (error) {
    console.error("[theme] save failed", error);
    return Response.json({ error: error?.message || "Could not save global styling." }, { status: 500 });
  }
}
