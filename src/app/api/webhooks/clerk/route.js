import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { adminListDocuments, adminPatchDocument } from "@/app/api/_firebaseAdminRest";

export const runtime = "nodejs";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

function eventEmails(data = {}) {
  return new Set(
    (Array.isArray(data.email_addresses) ? data.email_addresses : [])
      .map((entry) => normalizeEmail(entry?.email_address))
      .filter(Boolean)
  );
}

export async function POST(req) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch (error) {
    console.warn("[clerk-webhook] signature verification failed:", error?.message || error);
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  if (event?.type !== "user.updated") {
    return Response.json({ ok: true, ignored: true });
  }

  const data = event.data || {};
  const passwordUpdatedAt = Number(data.password_last_updated_at || 0);
  if (!Number.isFinite(passwordUpdatedAt) || passwordUpdatedAt <= 0) {
    return Response.json({ ok: true, ignored: true, reason: "No verified password update." });
  }

  const emails = eventEmails(data);
  const users = await adminListDocuments("users");
  const matches = users.filter(({ data: user }) => {
    if (String(user?.clerkUserId || "") === String(data.id || "")) return true;
    return emails.has(normalizeEmail(user?.email));
  });

  let cleared = 0;
  for (const { id, data: user } of matches) {
    if (user?.credentialResetRequired !== true) continue;
    const incidentAtMs = Date.parse(String(user?.credentialIncidentAt || ""));
    if (!Number.isFinite(incidentAtMs) || passwordUpdatedAt <= incidentAtMs) continue;

    await adminPatchDocument("users", id, {
      clerkUserId: String(data.id || user?.clerkUserId || ""),
      credentialResetRequired: false,
      credentialResetCompletedAt: new Date(passwordUpdatedAt).toISOString(),
      updatedAt: new Date().toISOString(),
    });
    cleared += 1;
  }

  return Response.json({ ok: true, cleared });
}
