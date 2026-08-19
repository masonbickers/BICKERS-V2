"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import { useEffect, useMemo, useState } from "react";
import { Button, FormField, Input, Modal, Textarea } from "@/app/components/ui";
import { useDataAccessState } from "@/app/utils/firestoreAccess";
import {
  isAdminCorrectableVorPeriod,
  isAutomaticComplianceVorPeriod,
  isHistoricallyMigratedVorPeriod,
} from "@/app/utils/vorPeriods";
import {
  mutateVehicleVor,
  VEHICLE_VOR_OPERATIONS,
} from "@/app/utils/vehicleVorMutationClient";
import { linkHistoricVorFirstUseInspection } from "@/app/utils/maintenanceMutationClient";

const dateValue = (value) => String(value || "").slice(0, 10);
const displayDate = (value) => {
  const iso = dateValue(value);
  if (!iso) return "Not recorded";
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-GB");
};
const displayValue = (value) => String(value || "").trim() || "Not recorded";

const editableFields = [
  ["offRoadDate", "VOR/SORN start date", "date"],
  ["returnedDate", "Return date", "date"],
  ["offRoadOdometer", "Odometer when taken off road", "text"],
  ["returnOdometer", "Odometer when returned", "text"],
  ["approvedBy", "VOR approved by", "text"],
  ["approvedPosition", "Approver position", "text"],
  ["removedBy", "Return authorised by", "text"],
  ["removedPosition", "Return authoriser position", "text"],
  ["firstUseInspectionDate", "First-use inspection date", "date"],
];

