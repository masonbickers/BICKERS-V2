import { getAdminDb, getAdminStorage } from "../../_firebaseAdmin";
import { purgeQuoteTombstone } from "../_lifecycle";

export const runtime = "nodejs";

function cronAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  return Boolean(expected) && req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(req) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const db = getAdminDb();
  const bucket = getAdminStorage().bucket();
  const now = new Date().toISOString();
  const snapshot = await db.collection("deletedQuotes").where("purgeAfter", "<=", now).get();
  const report = { checked: snapshot.size, purged: 0, failed: 0, failures: [] };

  for (const tombstoneDoc of snapshot.docs) {
    const tombstone = tombstoneDoc.data() || {};
    const result = await purgeQuoteTombstone({
      id: tombstoneDoc.id,
      tombstone,
      now,
      deleteAsset: (storagePath) => bucket.file(storagePath).delete({ ignoreNotFound: true }),
      deleteTombstone: () => tombstoneDoc.ref.delete(),
      markFailure: (patch) => tombstoneDoc.ref.set(patch, { merge: true }),
    });
    if (result.purged) {
      report.purged += 1;
    } else {
      report.failed += 1;
      report.failures.push({ tombstoneId: tombstoneDoc.id, error: result.error });
    }
  }
  return Response.json(report, { status: report.failed ? 207 : 200 });
}
