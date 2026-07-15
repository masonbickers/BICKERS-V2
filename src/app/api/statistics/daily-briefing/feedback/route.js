import { adminCreateDocument } from "@/app/api/_firebaseAdminRest";
import { requireStatisticsUser } from "@/app/api/statistics/_auth";

export async function POST(req) {
  const access = await requireStatisticsUser(req);
  if (access.error) return access.error;
  const body = await req.json().catch(() => ({}));
  const eventType = String(body.eventType || "feedback");
  if (!["feedback", "action_clicked", "briefing_viewed"].includes(eventType)) {
    return Response.json({ error: "Unsupported briefing event." }, { status: 400 });
  }
  if (eventType === "feedback" && !["useful", "not_useful"].includes(body.rating)) {
    return Response.json({ error: "Choose useful or not useful." }, { status: 400 });
  }
  await adminCreateDocument("aiInsightFeedback", {
    companyId: access.companyId,
    briefingDate: String(body.briefingDate || "").slice(0, 10),
    variant: access.variant,
    insightId: String(body.insightId || "briefing").slice(0, 100),
    eventType,
    rating: eventType === "feedback" ? body.rating : "",
    reason: String(body.reason || "").trim().slice(0, 500),
    userUid: access.verifiedUser.uid,
    userEmail: access.verifiedUser.email,
    createdAt: new Date().toISOString(),
  });
  return Response.json({ ok: true });
}
