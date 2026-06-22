"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Plus, Save, Search, Trash2 } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { db } from "@/app/utils/firebaseClient";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import { FULL_SIZE_TRACKING_QUOTE_TEMPLATES } from "@/app/utils/quoteTemplates";

const UI = {
  bg: "#f3f6f9",
  panel: "#ffffff",
  border: "#d8e2ee",
  text: "#061426",
  muted: "#586b82",
  brand: "#1f4b7a",
  red: "#b91c1c",
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const slugify = (value) =>
  String(value || "quote-template")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `quote-template-${Date.now()}`;

const pageWrap = { minHeight: "100vh", background: UI.bg, color: UI.text, padding: "12px 14px 24px" };
const surface = {
  background: UI.panel,
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.05)",
};
const button = {
  minHeight: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "#fff",
  color: UI.text,
  fontSize: 13,
  fontWeight: 900,
  padding: "0 12px",
  textDecoration: "none",
  cursor: "pointer",
};
const primaryButton = { ...button, background: UI.brand, borderColor: UI.brand, color: "#fff" };
const dangerButton = { ...button, borderColor: "#fecdd3", background: "#fff1f2", color: UI.red };
const input = {
  width: "100%",
  minHeight: 36,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "#fff",
  color: UI.text,
  fontSize: 13,
  fontWeight: 700,
  padding: "8px 10px",
  boxSizing: "border-box",
  outline: "none",
};
const label = { display: "block", color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase", marginBottom: 4 };
const templateSection = {
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  overflow: "hidden",
  background: "#fff",
};
const templateSectionHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: 8,
  background: "#bfbfbf",
};
const lineGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) 72px 105px 130px 92px",
  gap: 6,
  alignItems: "center",
  padding: 6,
  borderTop: `1px solid ${UI.border}`,
};
const compactInput = { ...input, minHeight: 32, padding: "6px 8px", fontSize: 12 };
const iconButton = { ...button, minHeight: 30, width: 30, padding: 0 };
const smallButton = { ...button, minHeight: 30, padding: "0 9px", fontSize: 12 };

const cloneLineItem = (section = "Equipment - Daily Rates (Optional Equipment Charged if Used or Booked)") => ({
  section,
  description: "",
  qty: "",
  unitPrice: "",
  totalMode: "auto",
});

const normalizeSharedRateText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const SHARED_RATE_RULES = [
  { id: "five_k_generator", label: "5K Generator", match: /5k generator/ },
  { id: "driver_day", label: "Driver/Technician per 10hr day", match: /services? of driver.*technician.*10hr/ },
  { id: "basic_riggers", label: "Basic Riggers Scaffolding Kit", match: /basic riggers scaffolding kit/ },
  { id: "pre_rigging", label: "Pre-Rigging & Additional Equipment", match: /pre rigging.*(additional equipment|prep|prep work)|pre rigging and prep work charged/ },
  { id: "overtime_1_5", label: "Overtime charged @ 1.5T", match: /overtime charged.*1 5t/ },
  { id: "sunday_bank_holiday", label: "Sunday and Bank Holiday double time", match: /sunday.*bank holiday.*double time|double time.*sundays.*bank holidays/ },
  { id: "turnaround", label: "Turnaround Day After Night Work", match: /turnaround day after night work/ },
  { id: "late_working", label: "Late working 22:00-23:59", match: /supplementary charge for late working/ },
  { id: "saturday", label: "Saturday working supplement", match: /supplementary charge applies for saturday working/ },
  { id: "commercials_weekend_night", label: "Commercials weekend/night APA", match: /commercials.*(sundays|night work).*(saturday|saturdays).*1 5t/ },
  { id: "recce_charge", label: "Recce charge per man", match: /recce charge per man/ },
  { id: "tracking_travel_days", label: "Tracking vehicle and crew travel days", match: /tracking vehicle and crew travel days/ },
  { id: "tracking_travel_time", label: "Tracking vehicle and crew travel time", match: /tracking vehicle and crew travel time/ },
  { id: "overnight_meal", label: "Overnight Meal Allowance", match: /overnight.*meal allowance|overnights meal allowance/ },
  { id: "breakfast_lunch", label: "Breakfast/Lunch not supplied", match: /breakfast lunch not supplied on location per man/ },
  { id: "recce_travel_time", label: "Recce travel time/day", match: /recce travel time travel day/ },
  { id: "recce_mileage", label: "Recce mileage", match: /recce mileage/ },
  { id: "london_home_counties", label: "London/Home Counties fixed travel", match: /london and home counties fixed travel charge/ },
  { id: "congestion_ulez", label: "London Congestion/ULEZ", match: /london congestion ulez charge/ },
  { id: "clean_air", label: "Clean air zone charge", match: /clean air zone charge/ },
];

