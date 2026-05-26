"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";

const UI = {
  radius: 8,
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandBorder: "#c8d6e3",
  red: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};

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
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  color: UI.text,
  fontWeight: 850,
  cursor: "pointer",
  fontSize: 13,
};
const th = {
  padding: "8px 10px",
  background: UI.brand,
  color: "#fff",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 900,
};
const td = {
  padding: "8px 10px",
  borderBottom: "1px solid #e5eaf1",
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: UI.text }}>MOT Fetch Summary</h1>
            <div style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}>
              Last all-vehicle DVSA MOT data fetch and any vehicle-level errors.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
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
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
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
                      <td style={td}>{item.vrm || "-"}</td>
                      <td style={td}>{item.name || item.vehicleId || "-"}</td>
                      <td style={td}>{item.nextMOT || "-"}</td>
                      <td style={td}>{item.lastMOT || "-"}</td>
                      <td style={td}>{item.odometer || "-"}</td>
                      <td style={td}>{item.testNumber || "-"}</td>
                      <td style={td}>{formatList(item.changedFields)}</td>
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
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
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
                      <td style={td}>{failure.vrm || "-"}</td>
                      <td style={td}>{failure.vehicleId || "-"}</td>
                      <td style={td}>{failure.status || "-"}</td>
                      <td style={{ ...td, color: UI.red, fontWeight: 800 }}>{failure.message || "-"}</td>
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
