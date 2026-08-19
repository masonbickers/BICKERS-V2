import {
  adminPatchDocument,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import { requireActiveUserFromRequest } from "@/app/api/admin/_lib";
import {
  ACTIVITY_BUCKET_MINUTES,
  ACTIVITY_POLICY_VERSION,
  activityCategoryForPath,
  describeScheduleForDate,
  isInsideWorkSchedule,
  normalizeActivitySettings,
  normalizeWorkSchedule,
  workspaceForPath,
  zonedDateParts,
} from "@/app/utils/activityTracking";

const safeSessionId = (value) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

export async function GET(req) {
  try {
    const active = await requireActiveUserFromRequest(req);
    if (active.error) return active.error;
    const companyId = String(active.userData?.companyId || active.verifiedUser?.identityCompanyId || "").trim();
    const settings = normalizeActivitySettings(
      companyId ? (await adminReadDocument("activityTrackingSettings", companyId)) || {} : {}
    );
    const policyVersion = settings.policyVersion || ACTIVITY_POLICY_VERSION;
    return Response.json({
      ok: true,
      enabled: settings.enabled,
      idleMinutes: settings.idleMinutes,
      policyVersion,
      noticeRequired: String(active.userData?.activityTrackingNoticeVersion || "") !== policyVersion,
    });
  } catch (error) {
    console.error("Activity settings probe failed:", error);
    return Response.json({ error: "Activity settings could not be loaded." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const active = await requireActiveUserFromRequest(req);
    if (active.error) return active.error;

    const body = await req.json().catch(() => ({}));
    const companyId = String(active.userData?.companyId || active.verifiedUser?.identityCompanyId || "").trim();
    if (!companyId) return Response.json({ error: "Company access is not configured." }, { status: 403 });

    const settings = normalizeActivitySettings(
      (await adminReadDocument("activityTrackingSettings", companyId)) || {}
    );
    if (!settings.enabled) {
      return Response.json({ ok: true, tracked: false, settings, noticeRequired: false });
    }

    const uid = active.verifiedUser.uid;
    const employeeId = String(active.userData?.employeeId || active.verifiedUser?.identityEmployeeId || "").trim();
    const employee = employeeId ? await adminReadDocument("employees", employeeId) : null;
    const scheduleSource = employee?.workSchedule ? "employee" : "company";
    const schedule = normalizeWorkSchedule(employee?.workSchedule || settings.fallbackSchedule);
    const now = new Date();
    const bucketMs = ACTIVITY_BUCKET_MINUTES * 60 * 1000;
    const bucketStart = new Date(Math.floor(now.getTime() / bucketMs) * bucketMs);
    const bucketEnd = new Date(bucketStart.getTime() + bucketMs);
    const bucketKey = String(bucketStart.getTime());
    const bucketId = `${uid}_${bucketKey}`;
    const existingBucket = await adminReadDocument("userActivityBuckets", bucketId);
    const pathname = String(body?.pathname || "").split("?")[0].slice(0, 160);
    const category = activityCategoryForPath(pathname);
    const workspace = workspaceForPath(pathname);
    const activeSeconds = ACTIVITY_BUCKET_MINUTES * 60;
    const actionCount = Math.min(20, Math.max(0, Number(body?.actionCount) || 0));
    const local = zonedDateParts(bucketStart, schedule.timezone);
    const inHours = isInsideWorkSchedule(bucketStart, schedule);
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

    await adminPatchDocument("userActivityBuckets", bucketId, {
      uid,
      email: String(active.verifiedUser.email || active.userData?.email || "").trim().toLowerCase(),
      employeeId,
      companyId,
      bucketStart: bucketStart.toISOString(),
      bucketEnd: bucketEnd.toISOString(),
      dateKey: local.dateKey,
      activeSeconds,
      category,
      workspace,
      actionCount: Math.max(Number(existingBucket?.actionCount) || 0, actionCount),
      inHours,
      scheduleSource,
      scheduleLabel: describeScheduleForDate(bucketStart, schedule),
      timezone: schedule.timezone,
      updatedAt: now.toISOString(),
      createdAt: existingBucket?.createdAt || now.toISOString(),
      expiresAt,
    });

    const sessionId = safeSessionId(body?.sessionId);
    if (sessionId) {
      const summaryId = `${uid}_${local.dateKey}_${sessionId}`;
      const existing = await adminReadDocument("userActivitySessions", summaryId);
      const isNewBucket = existing?.lastBucketKey !== bucketKey;
      await adminPatchDocument("userActivitySessions", summaryId, {
        uid,
        email: String(active.verifiedUser.email || active.userData?.email || "").trim().toLowerCase(),
        employeeId,
        companyId,
        firstSeenAt: existing?.firstSeenAt || bucketStart.toISOString(),
        lastSeenAt: bucketEnd.toISOString(),
        lastBucketKey: bucketKey,
        activeSeconds: (Number(existing?.activeSeconds) || 0) + (isNewBucket ? activeSeconds : 0),
        inHoursSeconds: (Number(existing?.inHoursSeconds) || 0) + (isNewBucket && inHours ? activeSeconds : 0),
        outOfHoursSeconds: (Number(existing?.outOfHoursSeconds) || 0) + (isNewBucket && !inHours ? activeSeconds : 0),
        actionCount: (Number(existing?.actionCount) || 0) + (isNewBucket ? actionCount : 0),
        dateKey: local.dateKey,
        scheduleLabel: describeScheduleForDate(bucketStart, schedule),
        lastCategory: category,
        lastWorkspace: workspace,
        scheduleSource,
        timezone: schedule.timezone,
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    const noticeVersion = String(active.userData?.activityTrackingNoticeVersion || "");
    return Response.json({
      ok: true,
      tracked: true,
      idleMinutes: settings.idleMinutes,
      policyVersion: settings.policyVersion || ACTIVITY_POLICY_VERSION,
      noticeRequired: noticeVersion !== (settings.policyVersion || ACTIVITY_POLICY_VERSION),
    });
  } catch (error) {
    console.error("Activity heartbeat failed:", error);
    return Response.json({ error: "Activity could not be recorded." }, { status: 500 });
  }
}
