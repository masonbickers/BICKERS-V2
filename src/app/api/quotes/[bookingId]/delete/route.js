import { requireAdminFromRequest } from "../../../admin/_lib";
import { getAdminDb } from "../../../_firebaseAdmin";
import { buildQuoteDeletion, purgeAfterIso } from "../../_lifecycle";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const access = await requireAdminFromRequest(req);
  if (access.error) return access.error;
  const bookingId = String((await params)?.bookingId || "").trim();
  const body = await req.json().catch(() => ({}));
  const quoteNumber = String(body?.quoteNumber || "").trim();
  if (!bookingId || !quoteNumber) {
    return Response.json({ error: "bookingId and quoteNumber are required." }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const bookingRef = db.collection("bookings").doc(bookingId);
    const tombstoneRef = db.collection("deletedQuotes").doc();
    const deletedAt = new Date().toISOString();
    const result = await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) throw Object.assign(new Error("Booking not found."), { status: 404 });
      const booking = bookingSnap.data() || {};
      if (String(booking.companyId || "") !== access.companyId) {
        throw Object.assign(new Error("Company access denied."), { status: 403 });
      }
      const deletion = buildQuoteDeletion(booking, quoteNumber);
      const patch = {
        ...deletion.patch,
        companyId: access.companyId,
        updatedAt: deletedAt,
        lastEditedBy: access.verifiedUser.email || "",
        lastEditedByUid: access.verifiedUser.uid,
      };
      transaction.update(bookingRef, patch);
      transaction.set(tombstoneRef, {
        companyId: access.companyId,
        bookingId,
        quoteNumber: deletion.target.quoteNumber || quoteNumber,
        originalQuote: deletion.target,
        originalMetadata: {
          jobNumber: booking.jobNumber || "",
          client: booking.client || "",
          acceptedQuoteNumber: booking.acceptedQuoteNumber || "",
          acceptedQuoteName: booking.acceptedQuoteName || "",
        },
        assetRefs: deletion.target.assetRefs || [],
        deletedAt,
        purgeAfter: purgeAfterIso(Date.parse(deletedAt)),
        deletedByUid: access.verifiedUser.uid,
        deletedByEmail: access.verifiedUser.email || "",
        purgeAttempts: 0,
      });
      return { patch, quoteNumber: deletion.target.quoteNumber || quoteNumber };
    });
    return Response.json({ ok: true, tombstoneId: tombstoneRef.id, ...result });
  } catch (error) {
    const status = Number(error?.status || 500);
    console.error("[quotes/delete] failed:", error);
    return Response.json({ error: error?.message || "Could not delete quote." }, { status });
  }
}
