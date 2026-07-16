"use client";

import layoutStyles from "./MaintenanceBookingPickerModal.styles.module.css";
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
    <div
      className={layoutStyles.extracted1}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && typeof onClose === "function") onClose();
      }}
    >
      <div className={layoutStyles.extracted2}>
        <h3 className={layoutStyles.extracted3}>Add Maintenance Booking</h3>
        <div className={layoutStyles.extracted4}>
          Choose a vehicle and/or equipment, then the new maintenance booking form will open.
        </div>

        <div className={layoutStyles.extracted5}>
          <div>
            <label className={layoutStyles.extracted6}>Vehicle</label>
            <select
              value={vehicleId}
              onChange={(e) => onVehicleChange?.(e.target.value)}
              className={layoutStyles.extracted7}
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
                    : registration || vehicle.id;

                  return (
                    <option key={vehicle.id} value={vehicle.id}>
                      {optionLabel}
                    </option>
                  );
                })}
            </select>
          </div>

          <div>
            <label className={layoutStyles.extracted8}>Booking type</label>
            <select
              value={maintenanceType}
              onChange={(e) => onTypeChange?.(e.target.value)}
              className={layoutStyles.extracted9}
            >
              <option value="WORK">Work / Inspection</option>
              <option value="MOT">MOT</option>
              <option value="SERVICE">Service</option>
            </select>
          </div>

          <div>
            <label className={layoutStyles.extracted10}>Equipment</label>
            <select
              value={equipment}
              onChange={(e) => onEquipmentChange?.(e.target.value)}
              className={layoutStyles.extracted11}
            >
              <option value="">No equipment</option>
              {equipmentOptions.map((equipmentName) => (
                <option key={equipmentName} value={equipmentName}>
                  {equipmentName}
                </option>
              ))}
            </select>
          </div>

          <div className={layoutStyles.extracted12}>
            <button type="button" onClick={onClose} className={layoutStyles.extracted13}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!canContinue) return;
                onContinue?.();
              }}
              disabled={!canContinue}
              style={canContinue ? primaryBtn : disabledBtn}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
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
