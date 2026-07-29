import assert from "node:assert/strict";
import test from "node:test";

import {
  countUniqueVehiclesByDeadlineState,
  getRegisterComplianceState,
  isRetentionPlateRecord,
} from "../src/app/utils/vehicleRegisterPresentation.js";

test("retained number plates are not classified as vehicles needing MOT or service", () => {
  const plate = {
    category: "Number Plates On Retention",
    retentionExpiry: "2027-03-01",
  };

  assert.equal(isRetentionPlateRecord(plate), true);
  assert.equal(getRegisterComplianceState(plate, "mot").status, "not-applicable");
  assert.equal(getRegisterComplianceState(plate, "service").status, "not-applicable");
});

test("explicit MOT and service exemptions display as not applicable", () => {
  assert.equal(
    getRegisterComplianceState({ motNotApplicable: true }, "mot").status,
    "not-applicable"
  );
  assert.equal(
    getRegisterComplianceState({ serviceApplicable: false }, "service").status,
    "not-applicable"
  );
});

test("blank applicable compliance dates are reported as missing", () => {
  assert.equal(getRegisterComplianceState({}, "mot").status, "missing");
  assert.equal(getRegisterComplianceState({}, "service").status, "missing");
});

test("recorded compliance dates remain dated", () => {
  assert.deepEqual(
    getRegisterComplianceState({ nextMOT: "2027-03-20" }, "mot"),
    { status: "dated", value: "2027-03-20", reason: "" }
  );
});

test("deadline totals count each vehicle once instead of each deadline", () => {
  const counts = countUniqueVehiclesByDeadlineState(
    [
      {
        deadlines: [
          { value: "2026-08-01", warningDays: 21 },
          { value: "2026-08-02", warningDays: 21 },
          { value: "2026-07-27", warningDays: 21 },
        ],
      },
      {
        deadlines: [
          { value: "2026-08-03", warningDays: 21 },
          { value: "2026-08-04", warningDays: 21 },
        ],
      },
    ],
    new Date(2026, 6, 28)
  );

  assert.deepEqual(counts, { overdue: 1, soon: 2 });
});
