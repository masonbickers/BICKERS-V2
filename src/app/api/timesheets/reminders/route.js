import {
  adminCreateDocument,
  adminListDocuments,
  adminPatchDocument,
} from "@/app/api/_firebaseAdminRest";
import {
  filterDocsForAdminCompany,
  jsonError,
  requireAdminFromRequest,
} from "@/app/api/admin/_lib";
import {
  getEmployeeTimesheetCode,
  getPreviousTimesheetWeekStart,
  isTimesheetReminderEmployee,
  isTimesheetSubmitted,
  resolveEmployeeUserUid,
} from "@/app/utils/timesheetNotifications";

export const runtime = "nodejs";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_TARGETS = 100;

function cleanId(value) {
  return String(value || "").trim();
}

function isExpoPushToken(value) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(cleanId(value));
}

function employeeName(employee = {}) {
  return cleanId(employee.name || employee.fullName || employee.employeeName) || "Employee";
}

function formatWeekStart(weekStart) {
  const date = new Date(`${weekStart}T12:00:00Z`);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

async function sendExpoMessages(messages) {
  if (!messages.length) return [];
  const tickets = [];

  for (let index = 0; index < messages.length; index += 100) {
    const chunk = messages.slice(index, index + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.errors?.[0]?.message || `Expo push request failed (${response.status}).`);
    }
    tickets.push(...(Array.isArray(body?.data) ? body.data : []));
  }

  return tickets;
}

