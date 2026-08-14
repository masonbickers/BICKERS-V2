import assert from "node:assert/strict";
import test from "node:test";

import {
  flattenFirestoreArrayValues,
} from "../src/app/utils/firestoreValueEncoding.js";

test("Firestore array encoding flattens legacy nested document lists", () => {
  const pmiDocument = { id: "pmi-document", url: "https://files.example/pmi.pdf" };
  const brakeDocument = { id: "brake-document", url: "https://files.example/brake.pdf" };

  assert.deepEqual(
    flattenFirestoreArrayValues([[pmiDocument], [], [[[brakeDocument]]]]),
    [pmiDocument, brakeDocument]
  );
});

test("Firestore array encoding preserves maps containing their own arrays", () => {
  const item = {
    maintenanceTypeId: "pmi",
    documents: [{ id: "pmi-document" }],
  };

  assert.deepEqual(flattenFirestoreArrayValues([item]), [item]);
});
