import test from "node:test";
import assert from "node:assert/strict";

import { normaliseEmployeeCreditIdentity } from "../src/app/utils/employeeCreditIdentity.js";

test("Tobias Oxley credits resolve to the Toby Oxley personnel identity", () => {
  assert.equal(normaliseEmployeeCreditIdentity("Toby Oxley"), "toby oxley");
  assert.equal(normaliseEmployeeCreditIdentity("  TOBIAS   OXLEY "), "toby oxley");
});

test("unrelated employee names retain their normalised identity", () => {
  assert.equal(normaliseEmployeeCreditIdentity(" Max   Bickers "), "max bickers");
});
