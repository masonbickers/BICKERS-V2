"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldCheck,
  TabletSmartphone,
  UserX,
  Smartphone,
  Trash2,
  XCircle,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { auth } from "../../../../firebaseConfig";

const UI = {
  radius: 8,
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  ok: "#15803d",
  okSoft: "#edf7f2",
  warn: "#b45309",
  warnSoft: "#fffbeb",
  danger: "#b91c1c",
  dangerSoft: "#fff1f2",
  neutral: "#64748b",
  neutralSoft: "#f1f5f9",
};

const STATUS_META = {
  fail: { label: "Fail", color: UI.danger, bg: UI.dangerSoft, Icon: XCircle },
  warn: { label: "Warn", color: UI.warn, bg: UI.warnSoft, Icon: AlertTriangle },
  pass: { label: "Pass", color: UI.ok, bg: UI.okSoft, Icon: CheckCircle2 },
  app: { label: "App-only", color: UI.brand, bg: UI.brandSoft, Icon: TabletSmartphone },
  noLogin: { label: "No-login", color: UI.neutral, bg: UI.neutralSoft, Icon: UserX },
  disabled: { label: "Disabled", color: UI.neutral, bg: UI.neutralSoft, Icon: ShieldCheck },
  device: { label: "Device", color: UI.neutral, bg: UI.neutralSoft, Icon: Smartphone },
};

const FILTERS = ["all", "fail", "warn", "pass", "app", "noLogin", "disabled", "device"];

