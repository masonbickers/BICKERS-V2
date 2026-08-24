// src/app/utils/maintenanceWorkflowSpec.js
// Central workflow contract for maintenance job cards.
// This file is intentionally implementation-friendly so UI and write guards
// can share the same transition and required-field rules.

export const MAINTENANCE_WORKFLOW_VERSION = "v2";

export const MAINTENANCE_JOB_WORKFLOW_STAGES = [
  "planned",
  "booked",
  "in_progress",
  "completed",
  "ready_to_invoice",
  "closed",
];

export const MAINTENANCE_STAGE_LABELS = {
  planned: "Planned",
  booked: "Booked",
  in_progress: "In Progress",
  completed: "Completed",
  ready_to_invoice: "Ready to Invoice",
  closed: "Closed",
};

// Allowed forward transitions for the strict flow.
export const MAINTENANCE_ALLOWED_TRANSITIONS = {
  planned: ["booked"],
  booked: ["in_progress"],
  in_progress: ["completed"],
  completed: ["ready_to_invoice"],
  ready_to_invoice: ["closed"],
  closed: [],
};

// Optional step-back transitions for corrections (keep narrow).
export const MAINTENANCE_REVERSIBLE_TRANSITIONS = {
  booked: ["planned"],
  in_progress: ["booked"],
  completed: ["in_progress"],
  ready_to_invoice: ["completed"],
};

// Field contract for maintenanceJobs documents.
// These are the stable fields each doc should carry.
export const MAINTENANCE_JOB_FIELD_CONTRACT = {
  core: [
    "assetId",
    "assetLabel",
    "type",
    "title",
    "status",
    "priority",
    "notes",
  ],
  schedule: [
    "dueDate",
    "plannedDate",
    "bookedDate",
    "startedAt",
    "completedAt",
    "closedAt",
  ],
  ownership: [
    "assignedToUid",
    "assignedToName",
    "provider",
    "workshopLocation",
  ],
  financials: [
    "estimateParts",
    "estimateLabour",
    "actualParts",
    "actualLabour",
    "externalInvoice",
    "totalCost",
    "poNumber",
    "invoiceRef",
    "invoiceStatus",
  ],
  source: [
    "sourceType", // mot_due | service_due | inspection_due | manual
    "sourceDueKey",
    "autoCreated",
  ],
  audit: [
    "createdAt",
    "updatedAt",
    "createdBy",
    "updatedBy",
    "history",
  ],
};

// Required fields by stage.
export const MAINTENANCE_REQUIRED_FIELDS_BY_STAGE = {
  planned: ["assetId", "assetLabel", "type", "title", "status"],
  booked: ["assetId", "assetLabel", "type", "title", "status", "provider", "bookedDate"],
  in_progress: [
    "assetId",
    "assetLabel",
    "type",
    "title",
    "status",
    "provider",
    "bookedDate",
    "assignedToName",
    "startedAt",
  ],
  completed: [
    "assetId",
    "assetLabel",
    "type",
    "title",
    "status",
    "provider",
    "bookedDate",
    "assignedToName",
    "startedAt",
    "completedAt",
    "completionNotes",
  ],
  ready_to_invoice: [
    "assetId",
    "assetLabel",
    "type",
    "title",
    "status",
    "provider",
    "bookedDate",
    "assignedToName",
    "startedAt",
    "completedAt",
    "completionNotes",
    "totalCost",
    "poNumber",
  ],
  closed: [
    "assetId",
    "assetLabel",
    "type",
    "title",
    "status",
    "provider",
    "bookedDate",
    "assignedToName",
    "startedAt",
    "completedAt",
    "completionNotes",
    "totalCost",
    "poNumber",
    "invoiceRef",
    "closedAt",
  ],
};

export const normalizeMaintenanceStage = (value) => {
  const stage = String(value || "").trim().toLowerCase();
  return MAINTENANCE_JOB_WORKFLOW_STAGES.includes(stage) ? stage : "planned";
};

export const canTransitionMaintenanceStage = (from, to, { allowReverse = false } = {}) => {
  const source = normalizeMaintenanceStage(from);
  const target = normalizeMaintenanceStage(to);
  if (source === target) return true;

  const forward = MAINTENANCE_ALLOWED_TRANSITIONS[source] || [];
  if (forward.includes(target)) return true;

  if (!allowReverse) return false;
  const reverse = MAINTENANCE_REVERSIBLE_TRANSITIONS[source] || [];
  return reverse.includes(target);
};

const valuePresent = (value) => {
  if (value === null || typeof value === "undefined") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
};

export const getMissingMaintenanceFieldsForStage = (record, stage) => {
  const normalizedStage = normalizeMaintenanceStage(stage);
  const required = MAINTENANCE_REQUIRED_FIELDS_BY_STAGE[normalizedStage] || [];
  const source = record || {};

  return required.filter((field) => !valuePresent(source[field]));
};

export const validateMaintenanceStageRequirements = (record, stage) => {
  const missing = getMissingMaintenanceFieldsForStage(record, stage);
  return {
    ok: missing.length === 0,
    missing,
    stage: normalizeMaintenanceStage(stage),
  };
};

// Future-facing helper for auto-generated jobs from due dates.
export const buildMaintenanceSourceDueKey = ({ assetId = "", sourceType = "", dueDate = "" }) => {
  const cleanAsset = String(assetId || "").trim();
  const cleanType = String(sourceType || "").trim().toLowerCase();
  const cleanDate = String(dueDate || "").trim();
  if (!cleanAsset || !cleanType || !cleanDate) return "";
  return `${cleanType}__${cleanAsset}__${cleanDate}`;
};