export default function VorPeriodDetailsModal({ vehicle, period, onClose }) {
  const dataAccessState = useDataAccessState();
  const [mode, setMode] = useState("details");
  const [form, setForm] = useState({});
  const [changeReason, setChangeReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode("details");
    setForm({ ...(period || {}) });
    setChangeReason("");
    setError("");
  }, [period]);

  const role = String(
    dataAccessState?.userDoc?.role || dataAccessState?.userDoc?.platformRole || ""
  ).trim().toLowerCase();
  const isAdmin = ["admin", "platformadmin", "platform_admin"].includes(role);
  const isMigrated = isHistoricallyMigratedVorPeriod(period);
  const isAutomatic = isAutomaticComplianceVorPeriod(period);
  const isArchived = String(period?.status || "").trim().toLowerCase() === "archived";
  const isOpen = String(period?.status || "").trim().toLowerCase() === "open";
  const canCorrect = isAdmin && isAdminCorrectableVorPeriod(period) && !isArchived && !isOpen && !!vehicle?.id && !!period?.id;
  const canLinkInspection = isAdmin && !isArchived && !isOpen && !!vehicle?.id && !!period?.id &&
    !!dateValue(period?.firstUseInspectionDate) && !String(period?.linkedFirstUseInspectionBookingId || "").trim();

  const statusLabel = useMemo(() => {
    const state = String(period?.status || "closed").trim().toLowerCase();
    const lifecycle = state === "open" ? "Open period" : state === "archived" ? "Archived period" : "Closed period";
    if (isMigrated) return `Historically migrated · ${lifecycle}`;
    if (isAutomatic) return `Automatic compliance · ${lifecycle}`;
    return lifecycle;
  }, [isAutomatic, isMigrated, period?.status]);

  if (!vehicle || !period) return null;

  const updateHistoricPeriod = async (action) => {
    if (!canCorrect || saving) return;
    if (!String(changeReason || "").trim()) {
      setError(`Enter a reason for ${action === "archive" ? "archiving" : "correcting"} this period.`);
      return;
    }
    if (action === "archive" && !await systemDialogs.confirmSystem("Archive this VOR/SORN period? Its original values and audit history will be retained.")) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      await mutateVehicleVor({
        vehicleId: vehicle.id,
        operation: action === "archive"
          ? VEHICLE_VOR_OPERATIONS.ARCHIVE_HISTORIC
          : VEHICLE_VOR_OPERATIONS.CORRECT_HISTORIC,
        payload: action === "archive"
          ? { recordId: period.id, reason: changeReason }
          : { recordId: period.id, changes: form, reason: changeReason },
        dataAccessState,
      });
      onClose?.();
    } catch (mutationError) {
      console.error("Historic VOR/SORN update failed:", mutationError);
      setError(mutationError?.message || "Could not update this historic VOR/SORN period.");
    } finally {
      setSaving(false);
    }
  };

  const linkFirstUseInspection = async () => {
    if (!canLinkInspection || saving) return;
    setSaving(true);
    setError("");
    try {
      await linkHistoricVorFirstUseInspection({ vehicleId: vehicle.id, periodId: period.id });
      onClose?.();
    } catch (mutationError) {
      console.error("Historic VOR first-use inspection link failed:", mutationError);
      setError(mutationError?.message || "Could not create the first-use inspection booking.");
    } finally {
      setSaving(false);
    }
  };

  const detailRows = [
    ["Status", statusLabel],
    ["Start date", displayDate(period.offRoadDate || period.startedAt)],
    ["Return date", displayDate(period.returnedDate || period.completedAt)],
    ["Reason", displayValue(period.reason)],
    ["VOR approved by", displayValue(period.approvedBy)],
    ["Approver position", displayValue(period.approvedPosition)],
    ["Return authorised by", displayValue(period.removedBy)],
    ["Return authoriser position", displayValue(period.removedPosition)],
    ["Off-road odometer", displayValue(period.offRoadOdometer)],
    ["Return odometer", displayValue(period.returnOdometer)],
    ["First-use inspection", displayDate(period.firstUseInspectionDate)],
  ];

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title={`VOR/SORN period · ${vehicle.registration || vehicle.reg || vehicle.name || "Vehicle"}`}
      description={statusLabel}
      size="lg"
      footer={
        mode === "details" ? (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
            {canLinkInspection ? <Button type="button" variant="primary" disabled={saving} onClick={linkFirstUseInspection}>{saving ? "Creating..." : "Create inspection booking"}</Button> : null}
            {canCorrect ? <Button type="button" variant="ghost" onClick={() => setMode("edit")}>Edit VOR period</Button> : null}
            {canCorrect ? <Button type="button" variant="danger" onClick={() => setMode("archive")}>Archive VOR period</Button> : null}
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => { setMode("details"); setError(""); }}>Cancel</Button>
            <Button
              type="button"
              variant={mode === "archive" ? "danger" : "primary"}
              disabled={saving}
              onClick={() => updateHistoricPeriod(mode)}
            >
              {saving ? "Saving..." : mode === "archive" ? "Archive period" : "Save correction"}
            </Button>
          </>
        )
      }
    >
      {error ? (
        <div role="alert" style={{ padding: 10, borderRadius: 8, background: "var(--color-danger-soft)", color: "var(--color-danger)", fontWeight: 750 }}>
          {error}
        </div>
      ) : null}

      {mode === "details" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, background: "var(--color-border)", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
          {detailRows.map(([label, value]) => (
            <div key={label} style={{ padding: 11, background: "var(--color-surface)" }}>
              <div style={{ fontSize: 11, fontWeight: 850, color: "var(--color-text-muted)", textTransform: "uppercase" }}>{label}</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
      ) : mode === "edit" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            {editableFields.map(([field, label, type]) => (
              <FormField key={field} label={label}>
                <Input
                  type={type}
                  value={type === "date" ? dateValue(form[field]) : String(form[field] || "")}
                  onChange={(event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))}
                />
              </FormField>
            ))}
          </div>
          <FormField label="Reason for VOR/SORN">
            <Textarea value={String(form.reason || "")} onChange={(event) => setForm((previous) => ({ ...previous, reason: event.target.value }))} />
          </FormField>
          <FormField label="Reason for this correction">
            <Textarea value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
          </FormField>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>The period will stop affecting the planner, but its original values and complete audit history will remain stored.</p>
          <FormField label="Reason for archiving">
            <Textarea value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
