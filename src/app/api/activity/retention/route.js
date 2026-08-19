import {
  adminDeleteDocument,
  adminListDocuments,
} from "@/app/api/_firebaseAdminRest";

const cronSecret = process.env.CRON_SECRET || "";

const authorised = (req) => Boolean(cronSecret) && req.headers.get("authorization") === `Bearer ${cronSecret}`;

export async function GET(req) {
  if (!authorised(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const now = Date.now();
    const collections = ["userActivityBuckets", "userActivitySessions", "activityReviews"];
    const deleted = {};
    for (const collection of collections) {
      const docs = await adminListDocuments(collection, { maxDocuments: 10000 });
      const expired = docs.filter((row) => {
        const expires = new Date(row.data?.expiresAt || 0).getTime();
        return expires > 0 && expires < now;
      });
      await Promise.all(expired.map((row) => adminDeleteDocument(collection, row.id)));
      deleted[collection] = expired.length;
    }
    return Response.json({ ok: true, deleted, finishedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Activity retention cleanup failed:", error);
    return Response.json({ error: "Activity retention cleanup failed." }, { status: 500 });
  }
}