const countValues = (values) =>
  values.reduce((map, value) => {
    const key = String(value ?? "");
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());

const mostCommonValue = (values, fallback = "") => {
  const counts = Array.from(countValues(values).entries());
  if (!counts.length) return fallback;
  counts.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return counts[0][0];
};

const formatValueCounts = (values) =>
  Array.from(countValues(values).entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([value, count]) => `${value || "blank"} (${count})`)
    .join(", ");

const summarizeSharedRates = (templates = []) =>
  SHARED_RATE_RULES.map((rule) => {
    const matches = [];
    templates.forEach((template) => {
      (template.lineItems || []).forEach((item, itemIndex) => {
        if (rule.match.test(normalizeSharedRateText(item.description))) {
          matches.push({
            templateId: template.id,
            templateName: template.serviceDescription || template.file || template.id,
            itemIndex,
            unitPrice: String(item.unitPrice ?? ""),
            totalMode: String(item.totalMode || "auto"),
          });
        }
      });
    });
    const unitPrices = matches.map((match) => match.unitPrice);
    const totalModes = matches.map((match) => match.totalMode);
    return {
      ...rule,
      matches,
      occurrenceCount: matches.length,
      templateCount: new Set(matches.map((match) => match.templateId)).size,
      unitPrices: Array.from(new Set(unitPrices)),
      totalModes: Array.from(new Set(totalModes)),
      suggestedUnitPrice: mostCommonValue(unitPrices),
      suggestedTotalMode: mostCommonValue(totalModes, "tbc"),
      unitPriceSummary: formatValueCounts(unitPrices),
      totalModeSummary: formatValueCounts(totalModes),
    };
  }).filter((summary) => summary.occurrenceCount > 0);

export default function QuoteTemplatesPage() {
  const rawAuthState = useAuth();
  const authState = useMemo(() => rawAuthState || {}, [rawAuthState]);
  const accessKey = dataAccessKey(authState);
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [globalDrafts, setGlobalDrafts] = useState({});

  useEffect(() => {
    const load = async () => {
      const gate = resolveDataAccess(authState);
      if (gate.checking) return;
      if (reportDataAccessBlocked(gate, { collectionName: "settings", operation: "load quote templates" })) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "settings", "quoteTemplates"));
        const loaded = snap.exists() && Array.isArray(snap.data()?.templates)
          ? snap.data().templates
          : FULL_SIZE_TRACKING_QUOTE_TEMPLATES;
        const next = clone(loaded);
        setTemplates(next);
        setSelectedId(next[0]?.id || "");
      } catch (err) {
        console.error("Failed loading quote templates:", err);
        setError("Unable to load quote templates.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accessKey, authState]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) || null,
    [selectedId, templates]
  );

  useEffect(() => {
    setError("");
    setMessage("");
  }, [selectedTemplate?.id]);

  const visibleTemplates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((template) =>
      `${template.id || ""} ${template.file || ""} ${template.serviceDescription || ""}`.toLowerCase().includes(needle)
    );
  }, [search, templates]);

  const sharedRateSummaries = useMemo(() => summarizeSharedRates(templates), [templates]);

  useEffect(() => {
    setGlobalDrafts((current) => {
      let changed = false;
      const next = { ...current };
      sharedRateSummaries.forEach((summary) => {
        if (!next[summary.id]) {
          next[summary.id] = {
            unitPrice: summary.suggestedUnitPrice,
            totalMode: summary.suggestedTotalMode,
          };
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [sharedRateSummaries]);

  const updateSelected = (patch) => {
    setTemplates((current) =>
      current.map((template) => (template.id === selectedId ? { ...template, ...patch } : template))
    );
  };
  const updateSelectedId = (value) => {
    const nextId = slugify(value);
    setTemplates((current) =>
      current.map((template) => (template.id === selectedId ? { ...template, id: nextId } : template))
    );
    setSelectedId(nextId);
  };

  const updateLineItem = (index, patch) => {
    if (!selectedTemplate) return;
    const lineItems = [...(selectedTemplate.lineItems || [])];
    lineItems[index] = { ...(lineItems[index] || {}), ...patch };
    updateSelected({ lineItems });
  };

  const updateGlobalDraft = (ruleId, patch) => {
    setGlobalDrafts((current) => ({
      ...current,
      [ruleId]: {
        ...(current[ruleId] || {}),
        ...patch,
      },
    }));
  };

  const applyGlobalRate = (ruleId) => {
    const summary = sharedRateSummaries.find((item) => item.id === ruleId);
    const rule = SHARED_RATE_RULES.find((item) => item.id === ruleId);
    if (!summary || !rule) return;
    const draft = globalDrafts[ruleId] || {};
    const unitPrice = Object.prototype.hasOwnProperty.call(draft, "unitPrice")
      ? draft.unitPrice
      : summary.suggestedUnitPrice;
    const totalMode = draft.totalMode || summary.suggestedTotalMode || "tbc";

    setTemplates((current) =>
      current.map((template) => ({
        ...template,
        lineItems: (template.lineItems || []).map((item) =>
          rule.match.test(normalizeSharedRateText(item.description))
            ? { ...item, unitPrice, totalMode }
            : item
        ),
      }))
    );
    setMessage(`Applied ${summary.label} to ${summary.occurrenceCount} line${summary.occurrenceCount === 1 ? "" : "s"}. Save templates to publish.`);
    setError("");
  };

  const addLine = (section) => {
    if (!selectedTemplate) return;
    updateSelected({ lineItems: [...(selectedTemplate.lineItems || []), cloneLineItem(section)] });
  };

  const addSection = () => {
    const section = window.prompt("New section name:", "Manual additions");
    if (!section?.trim()) return;
    addLine(section.trim());
  };

  const removeLine = (index) => {
    if (!selectedTemplate) return;
    updateSelected({ lineItems: (selectedTemplate.lineItems || []).filter((_, itemIndex) => itemIndex !== index) });
  };

  const moveLine = (index, direction) => {
    if (!selectedTemplate) return;
    const lineItems = [...(selectedTemplate.lineItems || [])];
    const target = index + direction;
    if (target < 0 || target >= lineItems.length) return;
    [lineItems[index], lineItems[target]] = [lineItems[target], lineItems[index]];
    updateSelected({ lineItems });
  };

  const renameSection = (oldSection, nextSection) => {
    const clean = String(nextSection || "").trim();
    if (!selectedTemplate || !clean) return;
    updateSelected({
      lineItems: (selectedTemplate.lineItems || []).map((item) =>
        String(item.section || "Quote lines") === oldSection ? { ...item, section: clean } : item
      ),
    });
  };

  const saveTemplates = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const nextTemplates = templates.map((template) => ({
        ...template,
        lineItems: Array.isArray(template.lineItems) ? template.lineItems : [],
      }));
      await setDoc(
        doc(db, "settings", "quoteTemplates"),
        tenantPayload(authState, {
          templates: nextTemplates,
          updatedAt: serverTimestamp(),
          updatedBy: authState.user?.email || "Unknown",
        }),
        { merge: true }
      );
      setTemplates(nextTemplates);
      setMessage("Quote templates saved.");
    } catch (err) {
      console.error("Failed saving quote templates:", err);
      setError("Unable to save quote templates.");
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = () => {
    const id = slugify(`new-template-${Date.now()}`);
    const template = {
      id,
      file: "New Quote Template.xls",
      serviceDescription: "New Quote Template",
      defaultBickersContact: "",
      lineItems: [],
    };
    setTemplates((current) => [template, ...current]);
    setSelectedId(id);
  };

  const duplicateTemplate = () => {
    if (!selectedTemplate) return;
    const id = slugify(`${selectedTemplate.id || selectedTemplate.serviceDescription}-copy-${Date.now()}`);
    const copy = {
      ...clone(selectedTemplate),
      id,
      file: selectedTemplate.file ? `${selectedTemplate.file} copy` : "Quote Template Copy.xls",
      serviceDescription: `${selectedTemplate.serviceDescription || "Quote Template"} Copy`,
    };
    setTemplates((current) => [copy, ...current]);
    setSelectedId(id);
  };

  const deleteTemplate = () => {
    if (!selectedTemplate) return;
    const confirmed = window.confirm(`Delete template "${selectedTemplate.serviceDescription || selectedTemplate.id}"?\n\nSave templates afterwards to publish this change.`);
    if (!confirmed) return;
    setTemplates((current) => {
      const next = current.filter((template) => template.id !== selectedTemplate.id);
      setSelectedId(next[0]?.id || "");
      return next;
    });
  };

  const sections = useMemo(() => {
    const map = new Map();
    (selectedTemplate?.lineItems || []).forEach((item, index) => {
      const section = item.section || "Quote lines";
      if (!map.has(section)) map.set(section, []);
      map.get(section).push({ item, index });
    });
    return Array.from(map.entries()).map(([section, rows]) => ({ section, rows }));
  }, [selectedTemplate?.lineItems]);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Quote Templates</h1>
            <div style={{ color: UI.muted, fontSize: 13, marginTop: 4 }}>
              View and edit the templates used by the quote builder.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/completed-quotes" style={button}>
              <ArrowLeft size={14} />
              Completed Quotes
            </Link>
            <button type="button" onClick={saveTemplates} disabled={saving} style={{ ...primaryButton, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.75 : 1 }}>
              <Save size={14} />
              {saving ? "Saving..." : "Save Templates"}
            </button>
          </div>
        </div>

        {message ? <div style={{ ...surface, padding: 10, marginBottom: 10, color: "#166534", fontWeight: 800 }}>{message}</div> : null}
        {error ? <div style={{ ...surface, padding: 10, marginBottom: 10, color: UI.red, fontWeight: 800 }}>{error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
          <aside style={{ ...surface, padding: 10 }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: UI.muted }} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates..." style={{ ...input, paddingLeft: 34 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button type="button" onClick={addTemplate} style={button}><Plus size={14} /> New</button>
              <button type="button" onClick={duplicateTemplate} disabled={!selectedTemplate} style={button}><Copy size={14} /> Duplicate</button>
            </div>
            <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
              {loading ? "Loading..." : `${visibleTemplates.length} of ${templates.length} templates`}
            </div>
            <div style={{ display: "grid", gap: 6, maxHeight: "calc(100vh - 245px)", overflowY: "auto" }}>
              {visibleTemplates.map((template) => {
                const active = template.id === selectedId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedId(template.id)}
                    style={{
                      textAlign: "left",
                      padding: 9,
                      borderRadius: 8,
                      border: `1px solid ${active ? UI.brand : UI.border}`,
                      background: active ? "#edf3f8" : "#fff",
                      color: UI.text,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{template.serviceDescription || template.file || template.id}</div>
                    <div style={{ color: UI.muted, fontSize: 11, marginTop: 2 }}>{template.file || template.id}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main style={{ ...surface, padding: 12 }}>
            {!selectedTemplate ? (
              <div style={{ color: UI.muted, fontWeight: 800 }}>Select a template to edit.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <section style={{ ...templateSection, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
                    <div>
                      <label style={{ ...label, marginBottom: 2 }}>Global Shared Rates</label>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 700 }}>
                        Apply one charge to every matching line across all templates, then save templates.
                      </div>
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800 }}>
                      {sharedRateSummaries.filter((summary) => summary.unitPrices.length > 1 || summary.totalModes.length > 1).length} with variance
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6, maxHeight: 360, overflowY: "auto" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(230px, 1.2fr) 90px 110px minmax(220px, 1fr) 130px 88px", gap: 6, alignItems: "center", color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase", padding: "0 2px" }}>
                      <div>Shared line</div>
                      <div>Templates</div>
                      <div>Unit Price</div>
                      <div>Current values</div>
                      <div>Total Mode</div>
                      <div>Action</div>
                    </div>
                    {sharedRateSummaries.map((summary) => {
                      const draft = globalDrafts[summary.id] || {};
                      const hasVariance = summary.unitPrices.length > 1 || summary.totalModes.length > 1;
                      return (
                        <div
                          key={summary.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(230px, 1.2fr) 90px 110px minmax(220px, 1fr) 130px 88px",
                            gap: 6,
                            alignItems: "center",
                            padding: 6,
                            borderRadius: 8,
                            border: `1px solid ${hasVariance ? "#fbbf24" : UI.border}`,
                            background: hasVariance ? "#fffbeb" : "#fff",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 900 }}>{summary.label}</div>
                            <div style={{ color: UI.muted, fontSize: 11, marginTop: 2 }}>
                              {summary.occurrenceCount} line{summary.occurrenceCount === 1 ? "" : "s"}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 900 }}>{summary.templateCount}</div>
                          <input
                            value={draft.unitPrice ?? ""}
                            onChange={(event) => updateGlobalDraft(summary.id, { unitPrice: event.target.value })}
                            style={compactInput}
                            placeholder="Unit"
                          />
                          <div style={{ color: hasVariance ? "#92400e" : UI.muted, fontSize: 11, fontWeight: 800, lineHeight: 1.35 }}>
                            {summary.unitPrices.length > 1 ? `Varies: ${summary.unitPriceSummary}` : `Unit: ${summary.unitPriceSummary}`}
                          </div>
                          <select
                            value={draft.totalMode || summary.suggestedTotalMode || "tbc"}
                            onChange={(event) => updateGlobalDraft(summary.id, { totalMode: event.target.value })}
                            style={compactInput}
                          >
                            <option value="auto">Auto total</option>
                            <option value="tbc">TBC</option>
                            <option value="production">Production</option>
                            <option value="foc">FOC</option>
                            <option value="discount">Discount</option>
                          </select>
                          <button type="button" onClick={() => applyGlobalRate(summary.id)} style={smallButton}>
                            Apply
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <div>
                    <label style={label}>Template ID</label>
                    <input value={selectedTemplate.id || ""} onChange={(event) => updateSelectedId(event.target.value)} style={input} />
                  </div>
                  <div>
                    <label style={label}>Source File</label>
                    <input value={selectedTemplate.file || ""} onChange={(event) => updateSelected({ file: event.target.value })} style={input} />
                  </div>
                </div>
                <div>
                  <label style={label}>Service Description</label>
                  <input value={selectedTemplate.serviceDescription || ""} onChange={(event) => updateSelected({ serviceDescription: event.target.value })} style={input} />
                </div>
                <div>
                  <label style={label}>Default Bickers Contact</label>
                  <input value={selectedTemplate.defaultBickersContact || ""} onChange={(event) => updateSelected({ defaultBickersContact: event.target.value })} style={input} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <label style={{ ...label, marginBottom: 2 }}>Template Lines</label>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 700 }}>
                      {(selectedTemplate.lineItems || []).length} line{(selectedTemplate.lineItems || []).length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={addSection} style={button}>
                      <Plus size={14} />
                      Add section
                    </button>
                    <button type="button" onClick={deleteTemplate} style={dangerButton}>
                      <Trash2 size={14} />
                      Delete Template
                    </button>
                  </div>
                </div>

                {sections.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {sections.map(({ section, rows }) => (
                      <section key={section} style={templateSection}>
                        <div style={templateSectionHeader}>
                          <input
                            value={section}
                            onChange={(event) => renameSection(section, event.target.value)}
                            style={{
                              ...compactInput,
                              background: "#e5e7eb",
                              borderColor: "#9ca3af",
                              fontWeight: 900,
                            }}
                          />
                          <button type="button" onClick={() => addLine(section)} style={smallButton}>
                            <Plus size={13} />
                            Line
                          </button>
                        </div>

                        <div style={{ ...lineGrid, background: "#f8fafc", color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>
                          <div>Description</div>
                          <div>Qty</div>
                          <div>Unit Price</div>
                          <div>Total Mode</div>
                          <div>Actions</div>
                        </div>

                        {rows.map(({ item, index }) => (
                          <div key={`${section}-${index}`} style={lineGrid}>
                            <input
                              value={item.description || ""}
                              onChange={(event) => updateLineItem(index, { description: event.target.value })}
                              style={compactInput}
                              placeholder="Line description"
                            />
                            <input
                              value={item.qty || ""}
                              onChange={(event) => updateLineItem(index, { qty: event.target.value })}
                              style={compactInput}
                              placeholder="Qty"
                            />
                            <input
                              value={item.unitPrice || ""}
                              onChange={(event) => updateLineItem(index, { unitPrice: event.target.value })}
                              style={compactInput}
                              placeholder="Unit"
                            />
                            <select
                              value={item.totalMode || "auto"}
                              onChange={(event) => updateLineItem(index, { totalMode: event.target.value })}
                              style={compactInput}
                            >
                              <option value="auto">Auto total</option>
                              <option value="tbc">TBC</option>
                              <option value="production">Production</option>
                              <option value="foc">FOC</option>
                              <option value="discount">Discount</option>
                            </select>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button type="button" onClick={() => moveLine(index, -1)} disabled={index === 0} style={iconButton} title="Move up">
                                <ArrowUp size={13} />
                              </button>
                              <button type="button" onClick={() => moveLine(index, 1)} disabled={index === (selectedTemplate.lineItems || []).length - 1} style={iconButton} title="Move down">
                                <ArrowDown size={13} />
                              </button>
                              <button type="button" onClick={() => removeLine(index)} style={{ ...iconButton, color: UI.red, borderColor: "#fecdd3" }} title="Delete line">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </section>
                    ))}
                  </div>
                ) : (
                  <section style={{ ...templateSection, padding: 16, color: UI.muted, fontWeight: 800 }}>
                    No lines yet. Add a section to start building this template.
                  </section>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