export default function SecurityAuditPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [audit, setAudit] = useState({ rows: [], summary: null, generatedAt: "" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deletingRowId, setDeletingRowId] = useState("");
  const [selectedRows, setSelectedRows] = useState({});
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadAudit = async (user, { silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setRefreshing(true);
      setError("");
      if (!silent) setNotice("");
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/security-audit", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load security audit.");
      setAudit({
        rows: Array.isArray(data.rows) ? data.rows : [],
        summary: data.summary || null,
        generatedAt: data.generatedAt || "",
      });
    } catch (err) {
      setError(err?.message || "Could not load security audit.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      await loadAudit(user);
    });
    return () => unsub();
  }, [router]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (audit.rows || []).filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return [
        row.email,
        row.name,
        row.uid,
        row.id,
        row.role,
        row.defaultWorkspace,
        ...(row.employeeIds || []),
        ...(row.issues || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [audit.rows, query, statusFilter]);

  const refresh = () => {
    const user = auth.currentUser;
    if (user) loadAudit(user, { silent: true });
  };

  const bulkDeletableRows = useMemo(
    () => filteredRows.filter(canBulkDeleteAuditRow),
    [filteredRows]
  );

  const selectedDeletableRows = useMemo(
    () => bulkDeletableRows.filter((row) => selectedRows[rowKey(row)]),
    [bulkDeletableRows, selectedRows]
  );

  const toggleRowSelection = (row) => {
    const key = rowKey(row);
    setSelectedRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleAllVisibleDeletable = () => {
    const allSelected =
      bulkDeletableRows.length > 0 &&
      bulkDeletableRows.every((row) => selectedRows[rowKey(row)]);
    setSelectedRows((prev) => {
      const next = { ...prev };
      bulkDeletableRows.forEach((row) => {
        next[rowKey(row)] = !allSelected;
      });
      return next;
    });
  };

  const deleteAuditRow = async (row) => {
    if (!canDeleteAuditRow(row)) {
      setError("Only user/device access records can be deleted from this view.");
      setNotice("");
      return;
    }

    const label = row.email || row.name || row.uid || row.id;
    const activeWarning =
      row.status === "disabled" || row.status === "device"
        ? ""
        : "\n\nThis is not a disabled/device row. Make sure this account is genuinely unwanted.";
    const confirmed = window.confirm(
      `Delete access record for ${label}?\n\nThis deletes only this selected Firestore users record and matching MFA/passkey security records for its UID. It does not delete bookings, employees, timesheets, or the Firebase Authentication login.${activeWarning}`
    );
    if (!confirmed) return;

    const user = auth.currentUser;
    if (!user) {
      setError("You need to sign in again.");
      setNotice("");
      return;
    }

    const rowId = rowKey(row);
    try {
      setDeletingRowId(rowId);
      setError("");
      setNotice("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/users/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not delete access record.");
      setSelectedRows((prev) => {
        const next = { ...prev };
        delete next[rowKey(row)];
        return next;
      });
      await loadAudit(user, { silent: true });
    } catch (err) {
      setError(err?.message || "Could not delete access record.");
      setNotice("");
    } finally {
      setDeletingRowId("");
    }
  };

  const bulkDeleteRows = async (rows, label) => {
    if (!rows.length) return;

    const confirmed = window.confirm(
      `Delete ${rows.length} ${label} access record${rows.length === 1 ? "" : "s"}?\n\nThis only deletes disabled/device users records and matching MFA/passkey records. Live fail, warn, and pass accounts are not included.`
    );
    if (!confirmed) return;

    const user = auth.currentUser;
    if (!user) {
      setError("You need to sign in again.");
      setNotice("");
      return;
    }

    try {
      setBulkDeleting(true);
      setError("");
      setNotice("");
      const token = await user.getIdToken();
      let deleted = 0;
      for (const row of rows) {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(row.id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Could not delete ${row.id}.`);
        deleted += 1;
      }
      setSelectedRows({});
      await loadAudit(user, { silent: true });
      setNotice(`Deleted ${deleted} disabled/device access record${deleted === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err?.message || "Bulk delete failed.");
      setNotice("");
    } finally {
      setBulkDeleting(false);
    }
  };

  const bulkDeleteSelected = async () => {
    await bulkDeleteRows(selectedDeletableRows, "selected cleanup");
  };

  const bulkDeleteVisibleCleanup = async () => {
    await bulkDeleteRows(bulkDeletableRows, "visible cleanup");
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={pageHeader}>
          <div>
            <h1 style={h1Style}>Security Audit</h1>
            <div style={pageSub}>
              Read-only user, access, MFA, passkey, and employee-link status.
            </div>
          </div>

          <div style={headerActions}>
            <button type="button" onClick={() => router.push("/admin")} style={btnStyle}>
              <ArrowLeft size={14} />
              Admin
            </button>
            <button type="button" onClick={refresh} disabled={refreshing} style={btnStyle}>
              <RefreshCw size={14} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {error ? <div style={errorBox}>{error}</div> : null}
        {notice ? <div style={noticeBox}>{notice}</div> : null}

        <div style={statGrid}>
          <Stat label="Total" value={audit.summary?.total || 0} tone="neutral" />
          <Stat label="Fail" value={audit.summary?.fail || 0} tone="fail" />
          <Stat label="Warn" value={audit.summary?.warn || 0} tone="warn" />
          <Stat label="Pass" value={audit.summary?.pass || 0} tone="pass" />
          <Stat label="App-only" value={audit.summary?.app || 0} tone="app" />
          <Stat label="No-login" value={audit.summary?.noLogin || 0} tone="noLogin" />
          <Stat label="Disabled" value={audit.summary?.disabled || 0} tone="disabled" />
          <Stat label="Device" value={audit.summary?.device || 0} tone="device" />
          <Stat label="Legacy MFA" value={audit.summary?.legacyMfaSecrets || 0} tone="warn" />
        </div>

        <div style={toolbar}>
          <div style={searchWrap}>
            <Search size={15} color={UI.muted} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users, issues, uid, employee id..."
              style={searchInput}
            />
          </div>

          <div style={filterWrap}>
            {FILTERS.map((filter) => {
              const active = statusFilter === filter;
              return (
                <button
                  type="button"
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  style={{
                    ...filterButton,
                    ...(active ? filterButtonActive : {}),
                  }}
                >
                  {filter === "all" ? "All" : STATUS_META[filter]?.label || filter}
                </button>
              );
            })}
          </div>
        </div>

        <div style={bulkBar}>
          <button
            type="button"
            onClick={toggleAllVisibleDeletable}
            disabled={bulkDeletableRows.length === 0 || bulkDeleting}
            style={btnStyle}
          >
            {bulkDeletableRows.length > 0 &&
            bulkDeletableRows.every((row) => selectedRows[rowKey(row)])
              ? "Clear visible cleanup"
              : "Select visible cleanup"}
          </button>
          <button
            type="button"
            onClick={bulkDeleteSelected}
            disabled={selectedDeletableRows.length === 0 || bulkDeleting}
            style={{
              ...deleteButton,
              ...(selectedDeletableRows.length === 0 || bulkDeleting ? deleteButtonDisabled : {}),
            }}
          >
            <Trash2 size={13} />
            {bulkDeleting
              ? "Deleting..."
              : `Delete selected (${selectedDeletableRows.length})`}
          </button>
          <button
            type="button"
            onClick={bulkDeleteVisibleCleanup}
            disabled={bulkDeletableRows.length === 0 || bulkDeleting}
            style={{
              ...deleteButton,
              ...(bulkDeletableRows.length === 0 || bulkDeleting ? deleteButtonDisabled : {}),
            }}
          >
            <Trash2 size={13} />
            {bulkDeleting
              ? "Deleting..."
              : `Delete all visible cleanup (${bulkDeletableRows.length})`}
          </button>
          <span style={bulkHint}>
            Cleanup selection only includes disabled/device rows in the current view.
          </span>
        </div>

        <div style={cardStyle}>
          <div style={tableHeader}>
            <div>
              <div style={cardTitle}>Access Accounts</div>
              <div style={cardSub}>
                {filteredRows.length} shown
                {audit.generatedAt ? `, generated ${formatDateTime(audit.generatedAt)}` : ""}
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Clean</Th>
                  <Th>Status</Th>
                  <Th>User</Th>
                  <Th>Access</Th>
                  <Th>Phone / MFA</Th>
                  <Th>Secrets</Th>
                  <Th>Employee</Th>
                  <Th>Issues</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={emptyTd}>Loading security audit...</td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={emptyTd}>No rows match this view.</td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <AuditRow
                      key={rowKey(row)}
                      row={row}
                      deleting={deletingRowId === rowKey(row)}
                      onDelete={deleteAuditRow}
                      selected={!!selectedRows[rowKey(row)]}
                      onToggleSelected={toggleRowSelection}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

function AuditRow({ row, deleting, onDelete, selected, onToggleSelected }) {
  const deleteAllowed = canDeleteAuditRow(row);
  const bulkAllowed = canBulkDeleteAuditRow(row);

  return (
    <tr style={rowStyle}>
      <Td>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(row)}
          disabled={!bulkAllowed}
          title={
            bulkAllowed
              ? "Select disabled/device record for cleanup"
              : "Only disabled/device rows can be bulk selected"
          }
          style={checkboxStyle}
        />
      </Td>
      <Td>
        <StatusPill status={row.status} />
      </Td>
      <Td>
        <div style={strongText}>{row.email || "-"}</div>
        <div style={mutedText}>{row.name || "-"}</div>
        <div style={tinyMono}>{row.uid || row.id || "-"}</div>
      </Td>
      <Td>
        <div style={strongText}>{row.role || "-"}</div>
        <div style={pillLine}>
          <SmallPill good={row.appAccess?.user}>User</SmallPill>
          <SmallPill good={row.appAccess?.service}>Service</SmallPill>
        </div>
        <div style={mutedText}>Default: {row.defaultWorkspace || "-"}</div>
      </Td>
      <Td>
        <div style={pillLine}>
          <SmallPill good={row.phoneVerified}>Phone</SmallPill>
          <SmallPill good={row.mfaEnabled}>MFA</SmallPill>
          {row.mfaResetRequired ? <SmallPill good={false}>Reset</SmallPill> : null}
        </div>
        <div style={mutedText}>{row.phone || row.mfaPhoneNumber || "-"}</div>
        <div style={mutedText}>{row.mfaEnrolledAt ? formatDateTime(row.mfaEnrolledAt) : "No MFA date"}</div>
      </Td>
      <Td>
        <div style={pillLine}>
          <SmallPill good={row.privateMfaSecretPresent}>Private</SmallPill>
          <SmallPill good={!row.legacyMfaSecretPresent}>Legacy</SmallPill>
        </div>
        <div style={mutedText}>Passkeys: {row.passkeyCount || 0}</div>
      </Td>
      <Td>
        <div style={strongText}>{row.employeeIds?.length ? row.employeeIds.join(", ") : "-"}</div>
        <div style={mutedText}>Code present: {row.employeeCodePresent ? "yes" : "no"}</div>
        {row.duplicateEmailCount > 1 ? <div style={warnText}>Duplicates: {row.duplicateEmailCount}</div> : null}
      </Td>
      <Td>
        {row.issues?.length ? (
          <div style={issueList}>
            {row.issues.map((issue) => (
              <span key={issue} style={issuePill}>{issue}</span>
            ))}
          </div>
        ) : (
          <span style={okText}>No issues</span>
        )}
      </Td>
      <Td>
        <button
          type="button"
          onClick={() => onDelete(row)}
          disabled={!deleteAllowed || deleting}
          style={{
            ...deleteButton,
            ...(!deleteAllowed || deleting ? deleteButtonDisabled : {}),
          }}
          title={
            deleteAllowed
              ? "Delete this selected access record"
              : "Employee-only rows cannot be deleted from users"
          }
        >
          <Trash2 size={13} />
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </Td>
    </tr>
  );
}

function rowKey(row) {
  return `${row.source}:${row.id || row.email || row.uid}`;
}

function canDeleteAuditRow(row) {
  return !!row?.id && (row.source === "users" || row.source === "devices");
}

function canBulkDeleteAuditRow(row) {
  return canDeleteAuditRow(row) && (row.status === "disabled" || row.status === "device");
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.warn;
  const Icon = meta.Icon;
  return (
    <span style={{ ...statusPill, color: meta.color, background: meta.bg, borderColor: meta.color }}>
      <Icon size={13} />
      {meta.label}
    </span>
  );
}

function SmallPill({ good, children }) {
  return (
    <span
      style={{
        ...smallPill,
        background: good ? UI.okSoft : UI.warnSoft,
        color: good ? UI.ok : UI.warn,
        borderColor: good ? "#bbf7d0" : "#fed7aa",
      }}
    >
      {children}
    </span>
  );
}

function Stat({ label, value, tone }) {
  const meta = tone === "fail"
    ? STATUS_META.fail
    : tone === "warn"
      ? STATUS_META.warn
        : tone === "pass"
          ? STATUS_META.pass
          : tone === "app"
            ? STATUS_META.app
            : tone === "noLogin"
              ? STATUS_META.noLogin
              : tone === "disabled"
                ? STATUS_META.disabled
                : tone === "device"
                  ? STATUS_META.device
                  : { color: UI.brand, bg: UI.brandSoft };

  return (
    <div style={statCard}>
      <div style={{ ...statAccent, background: meta.bg, color: meta.color }}>{value}</div>
      <div>
        <div style={statLabel}>{label}</div>
        <div style={statSub}>accounts</div>
      </div>
    </div>
  );
}

function Th({ children }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children }) {
  return <td style={tdStyle}>{children}</td>;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const pageWrap = {
  padding: 16,
  minHeight: "100vh",
  background: UI.bg,
  color: UI.text,
};

const pageHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const h1Style = {
  margin: 0,
  fontSize: 26,
  fontWeight: 900,
  color: UI.text,
};

const pageSub = {
  marginTop: 5,
  color: UI.muted,
  fontSize: 13,
  fontWeight: 700,
};

const headerActions = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const btnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radius,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.card,
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
  color: UI.text,
};

const statGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const statCard = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 12,
  border: UI.border,
  borderRadius: UI.radius,
  background: UI.card,
};

const statAccent = {
  minWidth: 42,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 19,
  fontWeight: 900,
};

const statLabel = {
  fontSize: 12,
  fontWeight: 900,
  color: UI.text,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const statSub = {
  marginTop: 3,
  fontSize: 12,
  color: UI.muted,
  fontWeight: 700,
};

const toolbar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 14,
};

const bulkBar = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
  padding: 10,
  border: UI.border,
  borderRadius: UI.radius,
  background: UI.card,
};

const bulkHint = {
  color: UI.muted,
  fontSize: 12,
  fontWeight: 800,
};

const searchWrap = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: 420,
  maxWidth: "100%",
  padding: "0 10px",
  border: UI.border,
  borderRadius: UI.radius,
  background: UI.card,
};

