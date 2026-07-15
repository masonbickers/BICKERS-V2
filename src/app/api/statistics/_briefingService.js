import crypto from "node:crypto";
import OpenAI from "openai";
import {
  adminListDocuments,
  adminPatchDocument,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import {
  buildDeterministicSectionContent,
  buildStatisticsInsightSnapshot,
  formatStatisticsEvidence,
  redactSnapshotForVariant,
} from "@/app/utils/statisticsInsightSnapshot";
import { londonClock } from "@/app/utils/londonTime";

const MODEL = process.env.OPENAI_STATISTICS_MODEL || "gpt-4o-mini";
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export const BRIEFING_ACTIONS = Object.freeze({
  statistics: { label: "Review statistics", href: "/statistics" },
  bookings: { label: "Review bookings", href: "/bookings" },
  finance_queue: { label: "Open finance queue", href: "/finance-queue", managementOnly: true },
  ready_invoice: { label: "Review ready-to-invoice jobs", href: "/ready-invoice", managementOnly: true },
  invoiced: { label: "Review invoiced jobs", href: "/invoiced", managementOnly: true },
});

const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clean = (value, max = 500) => String(value || "").trim().slice(0, max);

const formatEvidence = formatStatisticsEvidence;

const attachSectionEvidence = (snapshot, variant, inputSections) => {
  const catalog = new Map((snapshot.evidenceCatalog || []).map((item) => [item.id, item]));
  return Object.fromEntries(Object.entries(inputSections || {})
    .filter(([key]) => variant === "management" || key !== "financeQuality")
    .map(([key, section]) => [key, {
      ...section,
      evidence: (section.evidenceIds || []).map((id) => ({ ...catalog.get(id), text: formatEvidence(catalog.get(id)) })),
      action: BRIEFING_ACTIONS[section.actionKey || "statistics"],
      mode: "daily",
    }]));
};

function deterministicBriefing(snapshot, variant, reason = "") {
  const evidence = new Map((snapshot.evidenceCatalog || []).map((item) => [item.id, item]));
  const insights = [];
  const add = (input) => {
    if (insights.length >= 5 || !input.evidenceIds?.every((id) => evidence.has(id))) return;
    insights.push({
      id: input.id,
      title: input.title,
      type: input.type || "decision",
      severity: input.severity || "neutral",
      whyItMatters: input.whyItMatters,
      evidenceIds: input.evidenceIds,
      evidence: input.evidenceIds.map((id) => ({ ...evidence.get(id), text: formatEvidence(evidence.get(id)) })),
      confidence: input.confidence || "high",
      caveat: input.caveat || "",
      action: BRIEFING_ACTIONS[input.actionKey || "statistics"],
    });
  };

  if (snapshot.changes.bookingsPercent !== null) {
    add({
      id: "booking_movement",
      title: `${snapshot.changes.bookingsPercent >= 0 ? "Bookings increased" : "Bookings decreased"} versus the previous 30 days`,
      type: snapshot.changes.bookingsPercent >= 0 ? "opportunity" : "risk",
      severity: Math.abs(snapshot.changes.bookingsPercent) >= 20 ? "medium" : "neutral",
      whyItMatters: "This is the clearest short-term signal of whether scheduled work is strengthening or weakening.",
      evidenceIds: ["bookings_30d", "booking_days_30d"],
      caveat: "This comparison shows movement, not its cause.",
      actionKey: "statistics",
    });
  }
  add({
    id: "forward_pipeline",
    title: `${snapshot.pipeline.next30Days} booking${snapshot.pipeline.next30Days === 1 ? "" : "s"} scheduled in the next 30 days`,
    type: "decision",
    severity: "neutral",
    whyItMatters: "The forward diary helps management judge near-term workload and whether pipeline follow-up is needed.",
    evidenceIds: ["pipeline_30d"],
    actionKey: "bookings",
  });
  add({
    id: "client_mix",
    title: snapshot.clients.top.client ? `${snapshot.clients.top.client} is the largest recent client` : "No dominant recent client",
    type: snapshot.clients.top.percent >= 35 ? "risk" : "decision",
    severity: snapshot.clients.top.percent >= 35 ? "medium" : "neutral",
    whyItMatters: "High client concentration can make the forward workload more dependent on one production relationship.",
    evidenceIds: ["client_concentration"],
    caveat: "Booking share is not the same as revenue or margin share.",
    actionKey: "statistics",
  });
  if (variant === "management" && snapshot.finance?.unpaidJobs > 0) {
    add({
      id: "unpaid_work",
      title: `${snapshot.finance.unpaidJobs} invoiced job${snapshot.finance.unpaidJobs === 1 ? " is" : "s are"} not recorded as paid`,
      type: "risk",
      severity: snapshot.finance.staleInvoiceJobs > 0 ? "high" : "medium",
      whyItMatters: "Completed work only becomes cash when invoicing and payment stages are followed through.",
      evidenceIds: ["unpaid_value", "stale_invoices", "invoice_coverage"],
      caveat: "The monetary total includes only jobs with a reliable invoice value.",
      actionKey: "invoiced",
    });
  }
  add({
    id: "data_readiness",
    title: `${snapshot.dataQuality.rate}% of recent bookings have core reporting fields`,
    type: snapshot.dataQuality.rate < 90 ? "data_quality" : "decision",
    severity: snapshot.dataQuality.rate < 90 ? "medium" : "neutral",
    whyItMatters: "Management decisions are only as reliable as the dates, statuses and job references behind them.",
    evidenceIds: ["data_quality"],
    caveat: "This checks core reporting fields, not every operational completion requirement.",
    actionKey: "statistics",
  });

  return {
    headline: variant === "management" ? "Today’s management view of Bickers performance" : "Today’s booking and pipeline view",
    summary: `A deterministic briefing was prepared from verified booking metrics${reason ? ` because ${reason}` : ""}. Review the evidence on each card before acting.`,
    insights,
    sections: attachSectionEvidence(snapshot, variant, buildDeterministicSectionContent(snapshot, variant)),
  };
}

const sectionKeysFor = (variant) => variant === "management"
  ? ["overview", "trends", "resources", "financeQuality"]
  : ["overview", "trends", "resources"];

const validateSectionNumbers = (summary, evidence) => {
  const allowed = new Set(JSON.stringify(evidence).match(/-?\d+(?:\.\d+)?/g) || []);
  const used = String(summary || "").match(/-?\d+(?:\.\d+)?/g) || [];
  if (used.some((number) => !allowed.has(number))) throw new Error("Section analysis contains a figure not present in its evidence.");
};

const validateAiSections = (value, snapshot, variant) => {
  const catalog = new Map((snapshot.evidenceCatalog || []).map((item) => [item.id, item]));
  const requiredKeys = sectionKeysFor(variant);
  if (!value || typeof value !== "object" || requiredKeys.some((key) => !value[key])) throw new Error("AI section analysis is incomplete.");
  return Object.fromEntries(requiredKeys.map((key) => {
    const item = value[key];
    const summary = clean(item.summary, 700);
    const evidenceIds = Array.isArray(item.evidenceIds) ? [...new Set(item.evidenceIds.map(String))].slice(0, 3) : [];
    if (!summary || !evidenceIds.length || evidenceIds.some((id) => !catalog.has(id) || catalog.get(id).section !== key)) {
      throw new Error(`AI section ${key} contains unsupported evidence.`);
    }
    if (/\b(caused|because of|led to|resulted in|driven by)\b/i.test(summary)) throw new Error(`AI section ${key} contains an unsupported causal claim.`);
    const actionKey = String(item.actionKey || "statistics");
    const action = BRIEFING_ACTIONS[actionKey];
    if (!action || (variant !== "management" && action.managementOnly)) throw new Error(`AI section ${key} contains an unsupported action.`);
    const evidence = evidenceIds.map((id) => ({ ...catalog.get(id), text: formatEvidence(catalog.get(id)) }));
    validateSectionNumbers(summary, evidence);
    return [key, {
      summary,
      evidenceIds,
      evidence,
      confidence: ["low", "medium", "high"].includes(item.confidence) ? item.confidence : "medium",
      caveat: clean(item.caveat, 300),
      action,
      mode: "daily",
    }];
  }));
};

function validateAiBriefing(value, snapshot, variant) {
  if (!value || typeof value !== "object") throw new Error("AI briefing was not an object.");
  const catalog = new Map((snapshot.evidenceCatalog || []).map((item) => [item.id, item]));
  if (!Array.isArray(value.insights) || value.insights.length < 1 || value.insights.length > 5) throw new Error("AI briefing must contain one to five insights.");
  const insights = value.insights.map((item, index) => {
    const evidenceIds = Array.isArray(item.evidenceIds) ? [...new Set(item.evidenceIds.map(String))] : [];
    if (!evidenceIds.length || evidenceIds.some((id) => !catalog.has(id))) throw new Error(`Insight ${index + 1} contains unsupported evidence.`);
    const actionKey = String(item.actionKey || "statistics");
    const action = BRIEFING_ACTIONS[actionKey];
    if (!action || (variant !== "management" && action.managementOnly)) throw new Error(`Insight ${index + 1} contains an unsupported action.`);
    return {
      id: clean(item.id || `insight_${index + 1}`, 80),
      title: clean(item.title, 160),
      type: ["decision", "opportunity", "risk", "data_quality"].includes(item.type) ? item.type : "decision",
      severity: ["neutral", "medium", "high"].includes(item.severity) ? item.severity : "neutral",
      whyItMatters: clean(item.whyItMatters, 400),
      evidenceIds,
      evidence: evidenceIds.map((id) => ({ ...catalog.get(id), text: formatEvidence(catalog.get(id)) })),
      confidence: ["low", "medium", "high"].includes(item.confidence) ? item.confidence : "medium",
      caveat: clean(item.caveat, 300),
      action,
    };
  });
  if (insights.some((item) => !item.title || !item.whyItMatters)) throw new Error("AI briefing contains an incomplete insight.");
  return { headline: clean(value.headline, 180), summary: clean(value.summary, 600), insights, sections: validateAiSections(value.sections, snapshot, variant) };
}

async function generateWithAi(snapshot, rules, variant) {
  if (!openai) throw new Error("the OpenAI API key is not configured");
  const allowedActions = Object.entries(BRIEFING_ACTIONS)
    .filter(([, action]) => variant === "management" || !action.managementOnly)
    .map(([key]) => key);
  const rulesContext = {
    businessProfile: rules.businessProfile,
    services: rules.services,
    lifecycle: rules.lifecycle,
    glossary: rules.glossary,
    completionCriteria: rules.completionCriteria,
    metricDefinitions: rules.metricDefinitions,
    thresholds: rules.thresholds,
    recommendationGuidance: rules.recommendationGuidance,
    prohibitedAssumptions: rules.prohibitedAssumptions,
  };
  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You prepare a short daily decision briefing for Bickers Action.",
          "Use only the supplied aggregated snapshot and approved operating rules.",
          "Never calculate new figures, infer missing values, claim causation, judge employees, or propose record changes.",
          "Every insight must cite one or more exact evidenceIds from the catalog.",
          "Also return a sections object. Required keys are overview, trends and resources; management also requires financeQuality.",
          "Each section requires summary, 1-3 evidenceIds belonging to that section, confidence, caveat and actionKey. Use only exact figures already present in the cited evidence and do not claim causation.",
          "Do not interpret comparisons, conversion or concentration as a conclusion when the cited evidence confidence is low or its sample is below the approved minimum.",
          `Return JSON only with headline, summary, 1-5 insights and sections. Each insight requires id, title, type (decision|opportunity|risk|data_quality), severity (neutral|medium|high), whyItMatters, evidenceIds, confidence (low|medium|high), caveat and actionKey. Allowed actionKey values: ${allowedActions.join(", ")}.`,
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify({ audience: variant, approvedOperatingRules: rulesContext, statisticsSnapshot: snapshot }) },
    ],
  });
  const content = response.choices?.[0]?.message?.content || "";
  return validateAiBriefing(JSON.parse(content), snapshot, variant);
}

