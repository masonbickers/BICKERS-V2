// Keep this list aligned with legalMaintenanceCompletionFieldsUnchanged() in
// firestore.rules. Browser vehicle-profile saves must never manufacture legal
// maintenance completion evidence; those fields are written by audited server
// maintenance and DVSA workflows.
export const VEHICLE_EDITOR_PROTECTED_MAINTENANCE_FIELDS = Object.freeze([
  "lastMOT",
  "lastMot",
  "lastMotDate",
  "motHistory",
  "lastService",
  "serviceHistory",
  "lastPMI",
  "lastPmi",
  "pmiHistory",
  "eightWeekInspectionHistory",
  "lastBrakeTest",
  "brakeTestHistory",
  "lastTacho",
  "tachoInspectionHistory",
  "lastTachoDownload",
  "tachoDownloadHistory",
  "lastTailLift",
  "tailLiftHistory",
  "lastLoler",
  "lolerHistory",
  "pendingReturnInspection",
]);

const PROTECTED_FIELDS = new Set(VEHICLE_EDITOR_PROTECTED_MAINTENANCE_FIELDS);

const valuesMatch = (left, right) => {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

export function buildVehicleEditorUpdatePatch(current = {}, baseline = {}) {
  return Object.fromEntries(
    Object.entries(current).filter(([field, value]) => {
      if (field === "id" || PROTECTED_FIELDS.has(field) || value === undefined) return false;
      return !valuesMatch(value, baseline?.[field]);
    })
  );
}

export function getChangedProtectedVehicleFields(current = {}, baseline = {}) {
  return VEHICLE_EDITOR_PROTECTED_MAINTENANCE_FIELDS.filter(
    (field) => !valuesMatch(current?.[field], baseline?.[field])
  );
}

export function restoreProtectedVehicleFields(current = {}, baseline = {}) {
  const restored = { ...current };
  for (const field of VEHICLE_EDITOR_PROTECTED_MAINTENANCE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(baseline, field)) {
      restored[field] = baseline[field];
    } else {
      delete restored[field];
    }
  }
  return restored;
}