const searchInput = {
  width: "100%",
  minWidth: 0,
  height: 36,
  border: 0,
  outline: "none",
  background: "transparent",
  fontWeight: 700,
  color: UI.text,
};

const filterWrap = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
};

const filterButton = {
  padding: "8px 10px",
  borderRadius: UI.radius,
  border: UI.border,
  background: UI.card,
  color: UI.text,
  fontWeight: 850,
  cursor: "pointer",
};

const filterButtonActive = {
  borderColor: UI.brand,
  background: UI.brandSoft,
  color: UI.brand,
};

const cardStyle = {
  marginTop: 14,
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  overflow: "hidden",
};

const tableHeader = {
  padding: 12,
  borderBottom: UI.border,
};

const cardTitle = {
  fontSize: 15,
  fontWeight: 900,
};

const cardSub = {
  marginTop: 3,
  color: UI.muted,
  fontSize: 12,
  fontWeight: 700,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
};

const thStyle = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: UI.border,
  background: "#f8fafc",
  color: UI.muted,
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const checkboxStyle = {
  width: 16,
  height: 16,
  cursor: "pointer",
};

const tdStyle = {
  padding: "10px",
  borderBottom: UI.border,
  verticalAlign: "top",
  fontSize: 13,
};

const rowStyle = {
  background: UI.card,
};