export async function POST(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;

    const body = await req.json().catch(() => ({}));
    const requestedIds = Array.from(
      new Set((Array.isArray(body.employeeIds) ? body.employeeIds : []).map(cleanId).filter(Boolean))
    );
    if (requestedIds.length > MAX_TARGETS) {
      return jsonError(`A maximum of ${MAX_TARGETS} employees can be notified at once.`, 400);
    }

    const [employeeDocs, userDocs, timesheetDocs] = await Promise.all([
      adminListDocuments("employees"),
      adminListDocuments("users"),
      adminListDocuments("timesheets"),
    ]);
    const scopedEmployees = filterDocsForAdminCompany(employeeDocs, admin.userData);
    const scopedUsers = filterDocsForAdminCompany(userDocs, admin.userData).map(({ id, data }) => ({
      id,
      ...data,
    }));
    const requested = new Set(requestedIds);
    const targets = scopedEmployees
      .map(({ id, data }) => ({ id, ...data }))
      .filter(isTimesheetReminderEmployee)
      .filter((employee) => !requested.size || requested.has(employee.id))
      .slice(0, MAX_TARGETS);

    if (requested.size && targets.length !== requested.size) {
      return jsonError("One or more selected employees are not available for timesheet reminders.", 400);
    }

    const weekStart = getPreviousTimesheetWeekStart();
    const timesheets = timesheetDocs.map(({ id, data }) => ({ id, ...data }));
    const pending = [];
    const results = [];

    for (const employee of targets) {
      const code = getEmployeeTimesheetCode(employee);
      const employeeId = cleanId(employee.id || employee.employeeId);
      const matchingTimesheets = timesheets.filter((timesheet) => {
        if (cleanId(timesheet.weekStart || timesheet.weekISO) !== weekStart) return false;
        const employeeCompanyId = cleanId(employee.companyId);
        const timesheetCompanyId = cleanId(timesheet.companyId);
        if (
          employeeCompanyId &&
          timesheetCompanyId &&
          employeeCompanyId !== timesheetCompanyId
        ) {
          return false;
        }
        const timesheetEmployeeId = cleanId(timesheet.employeeId);
        if (timesheetEmployeeId && employeeId && timesheetEmployeeId === employeeId) return true;
        return cleanId(timesheet.employeeCode).toLowerCase() === code.toLowerCase();
      });
      if (matchingTimesheets.some(isTimesheetSubmitted)) {
        results.push({ employeeId: employee.id, name: employeeName(employee), status: "submitted" });
        continue;
      }

      const uid = resolveEmployeeUserUid(employee, scopedUsers);
      const title = "Timesheet overdue";
      const messageBody = `Please submit your timesheet for the week commencing ${formatWeekStart(weekStart)}.`;
      const sentAt = new Date().toISOString();
      const notificationId = `timesheet-reminder_${weekStart}_${employeeId}`.replace(
        /[^A-Za-z0-9_-]/g,
        "_"
      );
      const notificationData = {
        type: "timesheet-reminder",
        source: "admin",
        weekStart,
        employeeCode: code,
        deepLink: `/(protected)/week/${weekStart}`,
        sentAt,
        notificationId,
      };
      await adminPatchDocument("employeeNotifications", notificationId, {
        uid,
        employeeId,
        employeeCode: code,
        companyId: employee.companyId || admin.userData.companyId || "",
        title,
        body: messageBody,
        data: notificationData,
        source: "web",
        createdAt: sentAt,
        sentByUid: admin.verifiedUser.uid,
      });

      if (!uid) {
        results.push({
          employeeId: employee.id,
          name: employeeName(employee),
          status: "inbox_only",
          inboxSaved: true,
        });
        continue;
      }

      const tokenDocs = await adminListDocuments(`deviceTokens/${uid}/tokens`, {
        maxDocuments: 20,
      });
      const linkedUser = scopedUsers.find((user) => cleanId(user.uid || user.id) === uid);
      const tokens = Array.from(
        new Set([
          ...tokenDocs.map(({ data }) => cleanId(data?.token)),
          cleanId(linkedUser?.expoPushToken),
        ].filter(isExpoPushToken))
      );

      if (!tokens.length) {
        results.push({
          employeeId: employee.id,
          name: employeeName(employee),
          status: "inbox_only",
          inboxSaved: true,
        });
        continue;
      }

      const resultIndex = results.push({
        employeeId: employee.id,
        name: employeeName(employee),
        status: "pending",
        devices: tokens.length,
        inboxSaved: true,
      }) - 1;
      tokens.forEach((token) => {
        pending.push({
          resultIndex,
          message: {
            to: token,
            sound: "default",
            priority: "high",
            title,
            body: messageBody,
            data: notificationData,
          },
        });
      });
    }

    const tickets = await sendExpoMessages(pending.map(({ message }) => message));
    const outcomes = new Map();
    pending.forEach(({ resultIndex }, index) => {
      const current = outcomes.get(resultIndex) || { ok: 0, failed: 0 };
      if (tickets[index]?.status === "ok") current.ok += 1;
      else current.failed += 1;
      outcomes.set(resultIndex, current);
    });
    outcomes.forEach((outcome, resultIndex) => {
      results[resultIndex].status = outcome.ok > 0 ? "sent" : "inbox_only";
      results[resultIndex].sentDevices = outcome.ok;
      results[resultIndex].failedDevices = outcome.failed;
    });

    const sent = results.filter((result) => result.status === "sent").length;
    const saved = results.filter((result) => result.inboxSaved).length;
    try {
      await adminCreateDocument("notificationLogs", {
        type: "timesheet-reminder",
        weekStart,
        requestedEmployeeIds: targets.map((employee) => employee.id),
        sentEmployees: sent,
        sentDevices: results.reduce((sum, result) => sum + Number(result.sentDevices || 0), 0),
        sentByUid: admin.verifiedUser.uid,
        sentByEmail: admin.verifiedUser.email || "",
        companyId: admin.userData.companyId || "",
        createdAt: new Date().toISOString(),
      });
    } catch (logError) {
      console.error("Timesheet reminder audit log failed:", logError);
    }

    return Response.json({
      ok: true,
      weekStart,
      sent,
      saved,
      attempted: targets.length,
      results,
    });
  } catch (error) {
    console.error("Timesheet reminder delivery failed:", error);
    return jsonError(error?.message || "Could not send timesheet reminders.", 500);
  }
}
