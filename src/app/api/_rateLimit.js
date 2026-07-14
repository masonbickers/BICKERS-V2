import crypto from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";

const DEFAULT_LIMITS = Object.freeze({
  dvla: { hourlyPerUser: 30, dailyPerCompany: 300 },
  ai: { hourlyPerUser: 20, dailyPerCompany: 100 },
});

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const keyHash = (...parts) =>
  crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 40);

function resolvedLimits(service, companyData = {}) {
  const defaults = DEFAULT_LIMITS[service];
  if (!defaults) throw new Error(`Unknown rate-limit service: ${service}`);
  const override = companyData?.quotas?.[service] || {};
  return {
    hourlyPerUser: positiveInteger(
      override.hourlyPerUser ?? override.hourly,
      defaults.hourlyPerUser
    ),
    dailyPerCompany: positiveInteger(
      override.dailyPerCompany ?? override.daily,
      defaults.dailyPerCompany
    ),
  };
}

export async function consumeApiQuota({ service, userId, companyId, now = Date.now() }) {
  if (!service || !userId || !companyId) {
    throw new Error("Rate limiting requires service, userId, and companyId.");
  }

  const db = getAdminDb();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const hourStart = Math.floor(now / hourMs) * hourMs;
  const dayStart = Math.floor(now / dayMs) * dayMs;
  const hourEnd = hourStart + hourMs;
  const dayEnd = dayStart + dayMs;
  const companyRef = db.collection("platformCompanies").doc(companyId);
  const userLimitRef = db.collection("apiRateLimits").doc(
    keyHash(service, "user-hour", companyId, userId)
  );
  const companyLimitRef = db.collection("apiRateLimits").doc(
    keyHash(service, "company-day", companyId)
  );

  return db.runTransaction(async (transaction) => {
    const [companySnap, userSnap, companyLimitSnap] = await Promise.all([
      transaction.get(companyRef),
      transaction.get(userLimitRef),
      transaction.get(companyLimitRef),
    ]);
    const limits = resolvedLimits(service, companySnap.data() || {});
    const userData = userSnap.data() || {};
    const companyLimitData = companyLimitSnap.data() || {};
    const userCount = Number(userData.windowStartMs) === hourStart ? Number(userData.count || 0) : 0;
    const companyCount = Number(companyLimitData.windowStartMs) === dayStart
      ? Number(companyLimitData.count || 0)
      : 0;

    if (userCount >= limits.hourlyPerUser) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((hourEnd - now) / 1000)), limit: "user-hour" };
    }
    if (companyCount >= limits.dailyPerCompany) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((dayEnd - now) / 1000)), limit: "company-day" };
    }

    const common = { service, companyId, updatedAt: Timestamp.fromMillis(now) };
    transaction.set(userLimitRef, {
      ...common,
      scope: "user-hour",
      userId,
      windowStartMs: hourStart,
      count: userCount + 1,
      expiresAt: Timestamp.fromMillis(hourEnd + dayMs),
    });
    transaction.set(companyLimitRef, {
      ...common,
      scope: "company-day",
      windowStartMs: dayStart,
      count: companyCount + 1,
      expiresAt: Timestamp.fromMillis(dayEnd + dayMs),
    });

    return {
      allowed: true,
      limits,
      remaining: {
        userHour: Math.max(0, limits.hourlyPerUser - userCount - 1),
        companyDay: Math.max(0, limits.dailyPerCompany - companyCount - 1),
      },
    };
  });
}

export function quotaExceededResponse(result) {
  const retryAfter = String(Math.max(1, Number(result?.retryAfter || 1)));
  return Response.json(
    { error: "Request quota exhausted.", retryAfter: Number(retryAfter), limit: result?.limit || "quota" },
    { status: 429, headers: { "Retry-After": retryAfter } }
  );
}
