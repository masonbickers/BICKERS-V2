"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../../../../firebaseConfig";
import { formatDateForDisplay, normalizeServiceRecord } from "@/app/utils/serviceRecordCompat";

const UI = {
  page: "var(--legacy-color-e5e7eb)",
  paper: "var(--color-white)",
  ink: "var(--legacy-color-111827)",
  muted: "var(--legacy-color-4b5563)",
  line: "var(--legacy-color-6b7280)",
  softLine: "var(--legacy-color-cbd5e1)",
  header: "var(--legacy-color-e5e7eb)",
  subHeader: "var(--legacy-color-f3f4f6)",
  blue: "var(--color-info)",
};

const pageWrap = {
  minHeight: "100vh",
  padding: "18px 22px 34px",
  background: UI.page,
};

const toolbar = {
  maxWidth: 1280,
  margin: "0 auto 12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--space-3)",
};

const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 34,
  padding: "7px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--legacy-color-9ca3af)",
  background: "var(--color-white)",
  color: UI.ink,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const sheet = {
  maxWidth: 1280,
  margin: "0 auto",
  background: UI.paper,
  border: "1px solid var(--legacy-color-9ca3af)",
  boxShadow: "0 16px 34px rgba(15,23,42,0.18)",
  padding: 18,
  color: UI.ink,
};

const sheetHeader = {
  display: "grid",
  gridTemplateColumns: "1fr 1.2fr 1fr",
  gap: "var(--space-3)",
  alignItems: "start",
  marginBottom: 10,
};

const titleBlock = {
  textAlign: "center",
  padding: "7px 10px",
  minHeight: 78,
  display: "grid",
  alignContent: "center",
  justifyItems: "center",
};

const subtitle = {
  marginBottom: 7,
  fontSize: 19,
  fontWeight: 900,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: UI.ink,
};

const sectionTitle = {
  background: UI.header,
  border: `1px solid ${UI.line}`,
  borderBottom: "none",
  padding: "4px 7px",
  fontSize: 11,
  lineHeight: 1.1,
  fontWeight: 950,
  letterSpacing: ".04em",
  textTransform: "uppercase",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  fontSize: 11,
  lineHeight: 1.25,
};

const th = {
  border: `1px solid ${UI.line}`,
  background: UI.subHeader,
  padding: "4px 5px",
  textAlign: "left",
  fontSize: 9.5,
  fontWeight: 950,
  textTransform: "uppercase",
};

const td = {
  border: `1px solid ${UI.line}`,
  padding: "4px 5px",
  verticalAlign: "top",
  overflowWrap: "anywhere",
};

const compactTd = { ...td, padding: "3px 4px" };

const twoColumn = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--space-3)",
  alignItems: "start",
};

const lowerGrid = {
  display: "grid",
  gridTemplateColumns: "0.72fr 1.28fr",
  gap: "var(--space-3)",
  alignItems: "start",
  marginTop: "var(--space-3)",
};

const wheelPositions = [
  { key: "frontLeft", label: "Front Left", gridArea: "frontLeft" },
  { key: "frontRight", label: "Front Right", gridArea: "frontRight" },
  { key: "rearLeft", label: "Rear Left", gridArea: "rearLeft" },
  { key: "rearRight", label: "Rear Right", gridArea: "rearRight" },
];

const checklistCategories = [
  {
    title: "Engine & Fluids",
    labels: [
      "Engine oil & filter replaced",
      "Air filter checked / replaced",
      "Coolant level & condition checked",
      "Brake fluid level & condition checked",
      "Fuel filter checked / replaced (if applicable)",
      "Cabin / pollen filter checked / replaced",
      "Power steering / PAS fluid checked (if fitted)",
      "Washer fluid topped up",
    ],
  },
  {
    title: "Safety & Chassis",
    labels: [
      "Brake system checked for leaks / damage",
      "Exhaust system checked for leaks / damage / security",
      "Tyres checked for visible damage / sidewall condition",
      "Wheel bearings checked for play / noise",
      "Steering joints & rack inspected",
      "Suspension arms, bushes & shocks inspected",
    ],
  },
  {
    title: "Electrical & Test",
    labels: [
      "All exterior lights & indicators checked",
      "Brake lights & reverse lights checked",
      "Horn, wipers & washers checked",
      "Battery condition / terminals checked",
      "Road test completed",
      "Dashboard warning lights confirmed off after service",
    ],
  },
];

