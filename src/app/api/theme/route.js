import { resolveAppearanceForCompany } from "@/app/api/_appearance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const appearance = await resolveAppearanceForCompany();
    return Response.json({ theme: appearance.theme, version: appearance.themeVersion }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[theme] Could not load global styling:", error);
    return Response.json({ error: "Global styling could not be loaded." }, { status: 500 });
  }
}
