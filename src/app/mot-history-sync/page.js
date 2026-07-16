"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { UI_TOKENS } from "@/app/utils/uiTokens";

const UI = UI_TOKENS;

const pageWrap = { padding: "16px 18px 28px", background: UI.bg, minHeight: "100vh" };
const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: "0 1px 2px rgba(15,23,42,0.05)" };
const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "7px 10px",
  borderRadius: UI.radius,
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
  color: UI.text,
  fontWeight: 850,
  cursor: "pointer",
  fontSize: 13,
};
const th = {
  padding: "8px 10px",
  background: UI.brand,
  color: "var(--color-white)",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 900,
};
const td = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-brand-soft)",
  fontSize: 13,
  verticalAlign: "top",
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (ms) => {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n < 1000) return `${n} ms`;
  const seconds = Math.round(n / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
};

const formatList = (items) => (Array.isArray(items) && items.length ? items.join(", ") : "-");

function StatCard({ label, value, tone = UI.brand }) {
  return (
    <div style={{ ...card, padding: 12, minHeight: 78 }}>
      <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 950, color: tone }}>{value ?? 0}</div>
    </div>
  );
}

export default function MotHistorySyncPage() {
  const router = useRouter();
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMeta = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "settings", "motHistorySync"));
      setMeta(snap.exists() ? snap.data() : null);
    } catch (err) {
      console.error("Failed to load MOT sync summary:", err);
      alert("Could not load MOT sync summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  const failures = Array.isArray(meta?.lastAllFetchFailures) ? meta.lastAllFetchFailures : [];
  const updatedVehicles = Array.isArray(meta?.lastAllFetchUpdatedVehicles) ? meta.lastAllFetchUpdatedVehicles : [];

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div className={layoutStyles.extracted1}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: UI.text }}>MOT Fetch Summary</h1>
            <div style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}>
              Last all-vehicle DVSA MOT data fetch and any vehicle-level errors.
            </div>
          </div>
          <div className={layoutStyles.extracted2}>
            <button type="button" style={btn} onClick={() => router.push("/vehicles")}>
              <ArrowLeft size={15} />
              Vehicles
            </button>
            <button type="button" style={btn} onClick={loadMeta} disabled={loading}>
              <RefreshCw size={15} />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div style={{ ...card, padding: 12, marginBottom: 12 }}>
          <div className={layoutStyles.extracted3}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase" }}>Last fetched</div>
              <div style={{ marginTop: 5, fontSize: 16, fontWeight: 900, color: UI.text }}>
                {formatDateTime(meta?.lastAllFetchedAt)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase" }}>Fetched by</div>
              <div style={{ marginTop: 5, fontSize: 16, fontWeight: 900, color: UI.text }}>
                {meta?.lastAllFetchedBy || "-"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase" }}>Source</div>
              <div style={{ marginTop: 5, fontSize: 16, fontWeight: 900, color: UI.text }}>
                {meta?.lastAllFetchSource || "-"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase" }}>Started</div>
              <div style={{ marginTop: 5, fontSize: 16, fontWeight: 900, color: UI.text }}>
                {formatDateTime(meta?.lastAllFetchStartedAt)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase" }}>Finished</div>
              <div style={{ marginTop: 5, fontSize: 16, fontWeight: 900, color: UI.text }}>
                {formatDateTime(meta?.lastAllFetchFinishedAt)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase" }}>Duration</div>
              <div style={{ marginTop: 5, fontSize: 16, fontWeight: 900, color: UI.text }}>
                {formatDuration(meta?.lastAllFetchDurationMs)}
              </div>
            </div>
          </div>
        </div>

        <div className={layoutStyles.extracted4}>
          <StatCard label="Checked" value={meta?.lastAllFetchChecked} />
          <StatCard label="Updated" value={meta?.lastAllFetchUpdated} tone={UI.green} />
          <StatCard label="Unchanged" value={meta?.lastAllFetchUnchanged} tone={UI.brand} />
          <StatCard label="Skipped" value={meta?.lastAllFetchSkipped} tone={UI.amber} />
          <StatCard label="Failed" value={meta?.lastAllFetchFailed} tone={UI.red} />
        </div>

        <div style={{ ...card, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ padding: 12, borderBottom: UI.border, display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={17} color={UI.brand} />
            <div style={{ fontSize: 15, fontWeight: 950, color: UI.text }}>Updated Vehicles</div>
          </div>

          {updatedVehicles.length ? (
            <div className={layoutStyles.extracted5}>
              <table className={layoutStyles.extracted6}>
                <thead>
                  <tr>
                    <th style={th}>Registration</th>
                    <th style={th}>Vehicle</th>
                    <th style={th}>Next MOT</th>
                    <th style={th}>Last MOT</th>
                    <th style={th}>Odometer</th>
                    <th style={th}>Test No.</th>
                    <th style={th}>Changed Fields</th>
                  </tr>
                </thead>
                <tbody>
                  {updatedVehicles.map((item, index) => (
                    <tr key={`${item.vrm || "vrm"}-${item.vehicleId || index}`}>
                      <td className={layoutStyles.extracted7}>{item.vrm || "-"}</td>
                      <td className={layoutStyles.extracted8}>{item.name || item.vehicleId || "-"}</td>
                      <td className={layoutStyles.extracted9}>{item.nextMOT || "-"}</td>
                      <td className={layoutStyles.extracted10}>{item.lastMOT || "-"}</td>
                      <td className={layoutStyles.extracted11}>{item.odometer || "-"}</td>
                      <td className={layoutStyles.extracted12}>{item.testNumber || "-"}</td>
                      <td className={layoutStyles.extracted13}>{formatList(item.changedFields)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 14, color: UI.muted, fontSize: 13 }}>
              {meta ? "No vehicle records changed during the latest fetch." : "No all-vehicle fetch has been recorded yet."}
            </div>
          )}
        </div>

        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: UI.border, display: "flex", alignItems: "center", gap: 8 }}>
            <TriangleAlert size={17} color={failures.length ? UI.red : UI.green} />
            <div style={{ fontSize: 15, fontWeight: 950, color: UI.text }}>
              {failures.length ? "Vehicle Errors" : "No Vehicle Errors"}
            </div>
          </div>

          {failures.length ? (
            <div className={layoutStyles.extracted14}>
              <table className={layoutStyles.extracted15}>
                <thead>
                  <tr>
                    <th style={th}>Registration</th>
                    <th style={th}>Vehicle ID</th>
                    <th style={th}>Status</th>
                    <th style={th}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((failure, index) => (
                    <tr key={`${failure.vrm || "vrm"}-${failure.vehicleId || index}`}>
                      <td className={layoutStyles.extracted16}>{failure.vrm || "-"}</td>
                      <td className={layoutStyles.extracted17}>{failure.vehicleId || "-"}</td>
                      <td className={layoutStyles.extracted18}>{failure.status || "-"}</td>
                      <td style={{ ...td, color: UI.var(--color-danger), fontWeight: 800 }}>{failure.message || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 14, color: UI.muted, fontSize: 13 }}>
              {meta ? "The latest all-vehicle fetch completed without recorded vehicle-level errors." : "No all-vehicle fetch has been recorded yet."}
            </div>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
