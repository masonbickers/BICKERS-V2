import {
  adminListDocuments,
  adminPatchDocument,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import { normalizeAlertRecipients } from "@/app/utils/maintenanceAlerts";
import { sendServerEmail } from "@/app/utils/serverEmailTransport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cronSecret = process.env.CRON_SECRET || "";
const authorised = (request) =>
  Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
const escapeHtml = (value) =>
  String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

export async function GET(request) {
  if (!authorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const sentAt = new Date().toISOString();
  const settings = await adminReadDocument("settings", "maintenanceNotifications").catch(() => null);
  if (settings?.enabled === false) return Response.json({ skipped: true, reason: "disabled" });
  const recipients = normalizeAlertRecipients(
    settings?.digestRecipients,
    settings?.warningRecipients,
    String(process.env.MAINTENANCE_ALERT_EMAILS || "").split(",")
  );
  const documents = await adminListDocuments("maintenanceAlerts");
  const alerts = documents
    .map((document) => ({ id: document.id, ...(document.data || {}) }))
    .filter((alert) => alert.state === "open");
  if (!alerts.length || !recipients.length) {
    return Response.json({ skipped: true, reason: alerts.length ? "no_recipients" : "no_open_alerts", openAlerts: alerts.length });
  }

  const lines = alerts.map((alert) => `- ${alert.title}: ${alert.message}`);
  const htmlRows = alerts.map((alert) => `<li><strong>${escapeHtml(alert.title)}</strong><br>${escapeHtml(alert.message)}</li>`).join("");
  const results = [];
  for (const recipient of recipients) {
    try {
      const delivery = await sendServerEmail({
        to: recipient,
        subject: `Maintenance digest: ${alerts.length} open alert${alerts.length === 1 ? "" : "s"}`,
        text: `Open maintenance alerts\n\n${lines.join("\n")}`,
        html: `<h2>Open maintenance alerts</h2><ul>${htmlRows}</ul>`,
        idempotencyKey: `maintenance-digest-${sentAt.slice(0, 10)}-${recipient}`,
      });
      results.push({ recipient, status: "sent", ...delivery });
    } catch (error) {
      results.push({ recipient, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const alert of alerts) {
    await adminPatchDocument("maintenanceAlerts", alert.id, { lastDigestAt: sentAt, lastDigestResults: results });
  }
  return Response.json({ sentAt, openAlerts: alerts.length, results });
}
