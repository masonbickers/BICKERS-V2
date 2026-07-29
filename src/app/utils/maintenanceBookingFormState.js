export const EMPTY_EQUIPMENT_SELECTION = Object.freeze([]);

export const normalizeEquipmentSelection = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

export const equipmentSelectionKey = (value) =>
  JSON.stringify(normalizeEquipmentSelection(value));

export const equipmentSelectionsEqual = (left, right) =>
  equipmentSelectionKey(left) === equipmentSelectionKey(right);
