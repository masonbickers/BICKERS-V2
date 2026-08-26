import test from "node:test";
import assert from "node:assert/strict";

import {
  FIXED_JOB_STATUS_SURFACE_STYLES,
  FIXED_JOB_STATUS_STYLES,
  SEMANTIC_STATUS_SURFACE_STYLES,
  SEMANTIC_STATUS_STYLES,
  getFixedJobStatusStyle,
  getFixedJobStatusSurfaceStyle,
  getSemanticStatusStyle,
  getSemanticStatusSurfaceStyle,
  getSemanticStatusTone,
} from "../src/app/utils/jobStatusColors.js";

test("booking statuses retain the dedicated live diary palette", () => {
  assert.equal(FIXED_JOB_STATUS_STYLES.Confirmed.bg, "var(--job-status-confirmed)");
  assert.equal(FIXED_JOB_STATUS_STYLES.Complete.bg, "var(--job-status-complete)");
  assert.equal(FIXED_JOB_STATUS_STYLES["First Pencil"].bg, "var(--job-status-first-pencil)");
  assert.equal(FIXED_JOB_STATUS_STYLES["Second Pencil"].bg, "var(--job-status-second-pencil)");
  assert.equal(FIXED_JOB_STATUS_STYLES.Maintenance.bg, "var(--job-status-maintenance)");
  assert.equal(FIXED_JOB_STATUS_STYLES.Deleted.bg, "var(--job-status-deleted)");
  assert.equal(getFixedJobStatusStyle("confirmed"), FIXED_JOB_STATUS_STYLES.Confirmed);
  assert.equal(getFixedJobStatusStyle("completed"), FIXED_JOB_STATUS_STYLES.Complete);
  assert.equal(getFixedJobStatusStyle("second pencil"), FIXED_JOB_STATUS_STYLES["Second Pencil"]);
});

test("large booking surfaces preserve vivid rails and expose dark-mode-aware fills", () => {
  assert.deepEqual(Object.keys(FIXED_JOB_STATUS_SURFACE_STYLES), Object.keys(FIXED_JOB_STATUS_STYLES));
  assert.deepEqual(getFixedJobStatusSurfaceStyle("confirmed"), {
    bg: "var(--job-status-confirmed-surface)",
    text: "var(--job-status-large-text, var(--job-status-text-dark))",
    border: "var(--job-status-confirmed)",
  });
  assert.deepEqual(getFixedJobStatusSurfaceStyle("second pencil"), {
    bg: "var(--job-status-second-pencil-surface)",
    text: "var(--job-status-large-text, var(--job-status-text-light))",
    border: "var(--job-status-second-pencil)",
  });
  assert.equal(getFixedJobStatusStyle("confirmed").bg, "var(--job-status-confirmed)");
});

test("semantic status aliases resolve consistently across workflows", () => {
  assert.equal(getSemanticStatusTone("conflict"), "red");
  assert.equal(getSemanticStatusTone("compliance overdue"), "orange");
  assert.equal(getSemanticStatusTone("completed"), "green");
  assert.equal(getSemanticStatusTone("invoiced"), "blue");
  assert.equal(getSemanticStatusTone("postponed"), "grey");
  assert.equal(getSemanticStatusStyle("action_required"), SEMANTIC_STATUS_STYLES.orange);
  assert.equal(getSemanticStatusSurfaceStyle("action_required"), SEMANTIC_STATUS_SURFACE_STYLES.orange);
  assert.equal(getFixedJobStatusSurfaceStyle("workshop"), SEMANTIC_STATUS_SURFACE_STYLES.grey);
});
