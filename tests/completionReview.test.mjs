import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPLETION_REVIEW_DESTINATION_STATUS,
  buildCompletionReviewModel,
  buildCompletionReviewPatch,
  timesheetLinksToJob,
  validateCompletionReview,
  validateOperationalCompletionReview,
} from "../src/app/utils/completionReview.js";

test("the finance handoff destination is Ready to Invoice", () => {
  assert.equal(COMPLETION_REVIEW_DESTINATION_STATUS, "Ready to Invoice");
});

const job = {
  acceptedQuoteNumber: "Q100-002",
  employees: [{ id: "crew-a", name: "Alex" }, { id: "crew-b", name: "Ben" }],
  vehicles: [
    { id: "van", name: "Transport Van", registration: "AB12 CDE" },
    { id: "twizy", name: "Twizy", registration: "EV01 CAR" },
  ],
};

test("completion review model safely handles a missing job", () => {
  const emptyModel = {
    crew: [],
    vehicles: [],
    quoteNumber: "",
    selectedCrewKeys: [],
    selectedVehicleKeys: [],
    vehicleCrewAssignments: {},
    quoteCoverageConfirmed: false,
    quoteNotRequired: false,
  };

  assert.deepEqual(buildCompletionReviewModel(), emptyModel);
  assert.deepEqual(buildCompletionReviewModel(null), emptyModel);
});

test("one accepted quote can cover several vehicles assigned to different crew", () => {
  const model = buildCompletionReviewModel(job);
  const form = {
    selectedCrewKeys: ["crew-a", "crew-b"],
    selectedVehicleKeys: ["van", "twizy"],
    vehicleCrewAssignments: { van: "crew-a", twizy: "crew-b" },
    quoteCoverageConfirmed: true,
  };
  const fields = {
    generalNotes: "Completed as booked",
    po: "PO-100",
    invoiceContactName: "Accounts",
    invoiceContactEmail: "accounts@example.com",
    invoiceContactPhone: "",
  };

  assert.deepEqual(validateCompletionReview({ fields, model, form }), []);
  const patch = buildCompletionReviewPatch({ job, fields, model, form, completedAt: "2026-08-23T16:00:00.000Z" });
  assert.deepEqual(patch.quoteVehicleIds, ["van", "twizy"]);
  assert.equal(patch.quoteVehicleCoverage.quoteNumber, "Q100-002");
  assert.deepEqual(
    patch.vehicleCrewAssignments.map(({ vehicleKey, crewKey }) => ({ vehicleKey, crewKey })),
    [{ vehicleKey: "van", crewKey: "crew-a" }, { vehicleKey: "twizy", crewKey: "crew-b" }]
  );
});

test("vehicle IDs display as fleet names from the shared lookup", () => {
  const model = buildCompletionReviewModel(
    { employees: [{ id: "crew-a", name: "Alex" }], vehicles: ["vehicle-doc-id"] },
    {
      byId: {
        "vehicle-doc-id": {
          id: "vehicle-doc-id",
          name: "Transport Van",
          registration: "AB12 CDE",
        },
      },
      byReg: {},
      byName: {},
    }
  );

  assert.equal(model.vehicles[0].key, "vehicle-doc-id");
  assert.equal(model.vehicles[0].label, "Transport Van (AB12 CDE)");
});

test("crew and vehicles are optional when they are not on the booking", () => {
  const emptyResourceJob = { acceptedQuoteNumber: "Q200-001", employees: [], vehicles: [] };
  const model = buildCompletionReviewModel(emptyResourceJob);
  const errors = validateCompletionReview({
    fields: {
      generalNotes: "Completed without allocated resources",
      po: "PO-200",
      invoiceContactName: "Accounts",
      invoiceContactEmail: "accounts@example.com",
    },
    model,
    form: {
      selectedCrewKeys: [],
      selectedVehicleKeys: [],
      vehicleCrewAssignments: {},
      quoteCoverageConfirmed: false,
    },
  });

  assert.deepEqual(errors, []);
});

test("operational completion does not require finance or quote details", () => {
  const model = buildCompletionReviewModel(job);
  const errors = validateOperationalCompletionReview({
    fields: { generalNotes: "Job completed as booked" },
    model,
    form: {
      selectedCrewKeys: ["crew-a", "crew-b"],
      selectedVehicleKeys: ["van", "twizy"],
      vehicleCrewAssignments: {},
      quoteCoverageConfirmed: false,
    },
  });

  assert.deepEqual(errors, []);
});

