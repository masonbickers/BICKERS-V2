import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildVehicleEditorUpdatePatch,
  getChangedProtectedVehicleFields,
  mergeServerManagedVehicleFields,
  restoreProtectedVehicleFields,
  VEHICLE_EDITOR_PROTECTED_MAINTENANCE_FIELDS,
} from "../src/app/utils/vehicleEditorSave.js";

test("vehicle editor saves ordinary changes without protected maintenance evidence", () => {
  const baseline = {
    id: "vehicle-1",
    name: "Mobile Workshop",
    notes: "",
    lastService: "2025-12-31",
    serviceHistory: [],
    lastPMI: "2026-06-01",
  };
  const current = {
    ...baseline,
    name: "Mobile Workshop 01",
    notes: "Driver side locker repaired",
    lastService: "2026-07-31",
    serviceHistory: [{ completedDate: "2026-07-31" }],
    lastPMI: "2026-07-27",
  };

  assert.deepEqual(buildVehicleEditorUpdatePatch(current, baseline), {
    name: "Mobile Workshop 01",
    notes: "Driver side locker repaired",
  });
  assert.deepEqual(getChangedProtectedVehicleFields(current, baseline), [
    "lastService",
    "serviceHistory",
    "lastPMI",
  ]);
});

test("vehicle editor does not write protected aliases synthesized for legacy records", () => {
  const baseline = {
    id: "vehicle-1",
    registration: "YX65 BMV",
    lastMOT: "2025-11-05",
    lastService: "2025-12-31",
  };
  const normalized = {
    ...baseline,
    registration: "YX65 BMV",
    lastMot: "2025-11-05",
    serviceHistory: [{ completedDate: "2025-12-31", recordedAt: "2026-08-07T15:00:00.000Z" }],
  };

  assert.deepEqual(buildVehicleEditorUpdatePatch(normalized, baseline), {});
});

test("restoring protected fields keeps the saved client snapshot aligned with Firestore", () => {
  const baseline = { lastService: "2025-12-31", serviceHistory: [] };
  const payload = {
    name: "Mobile Workshop 01",
    lastService: "2026-07-31",
    serviceHistory: [{ completedDate: "2026-07-31" }],
    lastPmi: "2026-07-27",
  };

  assert.deepEqual(restoreProtectedVehicleFields(payload, baseline), {
    name: "Mobile Workshop 01",
    lastService: "2025-12-31",
    serviceHistory: [],
  });
});

test("server-managed DVSA fields advance the editor baseline without losing unsaved details", () => {
  const baseline = {
    id: "vehicle-1",
    notes: "",
    lastMOT: "2025-07-01",
    nextMOT: "2026-06-30",
  };
  const current = { ...baseline, notes: "Keep this unsaved note" };
  const serverVehicle = {
    id: "vehicle-1",
    notes: "",
    lastMOT: "2026-07-03",
    nextMOT: "2027-07-02",
    motHistorySyncedAt: "2026-08-19T13:39:00.000Z",
  };

  const merged = mergeServerManagedVehicleFields(
    current,
    baseline,
    serverVehicle,
    ["lastMOT", "nextMOT", "motHistorySyncedAt"]
  );

  assert.equal(merged.current.notes, "Keep this unsaved note");
  assert.equal(merged.current.lastMOT, "2026-07-03");
  assert.equal(merged.baseline.notes, "");
  assert.equal(merged.baseline.lastMOT, "2026-07-03");
  assert.deepEqual(getChangedProtectedVehicleFields(merged.current, merged.baseline), []);
  assert.deepEqual(buildVehicleEditorUpdatePatch(merged.current, merged.baseline), {
    notes: "Keep this unsaved note",
  });
});

test("protected vehicle editor fields remain aligned with Firestore rules", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  const protectedRule = rules.match(
    /function legalMaintenanceCompletionFieldsUnchanged\(\)\s*\{[\s\S]*?hasAny\(\[([\s\S]*?)\]\);\s*\}/
  );
  assert.ok(protectedRule, "legal maintenance field rule was not found");
  const fieldsInRules = [...protectedRule[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(VEHICLE_EDITOR_PROTECTED_MAINTENANCE_FIELDS, fieldsInRules);
});
