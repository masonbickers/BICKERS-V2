"use client";

import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { AlertTriangle } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../../../firebaseConfig";
import { UI_TOKENS } from "@/app/utils/uiTokens";

const UI = UI_TOKENS;

const pageWrap = { padding: "16px 18px 24px", background: UI.bg, minHeight: "100vh" };
const topBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 10,
};
const title = { margin: 0, fontSize: 24, fontWeight: 950, color: UI.text, letterSpacing: 0 };
const subtitle = { marginTop: 4, fontSize: 12.5, color: UI.muted };
const panel = { background: UI.card, borderRadius: UI.radius, border: UI.border, padding: 12 };
const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radius,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-surface)",
  color: UI.text,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const safeArr = (value) => (Array.isArray(value) ? value : []);

const dateOnly = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw;
};

const formatDisplayDate = (value) => {
  const raw = dateOnly(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return raw || "-";
};

const formatDisplayDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatOdometer = (test) => {
  if (!test?.odometerValue) return "-";
  const value = Number(String(test.odometerValue).replace(/[^\d.]/g, ""));
  const displayValue = Number.isFinite(value) && value > 0 ? value.toLocaleString("en-GB") : test.odometerValue;
  return `${displayValue}${test.odometerUnit ? ` ${String(test.odometerUnit).toLowerCase()}` : ""}`;
};

const defectText = (defect) =>
  String(defect?.text || defect?.description || defect?.defectText || defect?.itemDescription || "").trim();

const resultStyle = (result) => {
  const value = String(result || "").toUpperCase();
  if (value === "PASSED") return { color: "var(--color-success)", background: "var(--color-success-soft)", border: "1px solid var(--color-success-border)" };
  if (value === "FAILED") return { color: "var(--color-danger)", background: "var(--color-accent-soft)", border: "1px solid var(--color-danger-border)" };
  return { color: UI.text, background: "var(--color-surface-subtle)", border: UI.border };
};

function getMileageAnomaly(tests) {
  const latest = Number(String(tests[0]?.odometerValue || "").replace(/[^\d.]/g, ""));
  const previous = Number(String(tests[1]?.odometerValue || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(latest) || !Number.isFinite(previous) || latest <= 0 || previous <= 0) return "";
  return latest < previous
    ? `Mileage lower than previous MOT (${latest.toLocaleString("en-GB")} vs ${previous.toLocaleString("en-GB")}).`
    : "";
}

function MiniStat({ label, value }) {
  return (
    <div style={{ border: UI.border, borderRadius: UI.radius, padding: 10, background: "var(--color-surface)" }}>
      <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 850 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, color: UI.text, fontWeight: 950 }}>{value || "-"}</div>
    </div>
  );
}

