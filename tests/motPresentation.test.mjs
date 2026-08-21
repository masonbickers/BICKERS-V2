import assert from "node:assert/strict";
import test from "node:test";

import {
  MOT_WARNING_DAYS,
  getMotDuePresentation,
} from "../src/app/utils/motPresentation.js";

test("MOT presentation uses the configured three-week warning window", () => {
  assert.equal(MOT_WARNING_DAYS, 21);
  assert.equal(
    getMotDuePresentation(
      { nextMOT: "2026-09-10" },
      { referenceDate: new Date(2026, 7, 20) }
    ).status,
    "soon"
  );
});

test("MOT exemptions remain not applicable even if a due requirement is supplied", () => {
  const result = getMotDuePresentation(
    { motNotApplicable: true },
    { dueDate: "2026-08-01", referenceDate: new Date(2026, 7, 20) }
  );

  assert.equal(result.status, "not-applicable");
  assert.equal(result.dateDisplay, "N/A");
});

test("awaiting DVSA is an explicit state and does not expose the previous expiry", () => {
  const result = getMotDuePresentation({
    nextMOT: "2026-08-01",
    motAwaitingDvsaConfirmation: true,
  });

  assert.equal(result.status, "awaiting-dvsa");
  assert.equal(result.dateDisplay, "Awaiting DVSA confirmation");
  assert.equal(result.dueDate, null);
});
