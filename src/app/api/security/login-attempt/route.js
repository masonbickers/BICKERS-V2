import { adminCreateDocument } from "../../_firebaseAdminRest";

export const runtime = "nodejs";

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 254);
}

function cleanText(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function headerValue(headers, name) {
  return String(headers.get(name) || "").trim();
}

function clientIp(req) {
  const forwarded = headerValue(req.headers, "x-forwarded-for");
  return (
    headerValue(req.headers, "cf-connecting-ip") ||
    headerValue(req.headers, "x-real-ip") ||
    String(forwarded.split(",")[0] || "").trim() ||
    ""
  );
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const status = cleanText(body.status || "failed", 40);
    const reason = cleanText(body.reason || "Login attempt");
    const loginMethod = cleanText(body.method || "password", 40);

    await adminCreateDocument("loginSecurityLogs", {
      uid: "",
      email,
      loginMethod,
      status,
      outcome: status,
      reason,
      ip: clientIp(req),
      userAgent: headerValue(req.headers, "user-agent"),
      createdAt: new Date().toISOString(),
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Login attempt log failed:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
