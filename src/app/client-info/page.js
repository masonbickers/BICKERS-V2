"use client";

import layoutStyles from "./page.styles.module.css";
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
import { UI_TOKENS } from "@/app/utils/uiTokens";

const UI = UI_TOKENS;

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-hover)",
  color: UI.text,
  fontSize: 12,
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

const norm = (s = "") => String(s || "").trim().toLowerCase();

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

const prettifyStatus = (raw) => {
  const s = norm(raw);
  if (!s) return "TBC";
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  if (s === "dnh") return "DNH";
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("postpon")) return "Postponed";
  if (s.includes("lost")) return "Lost";
  if (s.includes("enquiry") || s.includes("inquiry")) return "Enquiry";
  return s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase());
};

const normaliseJobDates = (job) => {
  const out = [];
  if (Array.isArray(job?.bookingDates) && job.bookingDates.length) {
    for (const value of job.bookingDates) {
      const d = parseDate(value);
      if (d) out.push(d);
    }
  } else if (job?.startDate && job?.endDate) {
    const start = parseDate(job.startDate);
    const end = parseDate(job.endDate);
    if (start && end) {
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      const finish = new Date(end);
      finish.setHours(0, 0, 0, 0);
      while (cursor.getTime() <= finish.getTime()) {
        out.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (start) {
      out.push(start);
    }
  } else {
    const fallback = parseDate(job?.date || job?.startDate);
    if (fallback) out.push(fallback);
  }

  const seen = new Set();
  return out
    .map((d) => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      return copy;
    })
    .filter((d) => {
      const key = d.toISOString().slice(0, 10);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a - b);
};

const toCrewCount = (job) => {
  const direct = Number(job?.allocatedCrewCountDerived ?? job?.allocatedCrewCount);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return Array.isArray(job?.employees) ? job.employees.length : 0;
};

const avg = (values) => {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return 0;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 10) / 10;
};

const contactTitle = (contact = {}) =>
  [contact?.name, contact?.department].filter(Boolean).join(" • ") ||
  contact?.email ||
  contact?.phone ||
  "Contact";

export default function ClientInfoPage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [deletedBookings, setDeletedBookings] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedClientKey, setSelectedClientKey] = useState("");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "listen client info bookings" });
      setBookings([]);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", dataAccessState), (snapshot) => {
      setBookings(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) })));
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "bookings", operation: "listen client info bookings" });
      setBookings([]);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "deletedBookings", operation: "listen client info deleted bookings" });
      setDeletedBookings([]);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "deletedBookings", dataAccessState), (snapshot) => {
      setDeletedBookings(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) })));
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "deletedBookings", operation: "listen client info deleted bookings" });
      setDeletedBookings([]);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  const deletedJobs = useMemo(
    () =>
      deletedBookings.map((entry) => ({
        id: entry.id,
        __deleted: true,
        deletedAt: entry.deletedAt || null,
        ...(getDeletedBookingPayload(entry) || {}),
      })),
    [deletedBookings]
  );

  const clients = useMemo(() => {
    const map = new Map();

    for (const job of [...bookings, ...deletedJobs]) {
      const clientName = String(job?.client || "").trim();
      if (!clientName) continue;

      const key = norm(clientName);
      const current =
        map.get(key) ||
        {
          key,
          name: clientName,
          aliases: new Set(),
          jobs: [],
          locations: new Set(),
          contacts: new Map(),
          totalCrewValues: [],
          totalLengthValues: [],
          totalJobs: 0,
          activeJobs: 0,
          deletedJobs: 0,
          confirmedJobs: 0,
          firstPencilJobs: 0,
          lostJobs: 0,
          completedJobs: 0,
          firstAddedAt: null,
          lastActivityAt: null,
          firstShootAt: null,
          lastShootAt: null,
        };

      current.aliases.add(clientName);
      current.jobs.push(job);
      current.totalJobs += 1;
      if (job.__deleted) current.deletedJobs += 1;
      else current.activeJobs += 1;

      const status = job.__deleted ? "Deleted" : prettifyStatus(job?.status);
      if (status === "Confirmed") current.confirmedJobs += 1;
      if (status === "First Pencil") current.firstPencilJobs += 1;
      if (status === "Complete") current.completedJobs += 1;
      if (["Deleted", "DNH", "Lost", "Cancelled", "Postponed"].includes(status)) current.lostJobs += 1;

      const dates = normaliseJobDates(job);
      if (dates.length) {
        current.totalLengthValues.push(dates.length);
        const firstShoot = dates[0];
        const lastShoot = dates[dates.length - 1];
        if (!current.firstShootAt || firstShoot < current.firstShootAt) current.firstShootAt = firstShoot;
        if (!current.lastShootAt || lastShoot > current.lastShootAt) current.lastShootAt = lastShoot;
      }

      const crewCount = toCrewCount(job);
      if (crewCount > 0) current.totalCrewValues.push(crewCount);

      if (job?.location) current.locations.add(String(job.location).trim());

      const activityAt = parseDate(job?.updatedAt || job?.deletedAt || job?.createdAt);
      const createdAt = parseDate(job?.createdAt || job?.deletedAt || job?.updatedAt);
      if (createdAt && (!current.firstAddedAt || createdAt < current.firstAddedAt)) current.firstAddedAt = createdAt;
      if (activityAt && (!current.lastActivityAt || activityAt > current.lastActivityAt)) current.lastActivityAt = activityAt;

      for (const contact of Array.isArray(job?.additionalContacts) ? job.additionalContacts : []) {
        const dedupeKey = norm(contact?.email) || norm(contact?.name) || norm(contact?.phone);
        if (!dedupeKey) continue;
        if (!current.contacts.has(dedupeKey)) {
          current.contacts.set(dedupeKey, {
            name: String(contact?.name || "").trim(),
            email: String(contact?.email || "").trim(),
            phone: String(contact?.phone || "").trim(),
            department: String(contact?.department || "").trim(),
          });
        }
      }

      map.set(key, current);
    }

    return [...map.values()]
      .map((client) => ({
        ...client,
        aliases: [...client.aliases].sort((a, b) => a.localeCompare(b)),
        locations: [...client.locations].sort((a, b) => a.localeCompare(b)),
        contacts: [...client.contacts.values()].sort((a, b) => contactTitle(a).localeCompare(contactTitle(b))),
        avgCrew: avg(client.totalCrewValues),
        avgLength: avg(client.totalLengthValues),
      }))
      .sort((a, b) => b.totalJobs - a.totalJobs || a.name.localeCompare(b.name));
  }, [bookings, deletedJobs]);

  const filteredClients = useMemo(() => {
    const q = norm(search);
    if (!q) return clients;

    return clients.filter((client) => {
      const haystack = [
        client.name,
        ...client.aliases,
        ...client.locations,
        ...client.contacts.map((contact) => [contact.name, contact.email, contact.phone, contact.department].join(" ")),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [clients, search]);

  useEffect(() => {
    if (!filteredClients.length) {
      setSelectedClientKey("");
      return;
    }
    if (!filteredClients.some((client) => client.key === selectedClientKey)) {
      setSelectedClientKey(filteredClients[0].key);
    }
  }, [filteredClients, selectedClientKey]);

  const selectedClient = useMemo(
    () => filteredClients.find((client) => client.key === selectedClientKey) || filteredClients[0] || null,
    [filteredClients, selectedClientKey]
  );

  const selectedClientJobs = useMemo(() => {
    if (!selectedClient) return [];
    return [...selectedClient.jobs].sort((a, b) => {
      const aDate =
        parseDate(a?.lastBookingDate || a?.firstBookingDate || a?.date || a?.startDate || a?.deletedAt || a?.createdAt) ||
        new Date(0);
      const bDate =
        parseDate(b?.lastBookingDate || b?.firstBookingDate || b?.date || b?.startDate || b?.deletedAt || b?.createdAt) ||
        new Date(0);
      return bDate - aDate;
    });
  }, [selectedClient]);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div
          className={layoutStyles.extracted1}
        >
          <div>
            <h1 style={{ color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 }}>Client Info</h1>
            <div style={{ color: UI.muted, fontSize: 13, marginTop: 4 }}>
              A client directory built from booking history, booking contacts, crew demand, dates, and outcomes.
            </div>
          </div>
          <div className={layoutStyles.extracted2}>
            <span style={chip}>{clients.length} clients</span>
            <span style={{ ...chip, background: UI.brandSoft, borderColor: "var(--color-brand-soft)" }}>{bookings.length} active bookings</span>
            <span style={{ ...chip, background: "var(--color-accent-soft)", borderColor: "var(--color-warning-border)" }}>{deletedJobs.length} deleted records</span>
            <Link href="/client-emails" style={{ ...chip, textDecoration: "none", background: "var(--color-surface)" }}>
              View emails →
            </Link>
          </div>
        </div>

        <div style={{ ...surface, padding: 14, marginBottom: UI.gap }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, contact, department, location..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: UI.radiusSm,
              border: "1px solid var(--color-border)",
              fontSize: 14,
              outline: "none",
              background: "var(--color-surface)",
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 360px) minmax(0, 1fr)", gap: UI.gap }}>
          <div style={{ ...surface, padding: 12, maxHeight: "calc(100vh - 220px)", overflow: "auto" }}>
            <div className={layoutStyles.extracted3}>
              <div className={layoutStyles.extracted4}>Client List</div>
              <div style={{ color: UI.muted, fontSize: 12 }}>{filteredClients.length} shown</div>
            </div>

            <div className={layoutStyles.extracted5}>
              {filteredClients.length ? (
                filteredClients.map((client) => {
                  const isSelected = client.key === selectedClient?.key;
                  return (
                    <button
                      key={client.key}
                      type="button"
                      onClick={() => setSelectedClientKey(client.key)}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderRadius: 12,
                        border: isSelected ? "1px solid var(--color-info-border)" : "1px solid var(--color-border)",
                        background: isSelected ? "var(--color-info-soft)" : "var(--color-surface)",
                        boxShadow: isSelected ? UI.shadowHover : "none",
                        cursor: "pointer",
                      }}
                    >
                      <div className={layoutStyles.extracted6}>
                        <div style={{ fontWeight: 900, color: UI.text }}>{client.name}</div>
                        <span style={chip}>{client.totalJobs}</span>
                      </div>
                      <div style={{ color: UI.muted, fontSize: 12, marginTop: 6 }}>
                        Confirmed {client.confirmedJobs} • First pencil {client.firstPencilJobs} • Dead {client.lostJobs}
                      </div>
                      <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                        Last activity {fmtDate(client.lastActivityAt || client.lastShootAt)}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div style={{ color: UI.muted, fontSize: 13 }}>No clients match the current search.</div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: UI.gap }}>
            {selectedClient ? (
              <>
                <div style={{ ...surface, padding: 18 }}>
                  <div className={layoutStyles.extracted7}>
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: UI.text }}>{selectedClient.name}</div>
                      <div style={{ color: UI.muted, fontSize: 13, marginTop: 4 }}>
                        First added {fmtDate(selectedClient.firstAddedAt)} • Last shoot {fmtDate(selectedClient.lastShootAt)}
                      </div>
                    </div>
                    <Link href="/statistics" style={{ color: UI.brand, fontWeight: 800, textDecoration: "none" }}>
                      Back to statistics →
                    </Link>
                  </div>

                  <div
                    className={layoutStyles.extracted8}
                  >
                    <div style={{ ...surface, padding: 12 }}>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Total jobs</div>
                      <div className={layoutStyles.extracted9}>{selectedClient.totalJobs}</div>
                    </div>
                    <div style={{ ...surface, padding: 12 }}>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Confirmed</div>
                      <div className={layoutStyles.extracted10}>{selectedClient.confirmedJobs}</div>
                    </div>
                    <div style={{ ...surface, padding: 12 }}>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Avg length</div>
                      <div className={layoutStyles.extracted11}>{selectedClient.avgLength}</div>
                    </div>
                    <div style={{ ...surface, padding: 12 }}>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Avg crew</div>
                      <div className={layoutStyles.extracted12}>{selectedClient.avgCrew}</div>
                    </div>
                    <div style={{ ...surface, padding: 12 }}>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>First pencil</div>
                      <div className={layoutStyles.extracted13}>{selectedClient.firstPencilJobs}</div>
                    </div>
                    <div style={{ ...surface, padding: 12 }}>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Dead outcomes</div>
                      <div className={layoutStyles.extracted14}>{selectedClient.lostJobs}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: UI.gap }}>
                  <div style={{ ...surface, padding: 16 }}>
                    <div className={layoutStyles.extracted15}>
                      <div className={layoutStyles.extracted16}>Recent bookings</div>
                      <div style={{ color: UI.muted, fontSize: 12 }}>{selectedClientJobs.length} records</div>
                    </div>
                    <div className={layoutStyles.extracted17}>
                      {selectedClientJobs.slice(0, 12).map((job) => {
                        const status = job.__deleted ? "Deleted" : prettifyStatus(job.status);
                        const anchorDate =
                          job.lastBookingDate || job.firstBookingDate || job.date || job.startDate || job.deletedAt || job.createdAt;
                        return (
                          <Link
                            key={`${job.id}-${status}`}
                            href={job.__deleted ? "/deleted-bookings" : `/job-numbers/${job.id}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(110px, 130px) minmax(0, 1fr) 120px 120px",
                              gap: 10,
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid var(--color-border)",
                              textDecoration: "none",
                              color: UI.text,
                              alignItems: "center",
                            }}
                          >
                            <div className={layoutStyles.extracted18}>{job.jobNumber || "No job #"}</div>
                            <div>
                              <div className={layoutStyles.extracted19}>{job.location || "No location"}</div>
                              <div style={{ color: UI.muted, fontSize: 12 }}>{fmtDate(anchorDate)}</div>
                            </div>
                            <div style={{ color: UI.muted, fontSize: 13 }}>{status}</div>
                            <div style={{ color: UI.muted, fontSize: 13, textAlign: "right" }}>
                              {normaliseJobDates(job).length || Number(job.bookingLengthDays) || 0} day(s)
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: UI.gap }}>
                    <div style={{ ...surface, padding: 16 }}>
                      <div className={layoutStyles.extracted20}>Contacts on bookings</div>
                      <div className={layoutStyles.extracted21}>
                        {selectedClient.contacts.length ? (
                          selectedClient.contacts.map((contact) => (
                            <div key={`${contact.email}-${contact.phone}-${contact.name}`} className={layoutStyles.extracted22}>
                              <div className={layoutStyles.extracted23}>{contactTitle(contact)}</div>
                              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                                {[contact.email, contact.phone].filter(Boolean).join(" • ") || "No direct detail saved"}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: UI.muted, fontSize: 13 }}>No booking contacts stored for this client yet.</div>
                        )}
                      </div>
                    </div>

                    <div style={{ ...surface, padding: 16 }}>
                      <div className={layoutStyles.extracted24}>Coverage</div>
                      <div className={layoutStyles.extracted25}>
                        {selectedClient.locations.length ? (
                          selectedClient.locations.slice(0, 16).map((location) => (
                            <span key={location} style={chip}>
                              {location}
                            </span>
                          ))
                        ) : (
                          <div style={{ color: UI.muted, fontSize: 13 }}>No locations saved yet.</div>
                        )}
                      </div>

                      {!!selectedClient.aliases.length && (
                        <div className={layoutStyles.extracted26}>
                          <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>
                            Name variants
                          </div>
                          <div className={layoutStyles.extracted27}>
                            {selectedClient.aliases.map((alias) => (
                              <span key={alias} style={{ ...chip, background: "var(--color-surface)" }}>
                                {alias}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ ...surface, padding: 18, color: UI.muted, fontSize: 14 }}>No client data is available yet.</div>
            )}
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