const ratingStyles = {
  green: { background: "var(--legacy-color-86efac)", color: "var(--legacy-color-052e16)" },
  amber: { background: "var(--legacy-color-facc15)", color: "var(--legacy-color-422006)" },
  red: { background: "var(--legacy-color-f87171)", color: "var(--legacy-color-450a0a)" },
  na: { background: "var(--legacy-color-d1d5db)", color: "var(--legacy-color-374151)" },
  blank: { background: "var(--legacy-color-f9fafb)", color: "var(--legacy-color-6b7280)" },
};

const statusSymbols = {
  green: "✓",
  amber: "-",
  red: "×",
};

const actionLabels = {
  repaired: "Repaired",
  replaced: "Replaced",
  not_repaired: "Not repaired",
  "": "-",
};

function displayValue(value, suffix = "") {
  const text = String(value ?? "").trim();
  return text ? `${text}${suffix}` : "-";
}

function resultStyle(tone) {
  return {
    ...compactTd,
    ...(ratingStyles[tone] || ratingStyles.blank),
    width: 44,
    textAlign: "center",
    fontWeight: 950,
  };
}

function ResultCell({ rating, na, checked, hasEntry }) {
  const tone = na ? "na" : rating || (checked || hasEntry ? "green" : "blank");
  const label = na ? "N/A" : rating || (checked || hasEntry ? "green" : "not set");
  return <td aria-label={label} style={resultStyle(tone)}>{statusSymbols[tone] || ""}</td>;
}

