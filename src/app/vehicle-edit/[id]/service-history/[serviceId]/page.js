"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../../../../firebaseConfig";

const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 10,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
};

const pageWrap = { padding: "16px 18px 24px", background: UI.bg, minHeight: "100vh" };
const topBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 10,
};
const title = { margin: 0, fontSize: 24, fontWeight: 950, letterSpacing: "-0.01em", color: UI.text };
const subtitle = { marginTop: 4, fontSize: 12.5, color: UI.muted };
const card = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...card, padding: 12 };
const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: UI.text,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const kvGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

function InfoLine({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
        {label}
      </div>
      <div style={{ marginTop: 3, fontSize: 13, color: UI.text }}>{value || "-"}</div>
    </div>
  );
}

export default function VehicleServiceHistoryDetailPage() {
  const router = useRouter();
  const { id, serviceId } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!serviceId) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "serviceRecords", serviceId));
        if (snap.exists()) {
          setRecord({ id: snap.id, ...(snap.data() || {}) });
        } else {
          setRecord(null);
        }
      } finally {
        setLoading(false);
      }
    };

    load().catch((error) => {
      console.error("Failed to load service record:", error);
      setLoading(false);
    });
  }, [serviceId]);

  const checklistItems = useMemo(() => {
    if (!record) return [];
    const labels = new Set([
      ...Object.keys(record.checks || {}),
      ...Object.keys(record.checkRatings || {}),
      ...Object.keys(record.checkNA || {}),
      ...Object.keys(record.checkNotes || {}),
      ...Object.keys(record.checkPhotoURIs || {}),
    ]);

    return Array.from(labels).map((label) => ({
      label,
      checked: !!record.checks?.[label],
      rating:
        typeof record.checkRatings?.[label] === "number"
          ? record.checkRatings[label]
          : null,
      na: !!record.checkNA?.[label],
      note: record.checkNotes?.[label] || "",
      photoCount: Array.isArray(record.checkPhotoURIs?.[label])
        ? record.checkPhotoURIs[label].length
        : 0,
    }));
  }, [record]);

  const pageLabel =
    record?.vehicleName || record?.registration || "Service Details";

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={topBar}>
          <div>
            <h1 style={title}>Service Details</h1>
            <div style={subtitle}>{pageLabel}</div>
          </div>

          <button type="button" style={btn} onClick={() => router.push(`/vehicle-edit/${id}/service-history`)}>
            Back To Service History
          </button>
        </div>

        {loading ? (
          <div style={{ ...panel, textAlign: "center", color: UI.muted }}>Loading service details...</div>
        ) : !record ? (
          <div style={{ ...panel, textAlign: "center", color: UI.muted }}>Service record not found.</div>
        ) : (
          <div style={{ display: "grid", gap: UI.gap }}>
            <div style={panel}>
              <div style={kvGrid}>
                <InfoLine label="Vehicle" value={record.vehicleName} />
                <InfoLine label="Registration" value={record.registration} />
                <InfoLine label="Manufacturer" value={record.manufacturer} />
                <InfoLine label="Model" value={record.model} />
                <InfoLine label="Service Date" value={record.serviceDate} />
                <InfoLine label="Service Type" value={record.serviceType} />
                <InfoLine label="Odometer" value={record.odometer} />
                <InfoLine label="Next Service Date" value={record.nextServiceDate} />
                <InfoLine label="Signed By" value={record.signedBy} />
              </div>
            </div>

            <div style={panel}>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
                Work Carried Out
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: UI.text, whiteSpace: "pre-wrap" }}>
                {record.workSummary || "-"}
              </div>
            </div>

            <div style={panel}>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
                Parts Used
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: UI.text, whiteSpace: "pre-wrap" }}>
                {record.partsUsed || "-"}
              </div>
            </div>

            <div style={panel}>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
                Extra Notes
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: UI.text, whiteSpace: "pre-wrap" }}>
                {record.extraNotes || "-"}
              </div>
            </div>

            <div style={panel}>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                Checklist Results
              </div>

              {checklistItems.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: 13 }}>No checklist details stored.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {checklistItems.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 10,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: UI.text }}>{item.label}</div>
                      <div style={{ marginTop: 4, fontSize: 12.5, color: UI.muted }}>
                        Status: {item.na ? "N/A" : item.checked ? "Completed" : "Not marked"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12.5, color: UI.muted }}>
                        Rating: {item.rating ?? "-"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12.5, color: UI.muted }}>
                        Photos: {item.photoCount}
                      </div>
                      {item.note ? (
                        <div style={{ marginTop: 6, fontSize: 12.5, color: UI.text, whiteSpace: "pre-wrap" }}>
                          {item.note}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={panel}>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                Photos
              </div>
              <div style={{ fontSize: 12.5, color: UI.muted }}>
                Overall photos: {Array.isArray(record.photoURIs) ? record.photoURIs.length : 0}
              </div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: UI.muted }}>
                Checklist photos:{" "}
                {Object.values(record.checkPhotoURIs || {}).reduce(
                  (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
                  0
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
