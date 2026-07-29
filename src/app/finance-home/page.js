"use client";

import layoutStyles from "./page.styles.module.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useRouter } from "next/navigation";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import {
  FINANCE_GROUP_LABELS,
  FINANCE_GROUPS,
  buildFinanceRows,
  countFinanceGroups,
  financeRowMatchesSearch,
} from "@/app/utils/financeInvoiceClassification";
import { getInvoiceDraftReferenceDisplay } from "@/app/utils/invoiceLifecycle";

const GROUP_ORDER = [
  FINANCE_GROUPS.READY_FOR_FINANCE,
  FINANCE_GROUPS.DRAFT,
  FINANCE_GROUPS.PENDING_APPROVAL,
  FINANCE_GROUPS.APPROVED,
  FINANCE_GROUPS.EXPORT_PENDING,
  FINANCE_GROUPS.EXPORTING,
  FINANCE_GROUPS.SYNC_FAILED,
  FINANCE_GROUPS.ISSUED,
  FINANCE_GROUPS.PART_PAID,
  FINANCE_GROUPS.PAID,
  FINANCE_GROUPS.VOID,
  FINANCE_GROUPS.DISPUTED,
  FINANCE_GROUPS.CREDITED,
  FINANCE_GROUPS.WRITTEN_OFF,
  FINANCE_GROUPS.EXCEPTION,
];

const fmtDate = (value, fallback = "—") => {
  if (!value) return fallback;
  try {
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString("en-GB");
  } catch {
    return fallback;
  }
};

const money = (value, currency = "GBP") =>
  Number.isFinite(Number(value))
    ? new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: currency || "GBP",
      }).format(Number(value))
    : "—";

const rowTimestamp = (row) =>
  Date.parse(row.updatedAt || row.issuedAt || row.createdAt || 0) || 0;

const actionForRow = (row) => {
  const invoiceRoute = `/invoice/${row.bookingId || row.id}`;
  const previewRoute = `/invoice-view/${row.invoice?.id || row.id}`;
  const financeReviewRoute = `/job-summary/${row.bookingId || row.id}`;
  const actions = {
    ready_for_finance: ["Open finance review", financeReviewRoute],
    draft: ["Open draft", invoiceRoute],
    pending_approval: ["Review approval", invoiceRoute],
    approved: ["Open approved invoice", invoiceRoute],
    export_pending: ["View pending export", invoiceRoute],
    exporting: ["View export", invoiceRoute],
    sync_failed: ["View sync error", invoiceRoute],
    issued: ["View payment status", previewRoute],
    part_paid: ["View payment status", previewRoute],
    paid: ["View invoice", previewRoute],
    void: ["View invoice", previewRoute],
    disputed: ["View invoice", previewRoute],
    credited: ["View invoice", previewRoute],
    written_off: ["View invoice", previewRoute],
    exception: [row.invoice ? "Review invoice data" : "Review job data", row.invoice ? invoiceRoute : financeReviewRoute],
  };
  return actions[row.group] || ["Open", invoiceRoute];
};

const statusPalette = {
  ready_for_finance: ["var(--color-info-soft)", "var(--color-brand)"],
  draft: ["var(--color-warning-soft)", "var(--color-warning)"],
  pending_approval: ["var(--color-warning-soft)", "var(--color-warning)"],
  approved: ["var(--color-success-soft)", "var(--color-success)"],
  export_pending: ["var(--color-info-soft)", "var(--color-info)"],
  exporting: ["var(--color-info-soft)", "var(--color-info)"],
  sync_failed: ["var(--color-danger-soft)", "var(--color-danger)"],
  issued: ["var(--color-info-soft)", "var(--color-info)"],
  part_paid: ["var(--color-warning-soft)", "var(--color-warning)"],
  paid: ["var(--color-success-soft)", "var(--color-success)"],
  void: ["var(--color-surface-hover)", "var(--color-text-muted)"],
  disputed: ["var(--color-warning-soft)", "var(--color-warning)"],
  credited: ["var(--color-surface-hover)", "var(--color-text-muted)"],
  written_off: ["var(--color-surface-hover)", "var(--color-text-muted)"],
  exception: ["var(--color-danger-soft)", "var(--color-danger)"],
};

