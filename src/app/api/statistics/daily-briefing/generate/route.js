import { adminCreateDocument } from "@/app/api/_firebaseAdminRest";
import { requireAdminFromRequest } from "@/app/api/admin/_lib";
import { generateDailyBriefings } from "@/app/api/statistics/_briefingService";
import { londonClock } from "@/app/utils/londonTime";

const cronAuthorised = (req) => {
  const secret = process.env.CRON_SECRET || "";
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
};

export async function GET(req) {
  if (!cronAuthorised(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const clock = londonClock();
  if (clock.hour !== 6) return Response.json({ skipped: true, reason: "Outside the 06:00 Europe/London generation window." });
  const result = await generateDailyBriefings({ companyId: "bickers-action" });
  return Response.json(result);
}

export async function POST(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin.error;
  const body = await req.json().catch(() => ({}));
  const companyId = String(admin.userData?.companyId || "bickers-action").trim() || "bickers-action";
  const result = await generateDailyBriefings({ companyId, force: body.force === true });
  await adminCreateDocument("adminAuditLogs", {
    action: "ai-statistics-briefing-generated",
    companyId,
    actorUid: admin.verifiedUser.uid,
    actorEmail: admin.verifiedUser.email,
    forced: body.force === true,
    result: result.skipped ? "skipped" : "generated",
    createdAt: new Date().toISOString(),
  });
  return Response.json(result);
}
