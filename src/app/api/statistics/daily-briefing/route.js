import { adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { requireStatisticsUser } from "@/app/api/statistics/_auth";
import { readLatestBriefing } from "@/app/api/statistics/_briefingService";

export async function GET(req) {
  const access = await requireStatisticsUser(req);
  if (access.error) return access.error;
  const published = await adminReadDocument("aiBusinessRules", `${access.companyId}_published`);
  if (!published?.version) {
    return Response.json({
      briefing: null,
      setupRequired: true,
      canManageRules: access.canManageRules,
      variant: access.variant,
    });
  }
  const result = await readLatestBriefing(access.companyId, access.variant);
  const briefing = result.briefing ? { ...result.briefing } : null;
  if (briefing) {
    delete briefing.generationError;
    delete briefing.sourceSnapshotHash;
  }
  return Response.json({ ...result, briefing, stale: result.stale || briefing?.stale === true, setupRequired: false, canManageRules: access.canManageRules, variant: access.variant });
}