const emptyTd = {
  padding: 16,
  color: UI.muted,
  fontWeight: 800,
};

const statusPill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 8px",
  border: "1px solid",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
};

const smallPill = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 7px",
  border: "1px solid",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
};

const pillLine = {
  display: "flex",
  gap: 5,
  flexWrap: "wrap",
  marginBottom: 5,
};

const strongText = {
  fontWeight: 900,
  color: UI.text,
};

const mutedText = {
  marginTop: 3,
  color: UI.muted,
  fontSize: 12,
  fontWeight: 700,
};

const tinyMono = {
  marginTop: 4,
  color: UI.muted,
  fontSize: 11,
  fontFamily: "monospace",
};

const issueList = {
  display: "flex",
  gap: 5,
  flexWrap: "wrap",
  maxWidth: 440,
};

const issuePill = {
  padding: "4px 7px",
  borderRadius: 999,
  border: "1px solid #fed7aa",
  background: UI.warnSoft,
  color: UI.warn,
  fontSize: 12,
  fontWeight: 850,
};

const okText = {
  color: UI.ok,
  fontWeight: 900,
};

const warnText = {
  marginTop: 4,
  color: UI.warn,
  fontSize: 12,
  fontWeight: 900,
};

const deleteButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  padding: "6px 8px",
  borderRadius: UI.radius,
  border: "1px solid #fecaca",
  background: UI.dangerSoft,
  color: UI.danger,
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const deleteButtonDisabled = {
  borderColor: UI.border,
  background: UI.neutralSoft,
  color: UI.muted,
  cursor: "not-allowed",
};

const errorBox = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #fecaca",
  borderRadius: UI.radius,
  background: UI.dangerSoft,
  color: UI.danger,
  fontWeight: 900,
};

const noticeBox = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #bbf7d0",
  borderRadius: UI.radius,
  background: UI.okSoft,
  color: UI.ok,
  fontWeight: 900,
};
