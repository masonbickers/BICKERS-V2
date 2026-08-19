import { adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { resolveAppearanceForCompany } from "@/app/api/_appearance";
import { readBearerToken, verifyFirebaseIdToken } from "@/app/api/admin/_lib";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const token = readBearerToken(req);
    let companyId = "";
    if (token) {
      const verified = await verifyFirebaseIdToken(token);
      if (!verified?.uid) return Response.json({ error: "Not signed in." }, { status: 401 });
      const user = await adminReadDocument("users", verified.uid);
      if (user?.isEnabled === false) return Response.json({ error: "Account disabled." }, { status: 403 });
      companyId = String(user?.companyId || "bickers-action").trim();
    }
    const appearance = await resolveAppearanceForCompany(companyId);
    return Response.json(appearance, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[appearance] Resolution failed:", error);
    return Response.json({ error: "Appearance could not be loaded." }, { status: 500 });
  }
}