export default function VehicleMotHistoryPage() {
  const router = useRouter();
  const { id } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "vehicles", id));
        if (snap.exists()) setVehicle({ id: snap.id, ...(snap.data() || {}) });
      } finally {
        setLoading(false);
      }
    };

    load().catch((error) => {
      console.error("Failed to load MOT history:", error);
      setLoading(false);
    });
  }, [id]);

  const motTests = useMemo(() => safeArr(vehicle?.dvsaMotTests), [vehicle?.dvsaMotTests]);
  const vehicleLabel = vehicle?.name || vehicle?.registration || vehicle?.reg || "Vehicle";
  const details = vehicle?.dvsaMotVehicleDetails || {};
  const latest = motTests[0] || null;
  const mileageWarning = vehicle?.dvsaMotMileageWarning || getMileageAnomaly(motTests);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div className={layoutStyles.extracted1}>
          <div>
            <h1 style={title}>DVSA MOT History</h1>
            <div style={subtitle}>{vehicleLabel}</div>
          </div>

          <button type="button" style={btn} onClick={() => router.push(`/vehicle-edit/${id}`)}>
            Back To Vehicle
          </button>
        </div>

        {loading ? (
          <div style={{ ...panel, textAlign: "center", color: UI.muted }}>Loading MOT history...</div>
        ) : (
          <div style={{ display: "grid", gap: UI.gap }}>
            <div style={panel}>
              <div className={layoutStyles.extracted2}>
                <MiniStat label="Last DVSA Fetch" value={formatDisplayDateTime(vehicle?.dvsaMotHistoryFetchedAt || vehicle?.motHistorySyncedAt)} />
                <MiniStat label="Latest Result" value={latest?.testResult || vehicle?.dvsaLatestMotResult || "-"} />
                <MiniStat label="Latest Test" value={formatDisplayDate(latest?.completedDate)} />
                <MiniStat label="Latest Odometer" value={formatOdometer(latest)} />
                <MiniStat label="Fuel / Colour" value={[details.fuelType, details.primaryColour].filter(Boolean).join(" / ") || "-"} />
                <MiniStat label="Outstanding Recall" value={String(details.hasOutstandingRecall || "-")} />
              </div>

              {mileageWarning ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    marginTop: 10,
                    border: "1px solid var(--color-accent)",
                    background: "var(--color-warning-soft)",
                    color: "var(--color-warning)",
                    borderRadius: UI.radius,
                    padding: 10,
                    fontSize: 12.5,
                    fontWeight: 850,
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>{mileageWarning}</span>
                </div>
              ) : null}
            </div>

            <div style={panel}>
              {motTests.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: 13 }}>
                  No DVSA MOT history saved yet. Go back to the vehicle, press Fetch DVSA MOT, then Save.
                </div>
              ) : (
                <div className={layoutStyles.extracted3}>
                  {motTests.map((test, index) => {
                    const defects = safeArr(test.defects).filter((defect) => defectText(defect));
                    const serious = defects.filter((defect) => {
                      const type = String(defect?.type || "").toUpperCase();
                      return defect?.dangerous || type.includes("MAJOR") || type.includes("DANGEROUS");
                    });
                    const advisories = defects.filter((defect) =>
                      String(defect?.type || "").toUpperCase().includes("ADVISORY")
                    );

                    return (
                      <div key={test.motTestNumber || `${test.completedDate}-${index}`} style={{ border: UI.border, borderRadius: UI.radius, padding: 12, background: "var(--color-surface)" }}>
                        <div className={layoutStyles.extracted4}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 950, color: UI.text }}>
                              {formatDisplayDate(test.completedDate)}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 12.5, color: UI.muted }}>
                              Expires: {formatDisplayDate(test.expiryDate)} · Odometer: {formatOdometer(test)}
                            </div>
                          </div>
                          <span
                            style={{
                              ...resultStyle(test.testResult),
                              borderRadius: 999,
                              padding: "5px 9px",
                              fontSize: 12,
                              fontWeight: 950,
                            }}
                          >
                            {test.testResult || "UNKNOWN"}
                          </span>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12.5, color: UI.muted }}>
                          Test number: {test.motTestNumber || "-"}
                          {test.odometerResultType ? ` · Odometer result: ${test.odometerResultType}` : ""}
                        </div>

                        {serious.length ? (
                          <div style={{ marginTop: 10, border: "1px solid var(--color-danger-border)", background: "var(--color-danger-soft)", color: "var(--color-danger)", borderRadius: UI.radius, padding: 10, fontSize: 12.5 }}>
                            <div className={layoutStyles.extracted5}>Serious defects</div>
                            {serious.map((defect, defectIndex) => (
                              <div key={`${defectText(defect)}-${defectIndex}`} style={{ marginTop: defectIndex ? 4 : 0 }}>
                                {defect.type ? `${defect.type}: ` : ""}
                                {defectText(defect)}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {advisories.length ? (
                          <div style={{ marginTop: 10, border: UI.border, background: "var(--color-surface-subtle)", color: UI.text, borderRadius: UI.radius, padding: 10, fontSize: 12.5 }}>
                            <div className={layoutStyles.extracted6}>Advisories</div>
                            {advisories.map((defect, defectIndex) => (
                              <div key={`${defectText(defect)}-${defectIndex}`} style={{ marginTop: defectIndex ? 4 : 0 }}>
                                {defectText(defect)}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
