"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { Printer, Download, ArrowLeft } from "lucide-react";
import { auth, db } from "../../../../firebaseConfig";
import {
  getInvoiceDraftReferenceDisplay,
  getInvoiceIdentityDisplay,
  parseInvoiceRecord,
} from "../../utils/invoiceLifecycle";
import styles from "./page.module.css";
import { useDeploymentConfig } from "@/app/components/DeploymentConfigProvider";

const text = (value) => String(value ?? "").trim();
const money = (value, currency = "GBP") =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
  }).format(Number(value || 0));

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dateLabel = (value, fallback = "—") => {
  const date = toDate(value);
  return date
    ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : fallback;
};

const invoiceStatus = (value) =>
  text(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Draft";

export default function InvoiceDocumentPage() {
  const { id } = useParams();
  const router = useRouter();
  const deployment = useDeploymentConfig();
  const searchParams = useSearchParams();
  const requestedAction = searchParams.get("action");
  const handledAction = useRef(false);
  const [invoice, setInvoice] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [issuedPdfUrl, setIssuedPdfUrl] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const invoiceSnap = await getDoc(doc(db, "invoiceQueue", id));
        if (!invoiceSnap.exists()) throw new Error("Save the invoice before opening its A4 document.");
        const rawInvoice = { id: invoiceSnap.id, ...invoiceSnap.data() };
        if (rawInvoice.status === "issued") {
          const token = await auth.currentUser?.getIdToken();
          if (!token) throw new Error("Sign in again to open the issued invoice document.");
          if (rawInvoice.issuedDocument?.status !== "stored") {
            const generation = await fetch(`/api/invoices/${id}/issued-document`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!generation.ok) {
              const body = await generation.json().catch(() => ({}));
              throw new Error(body.error || "The final issued invoice PDF could not be generated.");
            }
          }
          const response = await fetch(
            `/api/invoices/${id}/issued-document${requestedAction === "download" ? "?download=1" : ""}`,
            { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
          );
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || "The stored issued invoice PDF could not be loaded.");
          }
          const blob = await response.blob();
          if (!active) return;
          const objectUrl = URL.createObjectURL(blob);
          setInvoice(parseInvoiceRecord(rawInvoice));
          if (requestedAction === "download") {
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download =
              rawInvoice.issuedDocument?.filename ||
              `${rawInvoice.invoiceNumber || "issued-invoice"}.pdf`;
            link.click();
          }
          setIssuedPdfUrl(objectUrl);
          return;
        }
        const bookingSnap = await getDoc(doc(db, "bookings", id));
        if (!active) return;
        const loadedBooking = bookingSnap.exists()
          ? { id: bookingSnap.id, ...bookingSnap.data() }
          : { id };
        setInvoice(parseInvoiceRecord(
          rawInvoice,
          loadedBooking
        ));
        setBooking(bookingSnap.exists() ? loadedBooking : null);
      } catch (loadError) {
        if (active) setError(loadError?.message || "The invoice document could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    };
    if (id) load();
    return () => {
      active = false;
    };
  }, [id, requestedAction]);

  useEffect(
    () => () => {
      if (issuedPdfUrl) URL.revokeObjectURL(issuedPdfUrl);
    },
    [issuedPdfUrl]
  );

  useEffect(() => {
    if (
      loading ||
      !invoice ||
      invoice.status === "issued" ||
      requestedAction !== "download" ||
      handledAction.current
    ) return;
    handledAction.current = true;
    const previousTitle = document.title;
    document.title = `${invoice.invoiceNumber || getInvoiceDraftReferenceDisplay(invoice)} - ${deployment.legalName}`;
    const timer = window.setTimeout(() => {
      systemDialogs.showSystemNotification("Choose “Save as PDF” in the print dialog to download this A4 invoice.");
      window.print();
      window.setTimeout(() => {
        document.title = previousTitle;
      }, 500);
    }, 350);
    return () => {
      window.clearTimeout(timer);
      document.title = previousTitle;
    };
  }, [deployment.legalName, id, invoice, loading, requestedAction]);

  const lines = useMemo(
    () =>
      (Array.isArray(invoice?.lines) ? invoice.lines : []).filter(
        (line) => text(line.description) || Number(line.quantity) || Number(line.unitPrice)
      ),
    [invoice]
  );

  if (loading) return <main className={styles.state}>Loading invoice document…</main>;
  if (error || !invoice) {
    return (
      <main className={styles.state}>
        <h1>Invoice unavailable</h1>
        <p>{error || "Invoice not found."}</p>
        <button onClick={() => router.push(`/invoice/${id}`)}>Back to invoice</button>
      </main>
    );
  }

  if (invoice.status === "issued") {
    return (
      <main className={styles.issuedScreen}>
        <div className={styles.toolbar}>
          <button onClick={() => router.push(`/invoice/${id}`)}><ArrowLeft size={16} /> Invoice</button>
          <div>
            <strong>Final issued invoice</strong>
            <span>{invoice.invoiceNumber}</span>
          </div>
          <div className={styles.toolbarActions}>
            <button onClick={() => document.querySelector(`.${styles.issuedFrame}`)?.contentWindow?.print()}>
              <Printer size={16} /> Print
            </button>
            <button
              className={styles.primaryButton}
              onClick={() => {
                const link = document.createElement("a");
                link.href = issuedPdfUrl;
                link.download = invoice.issuedDocument?.filename || `${invoice.invoiceNumber}.pdf`;
                link.click();
              }}
            >
              <Download size={16} /> Download exact PDF
            </button>
          </div>
        </div>
        <p className={styles.authoritativeNotice}>
          Authoritative issued document · stored immutably · generated from the issued snapshot
        </p>
        <iframe
          className={styles.issuedFrame}
          src={issuedPdfUrl}
          title={`Issued invoice ${invoice.invoiceNumber}`}
        />
      </main>
    );
  }

  const currency = invoice.currency || "GBP";
  const customer = invoice.customer || {};
  const issueDate = invoice.issueDate || invoice.issuedAt || invoice.createdAt;
  const dueDate =
    invoice.dueDate ||
    (toDate(issueDate)
      ? new Date(toDate(issueDate).getTime() + Number(invoice.paymentTermsDays || 30) * 86400000)
      : null);
  const jobDates = Array.isArray(invoice.dates)
    ? invoice.dates.map((date) => dateLabel(date)).filter((date) => date !== "—").join(", ")
    : "";
  const identity = getInvoiceIdentityDisplay(invoice);
  const supplier = invoice.issuedSnapshot?.supplier || {
    legalName: deployment.legalName,
    description: deployment.companyDescription,
    website: deployment.companyWebsite,
  };

  return (
    <main className={styles.screen}>
      <div className={styles.toolbar}>
        <button onClick={() => router.push(`/invoice/${id}`)}><ArrowLeft size={16} /> Invoice</button>
        <div>
          <strong>A4 {identity.isDraft ? "draft invoice" : "invoice"} preview</strong>
          <span>{identity.isDraft ? identity.draftReference : identity.officialNumber}</span>
        </div>
        <div className={styles.toolbarActions}>
          <button onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button className={styles.primaryButton} onClick={() => window.print()}><Download size={16} /> Save PDF</button>
        </div>
      </div>

      <article className={styles.paper}>
        {identity.isDraft ? (
          <div className={styles.draftBanner}>DRAFT — NOT ISSUED</div>
        ) : null}
        <header className={styles.documentHeader}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={deployment.companyLogoUrl} alt={supplier.legalName} />
          <div className={styles.invoiceIdentity}>
            <p>{identity.documentLabel.toUpperCase()}</p>
            <h1>{identity.isDraft ? identity.draftReference : identity.officialNumber}</h1>
            <small>Official invoice number: {identity.officialNumber}</small>
            <span className={styles.status}>{invoiceStatus(invoice.status)}</span>
          </div>
        </header>

        <section className={styles.parties}>
          <div>
            <span className={styles.eyebrow}>From</span>
            <strong>{supplier.legalName}</strong>
            <p>{supplier.description}</p>
            <p>{supplier.website}</p>
          </div>
          <div>
            <span className={styles.eyebrow}>Invoice to</span>
            <strong>{customer.name || invoice.client || booking?.client || "—"}</strong>
            {customer.contactName ? <p>{customer.contactName}</p> : null}
            {customer.address ? (
              <p className={styles.preserveLines}>
                {typeof customer.address === "string"
                  ? customer.address
                  : [
                      customer.address.line1,
                      customer.address.line2,
                      customer.address.city,
                      customer.address.county,
                      customer.address.postcode,
                      customer.billingCountry,
                    ].filter(Boolean).join("\n")}
              </p>
            ) : null}
            {customer.email ? <p>{customer.email}</p> : null}
            {customer.phone ? <p>{customer.phone}</p> : null}
          </div>
        </section>

        <section className={styles.metadata}>
          <div><span>Draft reference</span><strong>{identity.draftReference}</strong></div>
          <div><span>Official invoice number</span><strong>{identity.officialNumber}</strong></div>
          <div><span>Invoice date</span><strong>{dateLabel(issueDate, "Draft")}</strong></div>
          <div><span>Due date</span><strong>{dateLabel(dueDate)}</strong></div>
          <div><span>Job number</span><strong>{invoice.jobNumber || booking?.jobNumber || "—"}</strong></div>
          <div><span>PO number</span><strong>{invoice.purchaseOrderNumber || "—"}</strong></div>
          <div><span>Source quote</span><strong>{invoice.sourceQuote?.quoteNumber || "—"}</strong></div>
          <div><span>Payment terms</span><strong>{Number(invoice.paymentTermsDays || 30)} days</strong></div>
        </section>

        {(invoice.location || jobDates) ? (
          <section className={styles.jobStrip}>
            {invoice.location ? <div><span>Location</span><strong>{invoice.location}</strong></div> : null}
            {jobDates ? <div><span>Job dates</span><strong>{jobDates}</strong></div> : null}
          </section>
        ) : null}

        <table className={styles.linesTable}>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>VAT</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const section = text(line.section);
              const previousSection = index > 0 ? text(lines[index - 1]?.section) : "";
              return (
                <Fragment key={line.id || index}>
                  {section && section !== previousSection ? (
                    <tr className={styles.sectionRow}>
                      <td colSpan={5}>{section}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td>
                      <strong>{line.description || "Invoice item"}</strong>
                      {line.notes ? <small>{line.notes}</small> : null}
                    </td>
                    <td>{Number(line.quantity || 0).toLocaleString("en-GB")}</td>
                    <td>{money(line.unitPrice, currency)}</td>
                    <td>{Number(line.taxRate || 0)}%</td>
                    <td>{money(line.net, currency)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>

        <section className={styles.lowerSection}>
          <div className={styles.paymentNotes}>
            <span className={styles.eyebrow}>Payment information</span>
            <p>Payment due within {Number(invoice.paymentTermsDays || 30)} days.</p>
            {identity.isDraft ? (
              <p>This draft is not issued and is not a request for payment.</p>
            ) : (
              <p>Please quote invoice number <strong>{identity.officialNumber}</strong> with payment.</p>
            )}
            {invoice.notes ? (
              <>
                <span className={styles.eyebrow}>Invoice notes</span>
                <p className={styles.preserveLines}>{invoice.notes}</p>
              </>
            ) : null}
          </div>
          <div className={styles.totals}>
            <div><span>Net total</span><strong>{money(invoice.totals?.net, currency)}</strong></div>
            <div><span>VAT total</span><strong>{money(invoice.totals?.tax, currency)}</strong></div>
            <div className={styles.grandTotal}><span>Total due</span><strong>{money(invoice.totals?.gross, currency)}</strong></div>
          </div>
        </section>

        <footer className={styles.documentFooter}>
          <span>{supplier.legalName} · {supplier.description}</span>
          <span>{identity.isDraft ? identity.draftReference : `Invoice ${identity.officialNumber}`} · Page 1</span>
        </footer>
      </article>
    </main>
  );
}