function FieldTable({ rows }) {
  return (
    <table style={table}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th style={{ ...th, width: "34%" }}>{label}</th>
            <td style={td}>{value || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title: sectionName, children, style }) {
  return (
    <section style={style}>
      <div style={sectionTitle}>{sectionName}</div>
      {children}
    </section>
  );
}

function PhotoLinks({ photos }) {
  if (!Array.isArray(photos) || photos.length === 0) return "-";
  return photos.map((url, index) => (
    <React.Fragment key={`${url}-${index}`}>
      {index > 0 ? ", " : ""}
      <a href={url} target="_blank" rel="noreferrer" style={{ color: UI.blue, fontWeight: 800 }}>
        {index + 1}
      </a>
    </React.Fragment>
  ));
}

function ChecklistTable({ rows, startNumber }) {
  return (
    <table style={table}>
      <thead>
        <tr>
          <th style={{ ...th, width: 34 }}>Code</th>
          <th style={th}>Inspection Item</th>
          <th style={{ ...th, width: 44, textAlign: "center" }}>Result</th>
          <th style={{ ...th, width: 150 }}>Notes / Images</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item, index) => (
          <tr key={item.label}>
            <td style={{ ...compactTd, textAlign: "center", fontWeight: 900 }}>{startNumber + index}</td>
            <td style={compactTd}>{item.label}</td>
            <ResultCell rating={item.rating} na={item.na} checked={item.checked} hasEntry={item.hasEntry} />
            <td style={compactTd}>
              <div>{item.note || "-"}</div>
              {item.photos.length ? (
                <div style={{ marginTop: 3, color: UI.muted }}>Images: <PhotoLinks photos={item.photos} /></div>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChecklistCategoryTable({ groups, startNumber = 1 }) {
  let code = startNumber;

  return (
    <table style={table}>
      <thead>
        <tr>
          <th style={{ ...th, width: 34 }}>Code</th>
          <th style={th}>Inspection Item</th>
          <th style={{ ...th, width: 44, textAlign: "center" }}>Result</th>
          <th style={{ ...th, width: 150 }}>Notes / Images</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <React.Fragment key={group.title}>
            <tr>
              <td style={{ ...compactTd, background: UI.subHeader, fontWeight: 950 }} colSpan={4}>
                {group.title}
              </td>
            </tr>
            {group.rows.map((item) => {
              const itemCode = code;
              code += 1;
              return (
                <tr key={item.label}>
                  <td style={{ ...compactTd, textAlign: "center", fontWeight: 900 }}>{itemCode}</td>
                  <td style={compactTd}>{item.label}</td>
                  <ResultCell rating={item.rating} na={item.na} checked={item.checked} hasEntry={item.hasEntry} />
                  <td style={compactTd}>
                    <div>{item.note || "-"}</div>
                    {item.photos.length ? (
                      <div style={{ marginTop: 3, color: UI.muted }}>Images: <PhotoLinks photos={item.photos} /></div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

function countChecklistRows(groups) {
  return groups.reduce((sum, group) => sum + group.rows.length, 0);
}

function splitChecklistGroups(groups) {
  if (groups.length <= 1) return [groups, []];

  const engine = groups.find((group) => group.title === "Engine & Fluids");
  const electrical = groups.find((group) => group.title === "Electrical & Test");
  const safety = groups.find((group) => group.title === "Safety & Chassis");
  if (engine && electrical && safety) {
    const assigned = new Set([engine.title, electrical.title, safety.title]);
    const otherGroups = groups.filter((group) => !assigned.has(group.title));
    return [[engine, ...otherGroups], [electrical, safety]];
  }

  const target = Math.ceil(countChecklistRows(groups) / 2);
  const left = [];
  const right = [];
  let leftCount = 0;

  groups.forEach((group) => {
    if (left.length === 0 || leftCount < target) {
      left.push(group);
      leftCount += group.rows.length;
      return;
    }
    right.push(group);
  });

  return [left, right];
}

function WheelCard({ label, data }) {
  return (
    <div
      style={{
        border: `1px solid ${UI.line}`,
        background: "var(--color-white)",
        padding: 6,
        minHeight: 86,
        display: "grid",
        alignContent: "start",
        gap: "var(--space-1)",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 950, textTransform: "uppercase", color: UI.ink }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 6px", fontSize: 10.5 }}>
        <span style={{ color: UI.muted, fontWeight: 800 }}>Tread</span>
        <strong>{displayValue(data?.tread, data?.tread ? " mm" : "")}</strong>
        <span style={{ color: UI.muted, fontWeight: 800 }}>Pressure</span>
        <strong>{displayValue(data?.pressure, data?.pressure ? " psi" : "")}</strong>
        <span style={{ color: UI.muted, fontWeight: 800 }}>Brake wear</span>
        <strong>{displayValue(data?.brakeWear, data?.brakeWear ? "% used" : "")}</strong>
      </div>
      {data?.note ? <div style={{ fontSize: 10, color: UI.muted }}>{data.note}</div> : null}
    </div>
  );
}

function WheelOverview({ wheelInspection }) {
  const data = wheelInspection || {};

  return (
    <div
      style={{
        border: `1px solid ${UI.line}`,
        padding: 10,
        display: "grid",
        gridTemplateColumns: "1fr 112px 1fr",
        gridTemplateRows: "auto 58px auto",
        gridTemplateAreas: `
          "frontLeft vehicle frontRight"
          "frontLeft vehicle frontRight"
          "rearLeft vehicle rearRight"
        `,
        gap: "var(--space-2)",
        alignItems: "center",
        background: "var(--color-surface-subtle)",
      }}
    >
      {wheelPositions.map((position) => (
        <div key={position.key} style={{ gridArea: position.gridArea }}>
          <WheelCard label={position.label} data={data[position.key]} />
        </div>
      ))}

      <div
        style={{
          gridArea: "vehicle",
          alignSelf: "stretch",
          display: "grid",
          gridTemplateRows: "18px 1fr 18px",
          minHeight: 212,
        }}
        aria-hidden="true"
      >
        <div
          style={{
            justifySelf: "center",
            width: 54,
            borderLeft: `2px solid ${UI.line}`,
            borderRight: `2px solid ${UI.line}`,
            borderTop: `2px solid ${UI.line}`,
            borderRadius: "28px 28px 4px 4px",
          }}
        />
        <div
          style={{
            justifySelf: "center",
            width: 74,
            borderLeft: `2px solid ${UI.line}`,
            borderRight: `2px solid ${UI.line}`,
            background:
              "linear-gradient(180deg, transparent 0 26%, var(--legacy-color-cbd5e1) 26% 28%, transparent 28% 72%, var(--legacy-color-cbd5e1) 72% 74%, transparent 74%)",
          }}
        />
        <div
          style={{
            justifySelf: "center",
            width: 60,
            borderLeft: `2px solid ${UI.line}`,
            borderRight: `2px solid ${UI.line}`,
            borderBottom: `2px solid ${UI.line}`,
            borderRadius: "4px 4px 28px 28px",
          }}
        />
      </div>
    </div>
  );
}

function DefectResultCell({ action }) {
  const tone = action === "not_repaired" ? "red" : action ? "green" : "blank";
  const label = action === "not_repaired" ? "red" : action ? "green" : "not set";
  return <td aria-label={label} style={resultStyle(tone)}>{statusSymbols[tone] || ""}</td>;
}

export default function VehicleServiceHistoryDetailPage() {
  const router = useRouter();
  const { id, serviceId } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printOrientation, setPrintOrientation] = useState("landscape");

  useEffect(() => {
    if (!serviceId) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "serviceRecords", serviceId));
        setRecord(snap.exists() ? normalizeServiceRecord({ id: snap.id, ...(snap.data() || {}) }) : null);
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
      rating: String(record.checkRatings?.[label] || "").trim().toLowerCase(),
      na: !!record.checkNA?.[label],
      note: record.checkNotes?.[label] || "",
      photos: Array.isArray(record.checkPhotoURIs?.[label]) ? record.checkPhotoURIs[label] : [],
      hasEntry: Boolean(record.checkNotes?.[label]) || (Array.isArray(record.checkPhotoURIs?.[label]) && record.checkPhotoURIs[label].length > 0),
    }));
  }, [record]);

  const checklistGroups = useMemo(() => {
    const byLabel = new Map(checklistItems.map((item) => [item.label, item]));
    const knownLabels = new Set(checklistCategories.flatMap((group) => group.labels));
    const groups = checklistCategories
      .map((group) => ({
        title: group.title,
        rows: group.labels.map((label) => byLabel.get(label)).filter(Boolean),
      }))
      .filter((group) => group.rows.length);

    const otherRows = checklistItems.filter((item) => !knownLabels.has(item.label));
    if (otherRows.length) groups.push({ title: "Other Checks", rows: otherRows });

    return groups;
  }, [checklistItems]);
  const [leftChecklistGroups, rightChecklistGroups] = useMemo(
    () => splitChecklistGroups(checklistGroups),
    [checklistGroups]
  );
  const rightChecklistStart = countChecklistRows(leftChecklistGroups) + 1;
  const defectRows = Object.values(record?.serviceDefectActions || {});
  const advisoryRows = Object.values(record?.advisoryActions || {});
  const overallPhotos = Array.isArray(record?.photoURIs) ? record.photoURIs : [];
  const totalChecklistPhotos = Object.values(record?.checkPhotoURIs || {}).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
    0
  );
  const nextServiceLabel =
    record?.nextServiceDateDisplay ||
    formatDateForDisplay(record?.nextServiceDate || record?.nextService) ||
    record?.nextService ||
    "-";
  const pageLabel = record?.registration || record?.vehicleName || "Service record";
  const printSheet = (orientation) => {
    setPrintOrientation(orientation);
    window.requestAnimationFrame(() => window.print());
  };

  return (
    <HeaderSidebarLayout>
      <div className="service-sheet-page" style={pageWrap}>
        <div className="service-sheet-toolbar" style={toolbar}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: UI.ink }}>Service Sheet</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: UI.muted }}>{pageLabel}</div>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" style={btn} onClick={() => printSheet("landscape")}>
              Print Landscape
            </button>
            <button type="button" style={btn} onClick={() => printSheet("portrait")}>
              Print Portrait
            </button>
            <button type="button" style={btn} onClick={() => router.push(`/vehicle-edit/${id}/service-history`)}>
              Back To Service History
            </button>
          </div>
        </div>

        {loading ? (
          <div style={sheet}>Loading service details...</div>
        ) : !record ? (
          <div style={sheet}>Service record not found.</div>
        ) : (
          <div className="service-sheet-paper" style={sheet}>
            <style>{`
              @page {
                size: A4 ${printOrientation};
                margin: 5mm;
              }
              @media print {
                * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                html,
                body {
                  background: var(--color-white) !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }
                body * {
                  visibility: hidden !important;
                }
                .service-sheet-toolbar {
                  display: none !important;
                }
                .service-sheet-page {
                  padding: 0 !important;
                  background: var(--color-white) !important;
                }
                .service-sheet-paper,
                .service-sheet-paper * {
                  visibility: visible !important;
                }
                .service-sheet-paper {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: ${printOrientation === "portrait" ? "200mm" : "287mm"} !important;
                  max-width: none !important;
                  margin: 0 !important;
                  background: var(--color-white) !important;
                  border: none !important;
                  box-shadow: none !important;
                  padding: 0 !important;
                  color: ${UI.ink} !important;
                  transform: none !important;
                  transform-origin: top left !important;
                }
                .service-sheet-paper {
                  font-size: ${printOrientation === "portrait" ? "9.6px" : "9.2px"} !important;
                }
                .service-sheet-paper table {
                  font-size: ${printOrientation === "portrait" ? "7.7px" : "8.45px"} !important;
                  line-height: ${printOrientation === "portrait" ? "1.1" : "1.11"} !important;
                }
                .service-sheet-paper th,
                .service-sheet-paper td {
                  padding: ${printOrientation === "portrait" ? "2px 2.8px" : "2px 3.3px"} !important;
                }
                .service-sheet-paper a {
                  color: ${UI.blue} !important;
                }
                .service-sheet-header {
                  grid-template-columns: ${printOrientation === "portrait" ? "0.9fr 1.18fr 0.9fr" : "0.92fr 1.08fr 0.92fr"} !important;
                  gap: ${printOrientation === "portrait" ? "2.2mm" : "3mm"} !important;
                  margin-bottom: ${printOrientation === "portrait" ? "3mm" : "3mm"} !important;
                }
                .service-sheet-header > div:nth-child(2) {
                  min-height: ${printOrientation === "portrait" ? "21mm" : "24mm"} !important;
                  padding: ${printOrientation === "portrait" ? "1.2mm" : "2mm"} !important;
                }
                .service-sheet-header img {
                  height: ${printOrientation === "portrait" ? "15mm" : "17mm"} !important;
                  width: ${printOrientation === "portrait" ? "65mm" : "76mm"} !important;
                }
                .service-sheet-header div {
                  font-size: ${printOrientation === "portrait" ? "6.8px" : "7px"} !important;
                }
                .service-sheet-title {
                  font-size: ${printOrientation === "portrait" ? "17px" : "15px"} !important;
                  margin-bottom: ${printOrientation === "portrait" ? "1mm" : "1.4mm"} !important;
                  color: ${UI.ink} !important;
                  font-weight: 950 !important;
                }
                .service-sheet-two-column {
                  grid-template-columns: 1fr 1fr !important;
                  gap: ${printOrientation === "portrait" ? "3mm" : "3mm"} !important;
                }
                .service-sheet-lower-grid {
                  grid-template-columns: ${printOrientation === "portrait" ? "0.58fr 1fr" : "0.56fr 1fr"} !important;
                  gap: ${printOrientation === "portrait" ? "3mm" : "3mm"} !important;
                  margin-top: ${printOrientation === "portrait" ? "4mm" : "3mm"} !important;
                }
                .service-sheet-paper section > div:first-child {
                  padding: ${printOrientation === "portrait" ? "3px 4px" : "2px 4px"} !important;
                  font-size: ${printOrientation === "portrait" ? "8.2px" : "8px"} !important;
                }
                .service-sheet-paper strong {
                  font-size: inherit !important;
                }
                .wheel-overview-wrap > div {
                  padding: ${printOrientation === "portrait" ? "2.4mm" : "2mm"} !important;
                  gap: ${printOrientation === "portrait" ? "2.2mm" : "2mm"} !important;
                  grid-template-columns: 1fr ${printOrientation === "portrait" ? "24mm" : "24mm"} 1fr !important;
                  grid-template-rows: auto ${printOrientation === "portrait" ? "14mm" : "12mm"} auto !important;
                }
                .wheel-overview-wrap > div > div:not(:last-child) > div {
                  min-height: ${printOrientation === "portrait" ? "22mm" : "17mm"} !important;
                  padding: ${printOrientation === "portrait" ? "1.8mm" : "1.5mm"} !important;
                }
                .wheel-overview-wrap > div > div:not(:last-child) div {
                  font-size: ${printOrientation === "portrait" ? "7.2px" : "7.4px"} !important;
                }
                .wheel-overview-wrap > div > div:last-child {
                  min-height: ${printOrientation === "portrait" ? "50mm" : "39mm"} !important;
                }
                .service-sheet-header,
                .service-sheet-two-column,
                .service-sheet-lower-grid {
                  display: grid !important;
                  break-inside: avoid !important;
                  page-break-inside: avoid !important;
                }
                table,
                tr,
                section {
                  break-inside: avoid !important;
                  page-break-inside: avoid !important;
                }
              }
              @media screen and (max-width: 1100px) {
                .service-sheet-header,
                .service-sheet-two-column,
                .service-sheet-lower-grid {
                  grid-template-columns: 1fr !important;
                }
              }
              @media screen and (max-width: 760px) {
                .wheel-overview-wrap > div {
                  grid-template-columns: 1fr !important;
                  grid-template-rows: auto !important;
                  grid-template-areas:
                    "vehicle"
                    "frontLeft"
                    "frontRight"
                    "rearLeft"
                    "rearRight" !important;
                }
              }
            `}</style>

            <div className="service-sheet-header" style={sheetHeader}>
              <FieldTable
                rows={[
                  ["Inspection Date", record.serviceDateDisplay || formatDateForDisplay(record.serviceDate)],
                  ["Inspection Time", record.serviceTime],
                  ["Odometer", record.odometer],
                  ["Signed By", record.signedBy],
                ]}
              />

              <div style={titleBlock}>
                <div className="service-sheet-title" style={subtitle}>Vehicle Service Sheet</div>
                <Image
                  src="/bickers-action-logo.png"
                  alt="Bickers Action"
                  width={420}
                  height={82}
                  priority
                  style={{ display: "block", width: "98%", maxWidth: 420, height: 82, objectFit: "contain" }}
                />
              </div>

              <FieldTable
                rows={[
                  ["Vehicle", record.vehicleName],
                  ["Registration", record.registration],
                  ["Make / Model", [record.manufacturer, record.model].filter(Boolean).join(" ")],
                  ["Service Type", record.serviceType],
                  ["Next Service", nextServiceLabel],
                ]}
              />
            </div>

            <div style={{ margin: "8px 0 10px", fontSize: 10.5, fontWeight: 800, color: UI.muted }}>
              KEY: green = satisfactory, amber = monitor, red = requires attention, N/A = not applicable
            </div>

            <Section title="Checklist" style={{ marginBottom: "var(--space-3)" }}>
              {checklistGroups.length ? (
                <div className="service-sheet-two-column" style={twoColumn}>
                  <ChecklistCategoryTable groups={leftChecklistGroups} />
                  {rightChecklistGroups.length ? (
                    <ChecklistCategoryTable groups={rightChecklistGroups} startNumber={rightChecklistStart} />
                  ) : (
                    <table style={table}><tbody><tr><td style={td}>No additional checklist details.</td></tr></tbody></table>
                  )}
                </div>
              ) : (
                <table style={table}><tbody><tr><td style={td}>No checklist details stored.</td></tr></tbody></table>
              )}
            </Section>

            <div className="service-sheet-lower-grid" style={lowerGrid}>
              <div style={{ display: "grid", gap: "var(--space-3)" }}>
                <Section title="Wheel Measurement Section">
                  <div className="wheel-overview-wrap">
                    <WheelOverview wheelInspection={record.wheelInspection} />
                  </div>
                </Section>

                <Section title="Photos">
                  <table style={table}>
                    <tbody>
                      <tr>
                        <th style={{ ...th, width: "38%" }}>Overall Images</th>
                        <td style={td}><PhotoLinks photos={overallPhotos} /></td>
                      </tr>
                      <tr>
                        <th style={{ ...th, width: "38%" }}>Checklist Image Count</th>
                        <td style={td}>{totalChecklistPhotos}</td>
                      </tr>
                    </tbody>
                  </table>
                </Section>
              </div>

              <div style={{ display: "grid", gap: "var(--space-3)" }}>
                <Section title="Work Summary">
                  <table style={table}>
                    <tbody>
                      <tr>
                        <th style={{ ...th, width: "18%" }}>Work</th>
                        <td style={td}>{record.workSummary || "-"}</td>
                      </tr>
                      <tr>
                        <th style={{ ...th, width: "18%" }}>Parts</th>
                        <td style={td}>{record.partsUsed || "-"}</td>
                      </tr>
                      <tr>
                        <th style={{ ...th, width: "18%" }}>Notes</th>
                        <td style={td}>{record.extraNotes || "-"}</td>
                      </tr>
                    </tbody>
                  </table>
                </Section>

                <Section title="Defect Report Actions">
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={{ ...th, width: 52 }}>Code</th>
                        <th style={th}>Defect Details</th>
                        <th style={{ ...th, width: 58, textAlign: "center" }}>Result</th>
                        <th style={{ ...th, width: 112 }}>Repair Code</th>
                        <th style={{ ...th, width: 145 }}>Report ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defectRows.length ? (
                        defectRows.map((row, index) => (
                          <tr key={row.key || index}>
                            <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>{index + 1}</td>
                            <td style={td}>
                              <strong>{row.title || "Defect"}</strong>
                              <div>{row.description || "-"}</div>
                              <div style={{ color: UI.muted }}>
                                {[row.wheelLabel, row.metric].filter(Boolean).join(" | ")}
                                {[row.wheelLabel, row.metric].filter(Boolean).length ? " | " : ""}
                                {displayValue(row.value, row.unit ? ` ${row.unit}` : "")}
                                {row.note ? ` | ${row.note}` : ""}
                              </div>
                            </td>
                            <DefectResultCell action={row.action} />
                            <td style={td}>{actionLabels[row.action] || row.action || "-"}</td>
                            <td style={td}>{row.defectReportId || "-"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td style={td} colSpan={5}>No defect actions stored.</td></tr>
                      )}
                    </tbody>
                  </table>
                </Section>

                <Section title="Advisory Actions">
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={{ ...th, width: 52 }}>Code</th>
                        <th style={th}>Advisory Details</th>
                        <th style={{ ...th, width: 96 }}>Status</th>
                        <th style={{ ...th, width: 120 }}>Updated By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advisoryRows.length ? (
                        advisoryRows.map((item, index) => (
                          <tr key={item.key || index}>
                            <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>{index + 1}</td>
                            <td style={td}>
                              <strong>{item.title || "Advisory"}</strong>
                              <div>{item.details || "-"}</div>
                              <div style={{ color: UI.muted }}>
                                {displayValue(item.value, item.unit ? ` ${item.unit}` : "")}
                                {item.note ? ` | ${item.note}` : ""}
                              </div>
                            </td>
                            <td style={td}>{item.status ? item.status.replace(/_/g, " ") : "-"}</td>
                            <td style={td}>{[item.updatedBy, item.updatedAt].filter(Boolean).join(" | ") || "-"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td style={td} colSpan={4}>No advisory actions stored.</td></tr>
                      )}
                    </tbody>
                  </table>
                </Section>

                <Section title="Monitor Report">
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={{ ...th, width: 52 }}>Code</th>
                        <th style={th}>Monitor Details</th>
                        <th style={{ ...th, width: 58, textAlign: "center" }}>Result</th>
                        <th style={{ ...th, width: 120 }}>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.monitorReport.length ? (
                        record.monitorReport.map((item, index) => (
                          <tr key={item.key || index}>
                            <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>{index + 1}</td>
                            <td style={td}>
                              <strong>{item.title || "Monitor item"}</strong>
                              <div>{item.details || "-"}</div>
                              <div style={{ color: UI.muted }}>{displayValue(item.value, item.unit ? ` ${item.unit}` : "")}</div>
                            </td>
                            <td aria-label="amber" style={resultStyle("amber")}>{statusSymbols.amber}</td>
                            <td style={td}>{item.source === "wheel" ? "Wheel" : "Checklist"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td style={td} colSpan={4}>No monitor report items stored.</td></tr>
                      )}
                    </tbody>
                  </table>
                </Section>

                {record.recordType === "repair" || record.serviceType === "General repair" ? (
                  <Section title="Repair Details">
                    <table style={table}>
                      <tbody>
                        <tr>
                          <th style={{ ...th, width: "22%" }}>Reason</th>
                          <td style={td}>{record.repairReason || "-"}</td>
                        </tr>
                        <tr>
                          <th style={{ ...th, width: "22%" }}>Summary</th>
                          <td style={td}>{record.repairSummary || record.workSummary || "-"}</td>
                        </tr>
                        <tr>
                          <th style={{ ...th, width: "22%" }}>Completed By</th>
                          <td style={td}>{record.completedBy || record.signedBy || "-"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </Section>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
