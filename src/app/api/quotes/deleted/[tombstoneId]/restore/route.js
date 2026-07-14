import { requireAdminFromRequest } from "../../../../admin/_lib";
import { getAdminDb } from "../../../../_firebaseAdmin";
import { restoreQuoteVersion } from "../../../_lifecycle";

export async function POST(req, { params }) {
  const access = await requireAdminFromRequest(req);
  if (access.error) return access.error;
  const tombstoneId = String((await params)?.tombstoneId || "").trim();
  if (!tombstoneId) return Response.json({ error: "Tombstone id is required." }, { status: 400 });

  try {
    const db = getAdminDb();
    const tombstoneRef = db.collection("deletedQuotes").doc(tombstoneId);
    const result = await db.runTransaction(async (transaction) => {
      const tombstoneSnap = await transaction.get(tombstoneRef);
      if (!tombstoneSnap.exists) throw Object.assign(new Error("Deleted quote not found."), { status: 404 });
      const tombstone = tombstoneSnap.data() || {};
      if (tombstone.companyId !== access.companyId) throw Object.assign(new Error("Company access denied."), { status: 403 });
      if (Date.parse(tombstone.purgeAfter || "") <= Date.now()) {
        throw Object.assign(new Error("The 30-day restore period has expired."), { status: 410 });
      }
      const bookingRef = db.collection("bookings").doc(String(tombstone.bookingId || ""));
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) throw Object.assign(new Error("Original booking not found."), { status: 404 });
      const patch = {
        ...restoreQuoteVersion(bookingSnap.data() || {}, tombstone.originalQuote || {}),
        companyId: access.companyId,
        updatedAt: new Date().toISOString(),
        lastEditedBy: access.verifiedUser.email || "",
        lastEditedByUid: access.verifiedUser.uid,
      };
      transaction.update(bookingRef, patch);
      transaction.delete(tombstoneRef);
      return { bookingId: tombstone.bookingId, quoteNumber: tombstone.quoteNumber, patch };
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const status = Number(error?.status || 500);
    console.error("[quotes/restore] failed:", error);
    return Response.json({ error: error?.message || "Could not restore quote." }, { status });
  }
}
