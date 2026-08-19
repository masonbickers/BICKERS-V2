import { adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { resolveAppearanceForCompany } from "@/app/api/_appearance";
import { readBearerToken, verifyFirebaseIdToken } from "@/app/api/admin/_lib";
import { getDeploymentConfig, getPublicDeploymentConfig } from "@/app/config/deploymentConfig";
import { DEFAULT_CONTENT_LABELS, normalizeContentLabels } from "@/app/utils/contentLabels";
import { DEFAULT_GLOBAL_THEME, normalizeGlobalTheme } from "@/app/utils/globalTheme";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const token = readBearerToken(req);
    const deployment = getDeploymentConfig();
    const publicDeployment = getPublicDeploymentConfig();
    let companyId = deployment.companyId;
    if (token) {
      const verified = await verifyFirebaseIdToken(token);
      if (!verified?.uid) return Response.json({ error: "Not signed in." }, { status: 401 });
      const user = await adminReadDocument("users", verified.uid);
      if (user?.isEnabled === false) return Response.json({ error: "Account disabled." }, { status: 403 });
      companyId = String(user?.companyId || deployment.companyId).trim();
    } else {
      return Response.json({
        companyId: deployment.companyId,
        theme: normalizeGlobalTheme({
          ...DEFAULT_GLOBAL_THEME,
          appName: publicDeployment.displayName,
          companyLogo: publicDeployment.companyLogoUrl,
        }),
        labels: normalizeContentLabels({
          ...DEFAULT_CONTENT_LABELS,
          "app.name": publicDeployment.displayName,
          "login.title": publicDeployment.displayName,
        }),
        themeVersion: 0,
        labelsVersion: 0,
      }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
    }
    const appearance = await resolveAppearanceForCompany(companyId);
    return Response.json(appearance, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[appearance] Resolution failed:", error);
    return Response.json({ error: "Appearance could not be loaded." }, { status: 500 });
  }
}