function StatusBadge({ row }) {
  const [background, color] =
    statusPalette[row.group] || statusPalette.exception;
  return (
    <span
      title={row.isLegacyStatus ? `Legacy status: ${row.legacyStatus}` : row.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 9px",
        borderRadius: 999,
        background,
        color,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {row.label}
      {row.isLegacyStatus ? " · Legacy" : ""}
    </span>
  );
}

export default function FinanceDashboard() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, {
        collectionName: "invoiceQueue",
        operation: "load Finance Home",
      });
      setBookings([]);
      setInvoices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const [bookingSnapshot, invoiceSnapshot] = await Promise.all([
        getDocs(tenantCollectionQuery(db, "bookings", dataAccessState)),
        getDocs(tenantCollectionQuery(db, "invoiceQueue", dataAccessState)),
      ]);
      setBookings(
        bookingSnapshot.docs.map((snapshot) => ({
          id: snapshot.id,
          ...snapshot.data(),
        }))
      );
      setInvoices(
        invoiceSnapshot.docs.map((snapshot) => ({
          id: snapshot.id,
          ...snapshot.data(),
        }))
      );
    } catch (error) {
      setLoadError(error?.message || "Finance records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [dataAccessState]);

  useEffect(() => {
    load();
  }, [accessKey, load]);

  const classifiedRows = useMemo(
    () => buildFinanceRows({ bookings, invoices }),
    [bookings, invoices]
  );
  const counts = useMemo(
    () => countFinanceGroups(classifiedRows),
    [classifiedRows]
  );
  const visibleRows = useMemo(() => {
    const rows = classifiedRows.filter(
      (row) =>
        (filter === "all" || row.group === filter) &&
        financeRowMatchesSearch(row, search)
    );
    return rows.sort((a, b) => rowTimestamp(b) - rowTimestamp(a));
  }, [classifiedRows, filter, search]);

  const pageWrap = {
    padding: "28px 24px",
    minHeight: "100vh",
    color: "var(--color-text)",
    background: "var(--color-surface-subtle)",
  };
  const panel = {
    overflow: "hidden",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 14,
    boxShadow: "var(--shadow-sm)",
  };
  const controls = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "18px 0",
    flexWrap: "wrap",
  };
  const control = {
    minHeight: 40,
    padding: "8px 11px",
    color: "var(--color-text)",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 9,
  };
  const table = { width: "100%", borderCollapse: "collapse" };
  const th = {
    padding: "11px 10px",
    color: "var(--color-text-muted)",
    background: "var(--color-surface-subtle)",
    borderBottom: "1px solid var(--color-border)",
    fontSize: 11,
    fontWeight: 900,
    textAlign: "left",
    textTransform: "uppercase",
  };
  const td = {
    padding: "12px 10px",
    borderBottom: "1px solid var(--color-border)",
    fontSize: 13,
    verticalAlign: "top",
  };

  return (
    <HeaderSidebarLayout>
      <main style={pageWrap}>
        <div>
          <h1 className={layoutStyles.extracted2}>Finance Home</h1>
          <p className={layoutStyles.extracted3}>
            Invoice records are the authority for lifecycle status. Finance Home is read-only for issue and payment transitions.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 9,
            marginTop: 18,
          }}
        >
          {GROUP_ORDER.filter(
            (group) =>
              counts[group] ||
              [
                FINANCE_GROUPS.READY_FOR_FINANCE,
                FINANCE_GROUPS.DRAFT,
                FINANCE_GROUPS.APPROVED,
                FINANCE_GROUPS.ISSUED,
                FINANCE_GROUPS.PART_PAID,
                FINANCE_GROUPS.PAID,
                FINANCE_GROUPS.EXCEPTION,
              ].includes(group)
          ).map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setFilter(filter === group ? "all" : group)}
              style={{
                ...panel,
                padding: 12,
                cursor: "pointer",
                textAlign: "left",
                outline:
                  filter === group
                    ? "2px solid var(--color-brand)"
                    : "none",
              }}
            >
              <span style={{ display: "block", color: "var(--color-text-muted)", fontSize: 11, fontWeight: 800 }}>
                {FINANCE_GROUP_LABELS[group]}
              </span>
              <strong style={{ display: "block", marginTop: 3, fontSize: 23 }}>
                {counts[group] || 0}
              </strong>
            </button>
          ))}
        </div>

        <div style={controls}>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} style={control}>
            <option value="all">All finance records</option>
            {GROUP_ORDER.map((group) => (
              <option key={group} value={group}>
                {FINANCE_GROUP_LABELS[group]}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search job, client, draft reference, invoice number or PO"
            style={{ ...control, minWidth: 360 }}
          />
          <button type="button" onClick={load} style={{ ...control, cursor: "pointer", fontWeight: 800 }}>
            Refresh
          </button>
          <span style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: 12 }}>
            {visibleRows.length} of {classifiedRows.length} records
          </span>
        </div>

        {loadError ? (
          <div style={{ marginBottom: 12, padding: 12, color: "var(--color-danger)", background: "var(--color-danger-soft)", borderRadius: 9 }}>
            {loadError}
          </div>
        ) : null}

        <section style={panel}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Job / customer</th>
                <th style={th}>Invoice identity</th>
                <th style={th}>Status</th>
                <th style={th}>Total / balance</th>
                <th style={th}>Dates</th>
                <th style={th}>Current action</th>
              </tr>
            </thead>
            <tbody>
              {!visibleRows.length ? (
                <tr>
                  <td colSpan={6} style={{ ...td, padding: 28, textAlign: "center", color: "var(--color-text-muted)" }}>
                    {loading ? "Loading finance records…" : "No records match this view."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const [actionLabel, actionHref] = actionForRow(row);
                  const gross = row.totals?.gross ?? row.invoiceTotal ?? row.total;
                  const outstanding =
                    row.outstandingBalance ??
                    (Number.isFinite(Number(gross)) && Number.isFinite(Number(row.amountPaid))
                      ? Number(gross) - Number(row.amountPaid)
                      : null);
                  return (
                    <tr key={`${row.bookingId}-${row.id}-${row.group}`}>
                      <td style={td}>
                        <strong>Job #{row.jobNumber || row.bookingId || "—"}</strong>
                        <span style={{ display: "block", marginTop: 3, color: "var(--color-text-muted)" }}>
                          {row.customer?.name || row.client || "Customer not recorded"}
                        </span>
                        {row.purchaseOrderNumber || row.poNumber || row.finance?.poNumber ? (
                          <small style={{ display: "block", marginTop: 4 }}>
                            PO: {row.purchaseOrderNumber || row.poNumber || row.finance?.poNumber}
                          </small>
                        ) : null}
                      </td>
                      <td style={td}>
                        <strong>{getInvoiceDraftReferenceDisplay(row)}</strong>
                        <span style={{ display: "block", marginTop: 4, color: "var(--color-text-muted)" }}>
                          {row.invoiceNumber
                            ? `Official: ${row.invoiceNumber}`
                            : "Official invoice number pending"}
                        </span>
                      </td>
                      <td style={td}>
                        <StatusBadge row={row} />
                        {row.warnings?.map((warning) => (
                          <div key={warning} style={{ maxWidth: 260, marginTop: 6, color: "var(--color-danger)", fontSize: 11, fontWeight: 700 }}>
                            ⚠ {warning}
                          </div>
                        ))}
                      </td>
                      <td style={td}>
                        <strong>{money(gross, row.currency)}</strong>
                        <span style={{ display: "block", marginTop: 4, color: "var(--color-text-muted)" }}>
                          Outstanding: {money(outstanding, row.currency)}
                        </span>
                      </td>
                      <td style={td}>
                        <span>Issued: {fmtDate(row.issueDate || row.issuedAt)}</span>
                        <span style={{ display: "block", marginTop: 4 }}>Due: {fmtDate(row.dueDate)}</span>
                      </td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => router.push(actionHref)}
                          style={{
                            minHeight: 36,
                            padding: "8px 11px",
                            color: "var(--color-text)",
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-border-strong)",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          {actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </main>
    </HeaderSidebarLayout>
  );
}
