import {
  adminPatchDocument,
  adminReadDocument,
} from "../../../_firebaseAdminRest";
import {
  canAccessCompany,
  jsonError,
  requireActiveUserFromRequest,
  requireAdminFromRequest,
} from "../../../admin/_lib";
import {
  INVOICE_LIFECYCLE_ACTIONS,
  applyProtectedInvoiceAction,
  buildProtectedDraftSave,
} from "../../../../utils/invoiceLifecycleActions.js";
import {
  createInvoiceCustomerSnapshot,
  normaliseCustomerFinanceProfile,
} from "../../../../utils/accountingMappings.js";

export const runtime = "nodejs";

const text = (value) => String(value ?? "").trim();
const safeId = (value) => {
  const id = text(value);
  return id && id.length <= 180 && !id.includes("/") ? id : "";
};

export async function POST(req, context) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = text(body.action);
    if (action === INVOICE_LIFECYCLE_ACTIONS.CONFIRM_EXTERNAL_ISSUE) {
      return jsonError("Use the trusted Sage 50 export reconciliation route.", 400);
    }
    const auth =
      action === INVOICE_LIFECYCLE_ACTIONS.CONFIRM_EXTERNAL_ISSUE
        ? await requireAdminFromRequest(req)
        : await requireActiveUserFromRequest(req);
    if (auth.error) return auth.error;

    const { id: rawId } = await context.params;
    const invoiceId = safeId(rawId);
    if (!invoiceId) return jsonError("Valid invoice ID is required.", 400);

    const [existing, booking] = await Promise.all([
      adminReadDocument("invoiceQueue", invoiceId),
      adminReadDocument("bookings", invoiceId),
    ]);
    if (!booking) return jsonError("Linked booking not found.", 404);

    const targetCompanyId = text(existing?.companyId || booking.companyId);
    if (!targetCompanyId || !canAccessCompany(auth.userData, targetCompanyId)) {
      return jsonError("Invoice company access denied.", 403);
    }
    if (
      existing?.companyId &&
      booking.companyId &&
      text(existing.companyId) !== text(booking.companyId)
    ) {
      return jsonError("Invoice and booking company records do not match.", 409);
    }

    const actor =
      text(auth.verifiedUser.email) ||
      text(auth.verifiedUser.uid) ||
      "Authenticated user";
    const now = new Date().toISOString();
    let nextInvoice;

    if (action === INVOICE_LIFECYCLE_ACTIONS.SAVE_DRAFT) {
      if (
        existing &&
        body.expectedUpdatedAt &&
        text(body.expectedUpdatedAt) !== text(existing.updatedAt)
      ) {
        return jsonError("Invoice changed since it was opened. Reload and try again.", 409);
      }
      let incomingInvoice = body.invoice;
      const contactId = safeId(incomingInvoice?.customer?.contactId);
      if (contactId) {
        const contact = await adminReadDocument("contacts", contactId);
        if (!contact || text(contact.companyId) !== targetCompanyId) {
          return jsonError("Selected billing customer was not found for this company.", 400);
        }
        const financeProfile = normaliseCustomerFinanceProfile(contact);
        incomingInvoice = {
          ...incomingInvoice,
          customer: createInvoiceCustomerSnapshot({ id: contactId, ...contact }, incomingInvoice.customer),
          currency: financeProfile.defaultCurrency,
          paymentTermsDays: financeProfile.defaultPaymentTerms,
        };
      }
      nextInvoice = buildProtectedDraftSave({
        incoming: incomingInvoice,
        existing,
        booking: { id: invoiceId, ...booking },
        actor,
        now,
      });
    } else {
      if (!existing) return jsonError("Invoice not found.", 404);
      if (
        body.expectedUpdatedAt &&
        text(body.expectedUpdatedAt) !== text(existing.updatedAt)
      ) {
        return jsonError("Invoice changed since it was opened. Reload and try again.", 409);
      }
      nextInvoice = applyProtectedInvoiceAction({
        invoice: existing,
        action,
        actor,
        reason: body.reason,
        invoiceNumber: body.invoiceNumber,
        sageInvoiceId: body.sageInvoiceId,
        postedDate: body.postedDate,
        now,
      });
    }

    await adminPatchDocument("invoiceQueue", invoiceId, nextInvoice);

    if (action === INVOICE_LIFECYCLE_ACTIONS.CONFIRM_EXTERNAL_ISSUE) {
      await adminPatchDocument("bookings", invoiceId, {
        status: "invoiced",
        financeState: "invoiced",
        readyToInvoice: false,
        invoicedAt: nextInvoice.issuedAt,
        invoiceNumber: nextInvoice.invoiceNumber,
        invoiceTotal: nextInvoice.totals?.gross ?? null,
        updatedAt: now,
      });
    }

    return Response.json({ ok: true, invoice: nextInvoice });
  } catch (error) {
    const message = error?.message || "Invoice lifecycle action failed.";
    const status = /cannot move|only|must|required|unsupported|manually/i.test(message)
      ? 400
      : 500;
    console.error("[invoice lifecycle]", error);
    return jsonError(message, status);
  }
}
