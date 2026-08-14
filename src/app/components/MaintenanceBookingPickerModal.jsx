"use client";

import layoutStyles from "./MaintenanceBookingPickerModal.styles.module.css";
import { Button, FormField, Modal, Select } from "@/app/components/ui";
export default function MaintenanceBookingPickerModal({
  open,
  vehicles = [],
  equipmentOptions = [],
  maintenanceType = "WORK",
  vehicleId = "",
  equipment = "",
  onClose,
  onContinue,
  onVehicleChange,
  onTypeChange,
  onEquipmentChange,
}) {
  if (!open) return null;

  const canContinue = !!vehicleId || !!equipment;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Maintenance Booking"
      description="Choose a vehicle and/or equipment, then the new maintenance booking form will open."
      size="sm"
      density="compact"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => canContinue && onContinue?.()} disabled={!canContinue}>Continue</Button>
        </>
      }
    >
        <div className={layoutStyles.extracted5}>
          <FormField label="Vehicle">
            <Select
              value={vehicleId}
              onChange={(e) => onVehicleChange?.(e.target.value)}
            >
              <option value="">Select vehicle...</option>
              {vehicles
                .slice()
                .sort((a, b) =>
                  `${a.name || ""} ${a.registration || ""}`.localeCompare(
                    `${b.name || ""} ${b.registration || ""}`
                  )
                )
                .map((vehicle) => {
                  const registration = String(vehicle.registration || vehicle.reg || "")
                    .toUpperCase()
                    .trim();
                  const optionLabel = vehicle.name
                    ? registration
                      ? `${vehicle.name} (${registration})`
                      : vehicle.name
                    : registration || "Unknown vehicle";

                  return (
                    <option key={vehicle.id} value={vehicle.id}>
                      {optionLabel}
                    </option>
                  );
                })}
            </Select>
          </FormField>

          <FormField label="Booking type">
            <Select
              value={maintenanceType}
              onChange={(e) => onTypeChange?.(e.target.value)}
            >
              <option value="WORK">Work / Inspection</option>
              <option value="MOT">MOT</option>
              <option value="SERVICE">Service</option>
            </Select>
          </FormField>

          <FormField label="Equipment">
            <Select
              value={equipment}
              onChange={(e) => onEquipmentChange?.(e.target.value)}
            >
              <option value="">No equipment</option>
              {equipmentOptions.map((equipmentName) => (
                <option key={equipmentName} value={equipmentName}>
                  {equipmentName}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
    </Modal>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 55,
  padding: 18,
};

const modal = {
  width: 520,
  maxWidth: "94vw",
  padding: 16,
  borderRadius: 16,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
};

const title = {
  margin: 0,
  fontSize: 16,
  fontWeight: 900,
  color: "var(--color-text)",
};

const hint = {
  color: "var(--color-text-muted)",
  fontSize: 12.5,
  marginTop: 6,
  lineHeight: 1.45,
};

const fields = {
  display: "grid",
  gap: 12,
  marginTop: 14,
};

const label = {
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  color: "var(--color-text)",
  marginBottom: 6,
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  outline: "none",
  fontSize: 13.5,
  background: "var(--color-surface)",
};

const actions = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
};

const ghostBtn = {
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13.5,
  fontWeight: 800,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  cursor: "pointer",
};

const primaryBtn = {
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13.5,
  fontWeight: 800,
  border: "1px solid var(--color-brand)",
  background: "var(--color-brand)",
  color: "var(--color-white)",
  cursor: "pointer",
};

const disabledBtn = {
  ...primaryBtn,
  opacity: 0.45,
  cursor: "not-allowed",
};
