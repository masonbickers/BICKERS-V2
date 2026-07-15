"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  border: "1px solid var(--legacy-color-e5e7eb)",
  bg: "var(--color-surface-subtle)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-subtle)",
  brand: "var(--legacy-color-163a63)",
  brandSoft: "var(--legacy-color-edf4fb)",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const chip = {
  padding: "4px 8px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--legacy-color-e5e7eb)",
  background: "var(--color-surface-subtle)",
  color: UI.text,
  fontSize: 10,
  fontWeight: 700,
};

const DELETED_BOOKING_WRAPPER_KEYS = new Set([
  "booking",
  "data",
  "payload",
  "deletedAt",
  "deletedBy",
  "originalCollection",
  "originalId",
  "deleteReasons",
  "deleteReasonOther",
  "restoredAt",
  "restoredBy",
]);

const norm = (value = "") => String(value || "").trim().toLowerCase();

const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate();
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T00:00:00.000Z`);
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const fmtDate = (raw) => {
  const d = parseDate(raw);
  if (!d) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const getDeletedBookingPayload = (entry = {}) => {
  if (entry?.data && typeof entry.data === "object") return entry.data;
  if (entry?.payload && typeof entry.payload === "object") return entry.payload;
  if (entry?.booking && typeof entry.booking === "object") return entry.booking;

  return Object.fromEntries(
    Object.entries(entry || {}).filter(([key]) => !DELETED_BOOKING_WRAPPER_KEYS.has(key))
  );
};

export default function ClientEmailsPage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [deletedBookings, setDeletedBookings] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "listen client emails bookings" });
      setBookings([]);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", dataAccessState), (snapshot) => {
      setBookings(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) })));
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "bookings", operation: "listen client emails bookings" });
      setBookings([]);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "deletedBookings", operation: "listen client emails deleted bookings" });
      setDeletedBookings([]);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "deletedBookings", dataAccessState), (snapshot) => {
      setDeletedBookings(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) })));
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "deletedBookings", operation: "listen client emails deleted bookings" });
      setDeletedBookings([]);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  const allJobs = useMemo(
    () => [
      ...bookings,
      ...deletedBookings.map((entry) => ({
        id: entry.id,
        __deleted: true,
        deletedAt: entry.deletedAt || null,
        ...(getDeletedBookingPayload(entry) || {}),
      })),
    ],
    [bookings, deletedBookings]
  );

  const emailRows = useMemo(() => {
    const map = new Map();

    for (const job of allJobs) {
      const contacts = Array.isArray(job?.additionalContacts) ? job.additionalContacts : [];

      for (const contact of contacts) {
        const email = String(contact?.email || "").trim().toLowerCase();
        if (!email) continue;

        const current =
          map.get(email) ||
          {
            email,
            names: new Set(),
            departments: new Set(),
            phones: new Set(),
            clients: new Set(),
            jobIds: new Set(),
            jobNumbers: new Set(),
            activeJobs: 0,
            deletedJobs: 0,
            firstSeenAt: null,
            lastSeenAt: null,
          };

        if (contact?.name) current.names.add(String(contact.name).trim());
        if (contact?.department) current.departments.add(String(contact.department).trim());
        if (contact?.phone) current.phones.add(String(contact.phone).trim());
        if (job?.client) current.clients.add(String(job.client).trim());
        current.jobIds.add(job.id);
        if (job?.jobNumber) current.jobNumbers.add(String(job.jobNumber).trim());
        if (job.__deleted) current.deletedJobs += 1;
        else current.activeJobs += 1;

        const seenAt = parseDate(job?.updatedAt || job?.createdAt || job?.deletedAt);
        if (seenAt && (!current.firstSeenAt || seenAt < current.firstSeenAt)) current.firstSeenAt = seenAt;
        if (seenAt && (!current.lastSeenAt || seenAt > current.lastSeenAt)) current.lastSeenAt = seenAt;

        map.set(email, current);
      }
    }

    return [...map.values()]
      .map((row) => ({
        ...row,
        names: [...row.names].sort((a, b) => a.localeCompare(b)),
        departments: [...row.departments].sort((a, b) => a.localeCompare(b)),
        phones: [...row.phones].sort((a, b) => a.localeCompare(b)),
        clients: [...row.clients].sort((a, b) => a.localeCompare(b)),
        jobNumbers: [...row.jobNumbers].sort((a, b) => a.localeCompare(b)),
        totalJobs: row.jobIds.size,
      }))
      .sort((a, b) => b.totalJobs - a.totalJobs || a.email.localeCompare(b.email));
  }, [allJobs]);

  const filteredRows = useMemo(() => {
    const q = norm(search);
    if (!q) return emailRows;

    return emailRows.filter((row) =>
      [
        row.email,
        ...row.names,
        ...row.departments,
        ...row.phones,
        ...row.clients,
        ...row.jobNumbers,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [emailRows, search]);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            marginBottom: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 }}>Client Emails</h1>
            <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", marginTop: "var(--space-1)" }}>
              Collated email directory from booking contacts saved against jobs.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={chip}>{emailRows.length} emails</span>
            <span style={{ ...chip, background: UI.brandSoft, borderColor: "var(--legacy-color-dbeafe)" }}>{allJobs.length} job records scanned</span>
          </div>
        </div>

        <div style={{ ...surface, padding: "var(--space-3)", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, client, contact name, department, phone..."
              style={{
                flex: 1,
                minWidth: 260,
                padding: "9px 11px",
                borderRadius: UI.radiusSm,
                border: "1px solid var(--legacy-color-d1d5db)",
                fontSize: "var(--font-size-sm)",
                outline: "none",
                background: "var(--color-white)",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <div style={{ color: UI.muted, fontSize: 11 }}>
                Showing <b style={{ color: UI.text }}>{filteredRows.length}</b> entries
              </div>
              <Link href="/client-info" style={{ color: UI.brand, fontWeight: 800, textDecoration: "none", alignSelf: "center" }}>
                Client overview →
              </Link>
            </div>
          </div>
        </div>

        <div style={{ ...surface, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(240px, 1.1fr) minmax(160px, 0.7fr) minmax(140px, 0.6fr) minmax(160px, 0.7fr) minmax(140px, 0.7fr)",
              gap: "var(--space-3)",
              padding: "10px 12px",
              color: UI.muted,
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              background: "var(--color-surface-subtle)",
              borderBottom: "1px solid var(--legacy-color-e5e7eb)",
            }}
          >
            <div>Email</div>
            <div>Contact</div>
            <div>Jobs</div>
            <div>Clients</div>
            <div>Last seen</div>
          </div>

          <div style={{ display: "grid" }}>
            {filteredRows.length ? (
              filteredRows.map((row, index) => (
                <div
                  key={row.email}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(240px, 1.1fr) minmax(160px, 0.7fr) minmax(140px, 0.6fr) minmax(160px, 0.7fr) minmax(140px, 0.7fr)",
                    gap: 10,
                    padding: "10px 12px",
                    alignItems: "start",
                    background: index % 2 ? "var(--legacy-color-fcfdff)" : "var(--color-white)",
                    borderBottom: "1px solid var(--legacy-color-eef2f7)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900, color: UI.text, wordBreak: "break-word", fontSize: "var(--font-size-sm)", lineHeight: 1.3 }}>{row.email}</div>
                    {!!row.phones.length && (
                      <div style={{ color: UI.muted, fontSize: 11, marginTop: 3 }}>{row.phones.slice(0, 2).join(" • ")}</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, fontSize: "var(--font-size-sm)" }}>{row.names[0] || "-"}</div>
                    <div style={{ color: UI.muted, fontSize: 11, marginTop: 3 }}>{row.departments[0] || "No department"}</div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 900, fontSize: "var(--font-size-lg)" }}>{row.totalJobs}</div>
                    <div style={{ color: UI.muted, fontSize: 11, marginTop: 3 }}>
                      Active {row.activeJobs} • Deleted {row.deletedJobs}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {row.clients.slice(0, 3).map((client) => (
                        <span key={client} style={{ ...chip, background: "var(--color-white)" }}>
                          {client}
                        </span>
                      ))}
                    </div>
                    {row.clients.length > 3 && (
                      <div style={{ color: UI.muted, fontSize: 11, marginTop: 3 }}>+{row.clients.length - 3} more</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, fontSize: "var(--font-size-sm)" }}>{fmtDate(row.lastSeenAt)}</div>
                    <div style={{ color: UI.muted, fontSize: 11, marginTop: 3 }}>First seen {fmtDate(row.firstSeenAt)}</div>
                  </div>

                  <div
                    style={{
                      gridColumn: "1 / -1",
                      color: UI.muted,
                      fontSize: 11,
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      paddingTop: 1,
                    }}
                  >
                    {row.jobNumbers.slice(0, 8).map((jobNumber) => (
                      <span
                        key={jobNumber}
                        style={{
                          padding: "3px 7px",
                          borderRadius: "var(--radius-pill)",
                          border: "1px solid var(--legacy-color-e2e8f0)",
                          background: "var(--color-surface-subtle)",
                          fontSize: 10,
                          color: "var(--legacy-color-475569)",
                          fontWeight: 700,
                        }}
                      >
                        {jobNumber}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "var(--space-4)", color: UI.muted, fontSize: "var(--font-size-xs)" }}>No client emails match the current search.</div>
            )}
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