export async function generateDailyBriefings({ companyId = "bickers-action", now = new Date(), force = false } = {}) {
  const clock = londonClock(now);
  const published = await adminReadDocument("aiBusinessRules", `${companyId}_published`);
  if (!published?.rules || !published?.version) return { skipped: true, reason: "Business rules must be reviewed and published first." };

  const existingManagement = await adminReadDocument("aiStatisticsBriefings", `${companyId}_${clock.day}_management`);
  const existingBooking = await adminReadDocument("aiStatisticsBriefings", `${companyId}_${clock.day}_booking`);
  if (!force && existingManagement?.status && existingBooking?.status) {
    return { skipped: true, reason: "Today’s briefings already exist.", day: clock.day };
  }

  const bookingDocs = await adminListDocuments("bookings");
  const companyBookings = bookingDocs
    .filter(({ data }) => !data?.companyId || String(data.companyId) === companyId)
    .map(({ id, data }) => ({ id, ...data }));
  const fullSnapshot = buildStatisticsInsightSnapshot(companyBookings, { now, rules: published.rules, companyId });
  const sourceSnapshotHash = sha256(fullSnapshot);
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const results = {};
  const priorDocuments = await adminListDocuments("aiStatisticsBriefings");

  for (const variant of ["management", "booking"]) {
    const snapshot = redactSnapshotForVariant(fullSnapshot, variant);
    let content;
    let status = "ready";
    let generationError = "";
    let stale = false;
    let currentHighlights = [];
    let contentGeneratedAt = generatedAt;
    let contentRulesVersion = published.version;
    try {
      content = await generateWithAi(snapshot, published.rules, variant);
    } catch (error) {
      status = "degraded";
      generationError = clean(error?.message || "AI generation failed", 300);
      const deterministic = deterministicBriefing(snapshot, variant, generationError);
      const previous = priorDocuments
        .map(({ data }) => data)
        .filter((item) => item.companyId === companyId && item.variant === variant && item.briefingDate !== clock.day)
        .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))[0];
      if (previous?.insights?.length) {
        stale = true;
        currentHighlights = deterministic.insights.slice(0, 3);
        contentGeneratedAt = previous.generatedAt || generatedAt;
        contentRulesVersion = previous.businessRulesVersion || published.version;
        content = { headline: previous.headline, summary: previous.summary, insights: previous.insights, sections: previous.sections || deterministic.sections };
      } else {
        content = deterministic;
      }
    }
    const document = {
      schemaVersion: 2,
      companyId,
      briefingDate: clock.day,
      variant,
      status,
      generatedAt,
      contentGeneratedAt,
      expiresAt,
      sourceSnapshotHash,
      businessRulesVersion: contentRulesVersion,
      currentBusinessRulesVersion: published.version,
      model: status === "ready" ? MODEL : "deterministic-fallback",
      generationError,
      stale,
      currentHighlights,
      snapshot: {
        asOf: snapshot.asOf,
        periods: snapshot.periods,
        evidenceCatalog: snapshot.evidenceCatalog,
        dataQuality: snapshot.dataQuality,
        analysisConfig: snapshot.analysisConfig,
        sections: snapshot.sections,
      },
      ...content,
    };
    await adminPatchDocument("aiStatisticsBriefings", `${companyId}_${clock.day}_${variant}`, document);
    results[variant] = document;
  }
  return { skipped: false, day: clock.day, sourceSnapshotHash, results };
}

export async function readLatestBriefing(companyId, variant, now = new Date()) {
  const today = londonClock(now).day;
  const current = await adminReadDocument("aiStatisticsBriefings", `${companyId}_${today}_${variant}`);
  if (current) return { briefing: current, stale: false };
  const all = await adminListDocuments("aiStatisticsBriefings");
  const previous = all
    .map(({ data }) => data)
    .filter((item) => item.companyId === companyId && item.variant === variant)
    .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))[0];
  return { briefing: previous || null, stale: Boolean(previous) };
}
