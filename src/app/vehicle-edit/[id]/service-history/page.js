"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../../../firebaseConfig";
import { formatDateForDisplay, normalizeServiceRecord, toDateLike } from "@/app/utils/serviceRecordCompat";

const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 10,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  border: "1px solid var(--legacy-color-e5e7eb)",
  bg: "var(--color-surface-subtle)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-subtle)",
  brand: "var(--color-info)",
};

const pageWrap = { padding: "16px 18px 24px", background: UI.bg, minHeight: "100vh" };
const topBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--space-2)",
  flexWrap: "wrap",
  marginBottom: 10,
};
const title = { margin: 0, fontSize: 24, fontWeight: 950, letterSpacing: "-0.01em", color: UI.text };
const subtitle = { marginTop: "var(--space-1)", fontSize: 12.5, color: UI.muted };
const card = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...card, padding: "var(--space-3)" };
const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radiusSm,
  border: "1px solid var(--legacy-color-d1d5db)",
  background: "var(--color-white)",
  color: UI.text,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const toDate = (v) => toDateLike(v);

const clampISODate = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};

const toISODate = (v) => {
  const d = toDate(v);
  return d ? clampISODate(d) : "";
};

function bookingCompletedLabel(b) {
  return (
    formatDateForDisplay(b?.completedDate) ||
    formatDateForDisplay(toISODate(b?.completedAt)) ||
    formatDateForDisplay(toISODate(b?.endDate)) ||
    formatDateForDisplay(toISODate(b?.appointmentDate)) ||
    formatDateForDisplay(toISODate(b?.startDate)) ||
    "-"
  );
}

export default function VehicleServiceHistoryPage() {
  const router = useRouter();
  const { id } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const vehicleRef = doc(db, "vehicles", id);
        const [vehicleSnap, serviceRecordSnap] = await Promise.all([
          getDoc(vehicleRef),
          getDocs(query(collection(db, "serviceRecords"), where("vehicleId", "==", id))),
        ]);

        if (vehicleSnap.exists()) {
          setVehicle({ id: vehicleSnap.id, ...vehicleSnap.data() });
        }

        const rows = serviceRecordSnap.docs.map((item) =>
          normalizeServiceRecord({ id: item.id, ...(item.data() || {}) })
        );
        rows.sort((a, b) => {
          const ad = toDate(a.serviceDateOnly || a.serviceDate || a.createdAt) || new Date(0);
          const bd = toDate(b.serviceDateOnly || b.serviceDate || b.createdAt) || new Date(0);
          return bd.getTime() - ad.getTime();
        });
        setServiceRecords(rows);
      } finally {
        setLoading(false);
      }
    };

    load().catch((error) => {
      console.error("Failed to load service history:", error);
      setLoading(false);
    });
  }, [id]);

  const serviceHistoryItems = useMemo(() => {
    const stored = Array.isArray(vehicle?.serviceHistory) ? vehicle.serviceHistory : [];
    const derived = serviceRecords.map((record) => ({
      completedDate: record.serviceDateDisplay || formatDateForDisplay(record.serviceDateOnly || record.serviceDate) || "",
      sortDate: record.serviceDateOnly || record.serviceDate || "",
      bookingId: record.id,
      bookingRef: record.serviceType || "",
      notes: record.workSummary || record.extraNotes || "",
      location: record.registration || "",
      odometer: record.odometer || "",
      partsUsed: record.partsUsed || "",
    }));

    // Prefer structured serviceRecords when present. Legacy vehicle.serviceHistory
    // entries are only used as a fallback for vehicles that do not yet have
    // migrated service record documents.
    if (derived.length > 0) {
      return derived.sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")));
    }

    const seen = new Set();
    return [...stored]
      .map((item) => ({
        ...item,
        completedDate: formatDateForDisplay(item?.completedDate) || item?.completedDate || "",
        sortDate: item?.sortDate || item?.completedDate || "",
      }))
      .filter((item, index) => {
        const key = item?.bookingId || `${item?.completedDate || ""}-${item?.bookingRef || ""}-${index}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")));
  }, [vehicle?.serviceHistory, serviceRecords]);

  const vehicleLabel =
    vehicle?.name || vehicle?.registration || vehicle?.reg || "Vehicle";

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={topBar}>
          <div>
            <h1 style={title}>Service History</h1>
            <div style={subtitle}>{vehicleLabel}</div>
          </div>

          <button type="button" style={btn} onClick={() => router.push(`/vehicle-edit/${id}`)}>
            Back To Vehicle
          </button>
        </div>

        {loading ? (
          <div style={{ ...panel, textAlign: "center", color: UI.muted }}>Loading service history...</div>
        ) : (
          <div style={{ display: "grid", gap: UI.gap }}>
            <div style={panel}>
              <div style={{ fontSize: "var(--font-size-xs)", color: UI.muted, marginBottom: "var(--space-2)" }}>
                Stored vehicle service history and completed service forms linked to this vehicle.
              </div>

              {serviceHistoryItems.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>No completed service history yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {serviceHistoryItems.map((item, index) => (
                    <div
                      key={item.bookingId || `${item.completedDate}-${index}`}
                      onClick={() =>
                        item.bookingId
                          ? router.push(`/vehicle-edit/${id}/service-history/${item.bookingId}`)
                          : undefined
                      }
                      style={{
                        border: "1px solid var(--legacy-color-e5e7eb)",
                        borderRadius: "var(--radius-lg)",
                        padding: 10,
                        background: "var(--color-white)",
                        cursor: item.bookingId ? "pointer" : "default",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: UI.text }}>
                        {item.completedDate || "-"}
                      </div>
                      <div style={{ marginTop: "var(--space-1)", fontSize: 12.5, color: UI.muted }}>
                        {item.bookingRef ? `Ref: ${item.bookingRef}` : "Ref: -"}
                      </div>
                      <div style={{ marginTop: "var(--space-1)", fontSize: 12.5, color: UI.muted }}>
                        {item.location ? `Location: ${item.location}` : "Location: -"}
                      </div>
                      <div style={{ marginTop: "var(--space-1)", fontSize: 12.5, color: UI.muted }}>
                        {item.odometer ? `Odometer: ${item.odometer}` : "Odometer: -"}
                      </div>
                      {item.partsUsed ? (
                        <div style={{ marginTop: 6, fontSize: 12.5, color: UI.muted }}>
                          {`Parts: ${item.partsUsed}`}
                        </div>
                      ) : null}
                      {item.notes ? (
                        <div style={{ marginTop: 6, fontSize: 12.5, color: UI.text }}>{item.notes}</div>
                      ) : null}
                      {item.bookingId ? (
                        <div style={{ marginTop: "var(--space-2)", fontSize: 11.5, fontWeight: 900, color: UI.brand }}>
                          Open full service details
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
