import crypto from "node:crypto";
import {
  adminCreateDocument,
  adminListDocuments,
  adminPatchDocument,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import {
  canAccessCompany,
  filterDocsForAdminCompany,
  jsonError,
  requireAdminFromRequest,
} from "@/app/api/admin/_lib";
import {
  buildActivitySessions,
  normalizeActivitySettings,
} from "@/app/utils/activityTracking";

const cleanDate = (value, fallback) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : fallback;
const withId = (row) => ({ id: row.id, ...(row.data || {}) });
const hashId = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 28);
const dateOnly = (value) => String(value || "").slice(0, 10);

const dateOverlaps = (row, dateKey) => {
  const start = dateOnly(row.startDate || row.date || row.createdAt);
  const end = dateOnly(row.endDate || row.startDate || row.date || row.createdAt);
  return !!start && start <= dateKey && (!end || end >= dateKey);
};

const dominantKey = (values = {}) =>
  Object.entries(values).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || "General";

function csvCell(value) {
  const raw = String(value ?? "");
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const headers = [
    "Account", "Employee", "Start", "End", "Active minutes", "Out-of-hours minutes",
    "Workspace", "Category", "Expected schedule", "Schedule source", "Flagged", "Annotations",
    "Review status", "Reviewer", "Review note", "External payroll reference",
  ];
  const lines = rows.map((row) => [
    row.email, row.employeeName, row.startAt, row.endAt, row.activeMinutes, row.outOfHoursMinutes,
    row.workspace, row.category, row.scheduleLabel, row.scheduleSource, row.flagged ? "Yes" : "No",
    row.annotations.join("; "), row.review?.status || "unreviewed", row.review?.reviewerEmail || "",
    row.review?.note || "", row.review?.externalReference || "",
  ].map(csvCell).join(","));
  return [headers.join(","), ...lines].join("\n");
}

