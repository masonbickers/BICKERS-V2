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
  return Response.json({ ...result, setupRequired: false, canManageRules: access.canManageRules, variant: access.variant });
}
