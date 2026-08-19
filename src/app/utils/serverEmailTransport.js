import "server-only";
import { getDeploymentConfig } from "@/app/config/deploymentConfig";
import { formatEmailFrom } from "@/app/utils/emailIdentity";

export { formatEmailFrom } from "@/app/utils/emailIdentity";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const DEFAULT_EMAIL_FROM = process.env.RESEND_FROM_EMAIL || "";

export function isServerEmailConfigured() {
  return Boolean(RESEND_API_KEY && DEFAULT_EMAIL_FROM);
}

export async function sendServerEmail({
  to,
  subject,
  html,
  text,
  attachments = [],
  idempotencyKey = "",
} = {}) {
  if (!isServerEmailConfigured()) {
    const error = new Error("Email provider is not configured.");
    error.code = "email_provider_not_configured";
    throw error;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: formatEmailFrom(getDeploymentConfig().emailFromName, DEFAULT_EMAIL_FROM),
      to: [to],
      subject,
      html,
      text,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.content).toString("base64"),
        content_type: attachment.contentType || "application/octet-stream",
      })),
    }),
    cache: "no-store",
  });
  const rawBody = await response.text();
  let body = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = { message: rawBody };
  }
  if (!response.ok) {
    const error = new Error(
      body?.message || body?.error?.message || `Email provider returned ${response.status}.`
    );
    error.code = body?.name || body?.error?.name || `resend_${response.status}`;
    throw error;
  }
  return { provider: "resend", messageId: String(body?.id || "").trim() || null };
}