export async function GET(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;
    const url = new URL(req.url);
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const from = cleanDate(url.searchParams.get("from"), defaultFrom);
    const to = cleanDate(url.searchParams.get("to"), now.toISOString().slice(0, 10));
    if (from > to) return jsonError("The start date must be before the end date.", 400);

    const [bucketDocs, sessionDocs, userDocs, employeeDocs, reviewDocs, holidayDocs, sickDocs, bookingDocs] = await Promise.all([
      adminListDocuments("userActivityBuckets", { maxDocuments: 10000 }),
      adminListDocuments("userActivitySessions", { maxDocuments: 10000 }),
      adminListDocuments("users", { maxDocuments: 1000 }),
      adminListDocuments("employees", { maxDocuments: 1000 }),
      adminListDocuments("activityReviews", { maxDocuments: 5000 }),
      adminListDocuments("holidays", { maxDocuments: 3000 }),
      adminListDocuments("sickLeave", { maxDocuments: 3000 }),
      adminListDocuments("bookings", { maxDocuments: 5000 }),
    ]);
    const scopedBuckets = filterDocsForAdminCompany(bucketDocs, admin.userData).map(withId)
      .filter((row) => row.dateKey >= from && row.dateKey <= to);
    const scopedStoredSessions = filterDocsForAdminCompany(sessionDocs, admin.userData).map(withId)
      .filter((row) => row.dateKey >= from && row.dateKey <= to);
    const scopedUsers = filterDocsForAdminCompany(userDocs, admin.userData).map(withId);
    const scopedEmployees = filterDocsForAdminCompany(employeeDocs, admin.userData).map(withId);
    const reviews = new Map(filterDocsForAdminCompany(reviewDocs, admin.userData).map((row) => [row.id, withId(row)]));
    const holidays = filterDocsForAdminCompany(holidayDocs, admin.userData).map(withId);
    const sickness = filterDocsForAdminCompany(sickDocs, admin.userData).map(withId);
    const bookings = filterDocsForAdminCompany(bookingDocs, admin.userData).map(withId);
    const employeeById = new Map(scopedEmployees.map((row) => [row.id, row]));
    const userByUid = new Map(scopedUsers.map((row) => [row.id || row.uid, row]));

    const dayOutSeconds = new Map();
    scopedBuckets.forEach((bucket) => {
      if (bucket.inHours) return;
      const key = `${bucket.uid}_${bucket.dateKey}`;
      dayOutSeconds.set(key, (dayOutSeconds.get(key) || 0) + (Number(bucket.activeSeconds) || 0));
    });

    const companyId = String(admin.userData?.companyId || "");
    const settingsDocs = companyId
      ? await adminReadDocument("activityTrackingSettings", companyId)
      : null;
    const settings = normalizeActivitySettings(settingsDocs || {});
    let rows = buildActivitySessions(scopedBuckets).map((session) => {
      const id = hashId(`${session.uid}_${session.startAt}`);
      const employee = employeeById.get(session.employeeId) || {};
      const user = userByUid.get(session.uid) || {};
      const annotations = [];
      if (session.employeeId && holidays.some((row) => row.employeeId === session.employeeId && dateOverlaps(row, session.dateKey))) annotations.push("Holiday");
      if (session.employeeId && sickness.some((row) => row.employeeId === session.employeeId && dateOverlaps(row, session.dateKey))) annotations.push("Sick leave");
      if (bookings.some((row) => dateOverlaps(row, session.dateKey) && (!session.employeeId || JSON.stringify(row).includes(session.employeeId)))) annotations.push("Known job activity");
      const outSecondsForDay = dayOutSeconds.get(`${session.uid}_${session.dateKey}`) || 0;
      return {
        ...session,
        id,
        email: session.email || user.email || "Unknown account",
        employeeName: employee.name || employee.fullName || "Unlinked account",
        linked: !!session.employeeId,
        activeMinutes: Math.round(session.activeSeconds / 60),
        inHoursMinutes: Math.round(session.inHoursSeconds / 60),
        outOfHoursMinutes: Math.round(session.outOfHoursSeconds / 60),
        category: dominantKey(session.categories),
        workspace: dominantKey(session.workspaces),
        flagged: session.outOfHoursSeconds > 0 && outSecondsForDay >= settings.flagMinutes * 60,
        annotations,
        review: reviews.get(id) || { status: "unreviewed" },
      };
    });

    const rawRetentionCutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const historicalRows = scopedStoredSessions
      .filter((session) => session.dateKey < rawRetentionCutoff)
      .map((session) => {
        const id = hashId(`${session.uid}_${session.firstSeenAt}`);
        const employee = employeeById.get(session.employeeId) || {};
        const user = userByUid.get(session.uid) || {};
        const outOfHoursMinutes = Math.round((Number(session.outOfHoursSeconds) || 0) / 60);
        const annotations = [];
        if (session.employeeId && holidays.some((row) => row.employeeId === session.employeeId && dateOverlaps(row, session.dateKey))) annotations.push("Holiday");
        if (session.employeeId && sickness.some((row) => row.employeeId === session.employeeId && dateOverlaps(row, session.dateKey))) annotations.push("Sick leave");
        if (bookings.some((row) => dateOverlaps(row, session.dateKey) && (!session.employeeId || JSON.stringify(row).includes(session.employeeId)))) annotations.push("Known job activity");
        return {
          id,
          uid: session.uid,
          employeeId: session.employeeId || "",
          companyId: session.companyId || "",
          email: session.email || user.email || "Unknown account",
          employeeName: employee.name || employee.fullName || "Unlinked account",
          linked: !!session.employeeId,
          startAt: session.firstSeenAt,
          endAt: session.lastSeenAt,
          dateKey: session.dateKey,
          activeMinutes: Math.round((Number(session.activeSeconds) || 0) / 60),
          inHoursMinutes: Math.round((Number(session.inHoursSeconds) || 0) / 60),
          outOfHoursMinutes,
          category: session.lastCategory || "General",
          workspace: session.lastWorkspace || "user",
          categories: { [session.lastCategory || "General"]: Number(session.activeSeconds) || 0 },
          workspaces: { [session.lastWorkspace || "user"]: Number(session.activeSeconds) || 0 },
          actionCount: Number(session.actionCount) || 0,
          scheduleLabel: session.scheduleLabel || "",
          scheduleSource: session.scheduleSource || "company",
          flagged: outOfHoursMinutes >= settings.flagMinutes,
          annotations,
          review: reviews.get(id) || { status: "unreviewed" },
        };
      });
    rows.push(...historicalRows);

    const uid = String(url.searchParams.get("uid") || "");
    const category = String(url.searchParams.get("category") || "");
    const workspace = String(url.searchParams.get("workspace") || "");
    const hours = String(url.searchParams.get("hours") || "all");
    const linkage = String(url.searchParams.get("linkage") || "all");
    const reviewStatus = String(url.searchParams.get("reviewStatus") || "all");
    if (uid) rows = rows.filter((row) => row.uid === uid);
    if (category) rows = rows.filter((row) => row.category === category);
    if (workspace) rows = rows.filter((row) => row.workspace === workspace);
    if (hours === "out") rows = rows.filter((row) => row.outOfHoursMinutes > 0);
    if (hours === "in") rows = rows.filter((row) => row.inHoursMinutes > 0 && row.outOfHoursMinutes === 0);
    if (linkage === "linked") rows = rows.filter((row) => row.linked);
    if (linkage === "unlinked") rows = rows.filter((row) => !row.linked);
    if (reviewStatus !== "all") rows = rows.filter((row) => (row.review?.status || "unreviewed") === reviewStatus);
    rows.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));

    if (url.searchParams.get("format") === "csv") {
      return new Response(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="user-activity-${from}-to-${to}.csv"`,
        },
      });
    }

    const summary = {
      activeMinutes: rows.reduce((sum, row) => sum + row.activeMinutes, 0),
      outOfHoursMinutes: rows.reduce((sum, row) => sum + row.outOfHoursMinutes, 0),
      affectedAccounts: new Set(rows.filter((row) => row.outOfHoursMinutes > 0).map((row) => row.uid)).size,
      flaggedDays: new Set(rows.filter((row) => row.flagged).map((row) => `${row.uid}_${row.dateKey}`)).size,
    };
    return Response.json({ ok: true, from, to, rows, summary, settings, accounts: scopedUsers.map((row) => ({ uid: row.id || row.uid, email: row.email || row.name || row.id })) });
  } catch (error) {
    console.error("User activity report failed:", error);
    return jsonError(error?.message || "User activity could not be loaded.", 500);
  }
}

export async function PATCH(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.sessionId || "").replace(/[^a-f0-9]/g, "").slice(0, 28);
    if (!sessionId) return jsonError("A valid activity session is required.", 400);
    const allowed = new Set(["unreviewed", "reviewed_no_overtime", "possible_overtime", "recorded_externally"]);
    const status = allowed.has(body?.status) ? body.status : "unreviewed";
    const companyId = String(admin.userData?.companyId || body?.companyId || "").trim();
    if (!canAccessCompany(admin.userData, companyId)) return jsonError("Company access denied.", 403);
    if (status === "recorded_externally" && !String(body?.externalReference || "").trim()) {
      return jsonError("An external payroll reference is required for this classification.", 400);
    }
    const now = new Date();
    const review = {
      companyId,
      sessionId,
      status,
      note: String(body?.note || "").trim().slice(0, 1000),
      externalReference: status === "recorded_externally" ? String(body?.externalReference || "").trim().slice(0, 160) : "",
      reviewerUid: admin.verifiedUser.uid,
      reviewerEmail: admin.verifiedUser.email || admin.userData?.email || "",
      reviewedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (status === "recorded_externally" ? 6 : 2) * 365 * 86400000).toISOString(),
    };
    await adminPatchDocument("activityReviews", sessionId, review);
    await adminCreateDocument("adminAuditLogs", {
      companyId, actorUid: admin.verifiedUser.uid, actorEmail: admin.verifiedUser.email || "",
      action: "activityReviewUpdated", area: "activity", targetId: sessionId, status,
      createdAt: now.toISOString(),
    });
    return Response.json({ ok: true, review });
  } catch (error) {
    console.error("Activity review update failed:", error);
    return jsonError(error?.message || "The activity review could not be saved.", 500);
  }
}
