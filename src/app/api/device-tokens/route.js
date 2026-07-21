import crypto from "node:crypto";
import { adminPatchDocument } from "@/app/api/_firebaseAdminRest";
import { jsonError, requireActiveUserFromRequest } from "@/app/api/admin/_lib";

export const runtime = "nodejs";

function cleanString(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function tokenId(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 48);
}

export async function POST(req) {
  try {
    const access = await requireActiveUserFromRequest(req);
    if (access.error) return access.error;
    const verifiedUser = access.verifiedUser;

    const body = await req.json().catch(() => ({}));
    const token = cleanString(body.token || body.expoPushToken || body.pushToken, 500);
    const platform = cleanString(body.platform, 40).toLowerCase();
    const appVersion = cleanString(body.appVersion, 80);

    if (!token) return jsonError("Device token is required.", 400);

    const now = new Date().toISOString();
    const id = tokenId(token);

    await adminPatchDocument(`deviceTokens/${verifiedUser.uid}/tokens`, id, {
      uid: verifiedUser.uid,
      token,
      platform,
      appVersion,
      lastSeenAt: now,
      updatedAt: now,
      createdAt: body.createdAt || now,
    });

    return Response.json({ ok: true, id });
  } catch (error) {
    console.error("Device token registration failed:", error);
    return jsonError(error?.message || "Could not register device token.", 500);
  }
}
