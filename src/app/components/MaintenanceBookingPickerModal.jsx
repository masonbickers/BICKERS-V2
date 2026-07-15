"use client";

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
      style={overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && typeof onClose === "function") onClose();
      }}
    >
      <div style={modal}>
        <h3 style={title}>Add Maintenance Booking</h3>
        <div style={hint}>
          Choose a vehicle and/or equipment, then the new maintenance booking form will open.
        </div>

        <div style={fields}>
          <div>
            <label style={label}>Vehicle</label>
            <select
              value={vehicleId}
              onChange={(e) => onVehicleChange?.(e.target.value)}
              style={input}
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
            <label style={label}>Booking type</label>
            <select
              value={maintenanceType}
              onChange={(e) => onTypeChange?.(e.target.value)}
              style={input}
            >
              <option value="WORK">Work / Inspection</option>
              <option value="MOT">MOT</option>
              <option value="SERVICE">Service</option>
            </select>
          </div>

          <div>
            <label style={label}>Equipment</label>
            <select
              value={equipment}
              onChange={(e) => onEquipmentChange?.(e.target.value)}
              style={input}
            >
              <option value="">No equipment</option>
              {equipmentOptions.map((equipmentName) => (
                <option key={equipmentName} value={equipmentName}>
                  {equipmentName}
                </option>
              ))}
            </select>
          </div>

          <div style={actions}>
            <button type="button" onClick={onClose} style={ghostBtn}>
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
  padding: "var(--space-4)",
  borderRadius: 16,
  background: "var(--color-white)",
  border: "1px solid var(--legacy-color-dbe2ea)",
  boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
};

const title = {
  margin: 0,
  fontSize: "var(--font-size-lg)",
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
  gap: "var(--space-3)",
  marginTop: 14,
};

const label = {
  display: "block",
  fontSize: "var(--font-size-xs)",
  fontWeight: 800,
  color: "var(--color-text)",
  marginBottom: 6,
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--legacy-color-e5e7eb)",
  outline: "none",
  fontSize: 13.5,
  background: "var(--color-white)",
};

const actions = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
};

const ghostBtn = {
  borderRadius: "var(--radius-lg)",
  padding: "10px 14px",
  fontSize: 13.5,
  fontWeight: 800,
  border: "1px solid var(--legacy-color-d1d5db)",
  background: "var(--color-white)",
  color: "var(--color-text)",
  cursor: "pointer",
};

const primaryBtn = {
  borderRadius: "var(--radius-lg)",
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
