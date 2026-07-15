import { verifyFirebaseIdTokenFromRequest } from "../../mfa/_lib";
import { adminCreateDocument, adminReadDocument } from "../../_firebaseAdminRest";

export const runtime = "nodejs";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SECURITY_EMAIL_FROM =
  process.env.SECURITY_EMAIL_FROM ||
  process.env.RESEND_FROM_EMAIL ||
  "";

function headerValue(headers, name) {
  return String(headers.get(name) || "").trim();
}

function getClientIp(headers) {
  const forwardedFor = headerValue(headers, "x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return (
    headerValue(headers, "cf-connecting-ip") ||
    headerValue(headers, "x-real-ip") ||
    "Unknown"
  );
}

function decodeHeaderValue(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/\+/g, " "));
  } catch {
    return String(value || "");
  }
}

function getLocation(headers) {
  const city = decodeHeaderValue(headerValue(headers, "x-vercel-ip-city"));
  const region = decodeHeaderValue(headerValue(headers, "x-vercel-ip-country-region"));
  const country = decodeHeaderValue(headerValue(headers, "x-vercel-ip-country"));
  const parts = [city, region, country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Unknown";
}

function getBaseUrl(req) {
  const origin = headerValue(req.headers, "origin");
  if (origin) return origin;
  const host = headerValue(req.headers, "host");
  const proto = headerValue(req.headers, "x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "";
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendLoginEmail({ to, ip, location, userAgent, timestamp, manageUrl }) {
  if (!RESEND_API_KEY || !SECURITY_EMAIL_FROM || !to) {
    return { sent: false, reason: "Email provider not configured." };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SECURITY_EMAIL_FROM,
      to,
      subject: "Security alert: new Bickers Booking login",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:var(--legacy-color-111827)">
          <h2 style="margin:0 0 12px">New login to Bickers Booking</h2>
          <p>Your account was just used to sign in.</p>
          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 12px;font-weight:bold">Time</td><td style="padding:6px 12px">${htmlEscape(timestamp)}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Approx location</td><td style="padding:6px 12px">${htmlEscape(location)}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">IP address</td><td style="padding:6px 12px">${htmlEscape(ip)}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Device/browser</td><td style="padding:6px 12px">${htmlEscape(userAgent)}</td></tr>
          </table>
          <p>If this was you, no action is needed.</p>
          <p><strong>If this was not you:</strong> contact an administrator immediately and change your password.</p>
          ${manageUrl ? `<p><a href="${htmlEscape(manageUrl)}">Open Bickers Booking</a></p>` : ""}
        </div>
      `,
      text: [
        "New login to Bickers Booking",
        "",
        `Time: ${timestamp}`,
        `Approx location: ${location}`,
        `IP address: ${ip}`,
        `Device/browser: ${userAgent}`,
        "",
        "If this was you, no action is needed.",
        "If this was not you, contact an administrator immediately and change your password.",
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login email failed: ${res.status} ${text}`);
  }

  return { sent: true };
}

export async function POST(req) {
  try {
    const verifiedUser = await verifyFirebaseIdTokenFromRequest(req);
    if (!verifiedUser?.uid) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const userData = await adminReadDocument("users", verifiedUser.uid);
    if (userData?.isEnabled === false) {
      return Response.json({ error: "Account disabled." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const timestamp = new Date().toISOString();
    const ip = getClientIp(req.headers);
    const location = getLocation(req.headers);
    const userAgent = headerValue(req.headers, "user-agent") || "Unknown";
    const loginMethod = String(body?.method || "password").trim() || "password";
    const manageUrl = getBaseUrl(req);
    const notifyEmail = verifiedUser.email || userData?.email || "";

    let emailResult = { sent: false, reason: "Not attempted." };
    try {
      emailResult = await sendLoginEmail({
        to: notifyEmail,
        ip,
        location,
        userAgent,
        timestamp,
        manageUrl,
      });
    } catch (error) {
      console.error("Login notification email failed:", error);
      emailResult = { sent: false, reason: error?.message || "Email failed." };
    }

    await adminCreateDocument("loginSecurityLogs", {
      uid: verifiedUser.uid,
      email: notifyEmail,
      ip,
      location,
      userAgent,
      loginMethod,
      emailSent: emailResult.sent === true,
      emailFailure: emailResult.sent ? "" : emailResult.reason || "",
      createdAt: timestamp,
    });

    return Response.json({ ok: true, emailSent: emailResult.sent === true });
  } catch (error) {
    console.error("Login notification failed:", error);
    return Response.json(
      { error: error?.message || "Login notification failed." },
      { status: 500 }
    );
  }
}