test("operational completion allows an empty review form", () => {
  assert.deepEqual(
    validateOperationalCompletionReview({ fields: {}, model: {}, form: {} }),
    []
  );
});

test("an explicit no-quote confirmation allows completion and is recorded", () => {
  const noQuoteJob = { employees: [], vehicles: [] };
  const model = buildCompletionReviewModel(noQuoteJob);
  const fields = {
    generalNotes: "Completed without a quote",
    po: "PO-202",
    invoiceContactName: "Accounts",
    invoiceContactEmail: "accounts@example.com",
  };
  const form = {
    selectedCrewKeys: [],
    selectedVehicleKeys: [],
    vehicleCrewAssignments: {},
    quoteCoverageConfirmed: false,
    quoteNotRequired: true,
  };

  assert.deepEqual(validateCompletionReview({ fields, model, form }), []);
  const patch = buildCompletionReviewPatch({
    job: noQuoteJob,
    fields,
    model,
    form,
    completedAt: "2026-08-24T08:45:00.000Z",
  });
  assert.equal(patch.quoteNotRequired, true);
  assert.deepEqual(patch.quoteRequirement, {
    notRequired: true,
    confirmedAt: "2026-08-24T08:45:00.000Z",
  });
  assert.equal(patch.quoteVehicleCoverage.confirmed, false);
});

test("a booked vehicle does not require a crew assignment when no crew is booked", () => {
  const vehicleOnlyJob = {
    acceptedQuoteNumber: "Q201-001",
    employees: [],
    vehicles: [{ id: "van", name: "Transport Van" }],
  };
  const model = buildCompletionReviewModel(vehicleOnlyJob);
  const errors = validateCompletionReview({
    fields: {
      generalNotes: "Vehicle supplied without crew",
      po: "PO-201",
      invoiceContactName: "Accounts",
      invoiceContactEmail: "accounts@example.com",
    },
    model,
    form: {
      selectedCrewKeys: [],
      selectedVehicleKeys: ["van"],
      vehicleCrewAssignments: {},
      quoteCoverageConfirmed: true,
    },
  });

  assert.deepEqual(errors, []);
});

test("completion assigns an unassigned vehicle to all selected crew while still checking finance details", () => {
  const model = buildCompletionReviewModel(job);
  const form = {
    selectedCrewKeys: ["crew-a", "crew-b"],
    selectedVehicleKeys: ["van", "twizy"],
    vehicleCrewAssignments: { van: "crew-a" },
    quoteCoverageConfirmed: false,
  };
  const errors = validateCompletionReview({
    fields: { generalNotes: "", po: "", invoiceContactName: "", invoiceContactEmail: "bad" },
    model,
    form,
  });
  assert.equal(errors.some((error) => error.includes("Twizy")), false);
  assert.ok(errors.includes("Confirm the accepted quote covers the selected vehicles"));
  assert.ok(errors.includes("Enter a valid finance contact email"));

  const patch = buildCompletionReviewPatch({
    job,
    fields: {
      generalNotes: "Completed",
      po: "PO-300",
      invoiceContactName: "Accounts",
      invoiceContactEmail: "accounts@example.com",
    },
    model,
    form: { ...form, quoteCoverageConfirmed: true },
  });
  assert.deepEqual(
    patch.vehicleCrewAssignments
      .filter(({ vehicleKey }) => vehicleKey === "twizy")
      .map(({ crewKey }) => crewKey),
    ["crew-a", "crew-b"]
  );
});

test("timesheet linkage recognises direct, snapshot and day booking references", () => {
  assert.equal(timesheetLinksToJob({ jobId: "job-1" }, "job-1"), true);
  assert.equal(timesheetLinksToJob({ jobSnapshot: { bookingIds: ["job-1"] } }, "job-1"), true);
  assert.equal(timesheetLinksToJob({ days: { Monday: { bookingId: "job-1" } } }, "job-1"), true);
  assert.equal(timesheetLinksToJob({ jobId: "job-2" }, "job-1"), false);
});
