import { adminPatchDocument } from "@/app/api/_firebaseAdminRest";
import { requireActiveUserFromRequest } from "@/app/api/admin/_lib";
import { ACTIVITY_POLICY_VERSION } from "@/app/utils/activityTracking";

export async function POST(req) {
  try {
    const active = await requireActiveUserFromRequest(req);
    if (active.error) return active.error;
    const body = await req.json().catch(() => ({}));
    const version = String(body?.version || ACTIVITY_POLICY_VERSION).slice(0, 80);
    await adminPatchDocument("users", active.verifiedUser.uid, {
      activityTrackingNoticeVersion: version,
      activityTrackingNoticeShownAt: new Date().toISOString(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Activity notice acknowledgement failed:", error);
    return Response.json({ error: "The notice could not be recorded." }, { status: 500 });
  }
}
