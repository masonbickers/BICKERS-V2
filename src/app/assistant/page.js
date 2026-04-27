"use client";

import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

const UI = {
  bg: "#edf3f8",
  shell: "#ffffff",
  shellAlt: "#f7fafc",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  accent: "#8b5e3c",
  border: "1px solid #dbe2ea",
  shadow: "0 18px 40px rgba(15,23,42,0.08)",
};

const starterPrompts = [
  "Which vehicles currently have open issues or overdue maintenance?",
  "Summarise this week's timesheet risks and missing information.",
  "Which jobs need the most urgent follow-up today?",
  "Give me a snapshot of bookings, staff, and workshop activity.",
];

const SEARCH_LIMITS = {
  bookings: 24,
  employees: 40,
  vehicles: 50,
  holidays: 20,
  maintenance: 20,
  timesheets: 24,
  vehicleIssues: 24,
  vehicleChecks: 24,
  maintenanceJobs: 24,
  maintenanceBookings: 20,
};

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function serializeValue(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(serializeValue).join(" ");
  if (typeof value === "object") return Object.values(value).map(serializeValue).join(" ");
  return String(value);
}

function scoreRecord(record, terms) {
  if (!record || terms.length === 0) return 0;
  const haystack = normalizeText(serializeValue(record));
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (haystack.includes(term)) score += term.length > 4 ? 3 : 1;
  }
  return score;
}

function latestValue(record, fields) {
  for (const field of fields) {
    const value = record?.[field];
    if (value) return value;
  }
  return null;
}

function rankRecords(rows, terms, dateFields = []) {
  return [...rows].sort((a, b) => {
    const scoreDiff = scoreRecord(b, terms) - scoreRecord(a, terms);
    if (scoreDiff !== 0) return scoreDiff;

    const aDate = Date.parse(String(latestValue(a, dateFields) || "")) || 0;
    const bDate = Date.parse(String(latestValue(b, dateFields) || "")) || 0;
    return bDate - aDate;
  });
}

function buildScopedContext(fullContext, prompt) {
  if (!fullContext) return null;

  const promptTerms = normalizeText(prompt)
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  const scoped = {
    user: fullContext.user || {},
    metrics: fullContext.metrics || {},
  };

  const collectionConfigs = {
    bookings: ["updatedAt", "createdAt"],
    employees: ["updatedAt", "createdAt"],
    vehicles: ["updatedAt", "createdAt"],
    holidays: ["updatedAt", "createdAt", "startDate"],
    maintenance: ["updatedAt", "createdAt"],
    timesheets: ["submittedAt", "updatedAt", "weekStart"],
    vehicleIssues: ["createdAt", "updatedAt"],
    vehicleChecks: ["updatedAt", "createdAt", "dateISO"],
    maintenanceJobs: ["updatedAt", "createdAt", "dueDate"],
    maintenanceBookings: ["updatedAt", "createdAt"],
  };

  for (const [name, dateFields] of Object.entries(collectionConfigs)) {
    const rows = Array.isArray(fullContext[name]) ? fullContext[name] : [];
    scoped[name] = rankRecords(rows, promptTerms, dateFields).slice(0, SEARCH_LIMITS[name] || 20);
  }

  return scoped;
}

export default function AssistantPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Ask about bookings, employees, vehicles, timesheets, workshop activity, finance, or maintenance. I’ll answer using the data available in the system.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contextMeta, setContextMeta] = useState(null);
  const [dataContext, setDataContext] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadContext = async () => {
      const collectionsToRead = [
        "bookings",
        "employees",
        "vehicles",
        "holidays",
        "maintenance",
        "timesheets",
        "vehicleIssues",
        "vehicleChecks",
        "maintenanceJobs",
        "maintenanceBookings",
      ];

      const results = await Promise.all(
        collectionsToRead.map(async (name) => {
          try {
            const snap = await getDocs(collection(db, name));
            return {
              name,
              rows: snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
            };
          } catch {
            return { name, rows: [] };
          }
        })
      );

      if (cancelled) return;

      const map = Object.fromEntries(results.map((item) => [item.name, item.rows]));
      setDataContext({
        user: {
          email: auth.currentUser?.email || "",
        },
        metrics: {
          bookings: map.bookings.length,
          employees: map.employees.length,
          vehicles: map.vehicles.length,
          holidays: map.holidays.length,
          maintenance: map.maintenance.length,
          timesheets: map.timesheets.length,
          vehicleIssues: map.vehicleIssues.length,
          vehicleChecks: map.vehicleChecks.length,
          maintenanceJobs: map.maintenanceJobs.length,
          maintenanceBookings: map.maintenanceBookings.length,
        },
        bookings: map.bookings,
        employees: map.employees,
        vehicles: map.vehicles,
        holidays: map.holidays,
        maintenance: map.maintenance,
        timesheets: map.timesheets,
        vehicleIssues: map.vehicleIssues,
        vehicleChecks: map.vehicleChecks,
        maintenanceJobs: map.maintenanceJobs,
        maintenanceBookings: map.maintenanceBookings,
      });
      setContextMeta((prev) => prev || {
        bookings: map.bookings.length,
        employees: map.employees.length,
        vehicles: map.vehicles.length,
        timesheets: map.timesheets.length,
        vehicleIssues: map.vehicleIssues.length,
      });
    };

    loadContext().catch(() => {
      if (!cancelled) setDataContext(null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const ask = async (promptOverride = "") => {
    const prompt = String(promptOverride || input).trim();
    if (!prompt || loading) return;

    const nextMessages = [...messages, { role: "user", content: prompt }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const idToken = await auth.currentUser?.getIdToken?.();
      if (!idToken) throw new Error("Please sign in again.");
      const scopedContext = buildScopedContext(dataContext, prompt);
      if (!scopedContext) {
        throw new Error("Assistant data is still loading. Try again in a moment.");
      }

      const res = await fetch("/api/chatgpt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          prompt,
          messages: nextMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          clientContext: scopedContext,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "No reply." }]);
      setContextMeta(data?.contextMeta || null);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          minHeight: "100%",
          background: UI.bg,
          padding: "22px 18px 34px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "320px minmax(0, 1fr)",
            gap: 18,
            alignItems: "stretch",
          }}
        >
          <aside
            style={{
              background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
              border: UI.border,
              borderRadius: 18,
              boxShadow: UI.shadow,
              padding: 18,
              display: "grid",
              gap: 16,
              alignSelf: "start",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${UI.brandBorder}`,
                  background: UI.brandSoft,
                  color: UI.brand,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                AI Workspace
              </div>
              <h1
                style={{
                  margin: "12px 0 6px",
                  color: UI.text,
                  fontSize: 30,
                  lineHeight: 1.05,
                  letterSpacing: "-0.03em",
                }}
              >
                Operations Chat
              </h1>
              <p style={{ margin: 0, color: UI.muted, fontSize: 13.5, lineHeight: 1.6 }}>
                A ChatGPT-style assistant for your bookings, workshop, fleet, staff, timesheets, and business data.
              </p>
            </div>

            <div
              style={{
                border: UI.border,
                borderRadius: 14,
                background: UI.shellAlt,
                padding: 14,
              }}
            >
              <div style={{ color: UI.text, fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
                Try asking
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => ask(prompt)}
                    disabled={loading}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${UI.brandBorder}`,
                      background: "#fff",
                      color: UI.text,
                      cursor: loading ? "not-allowed" : "pointer",
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                border: UI.border,
                borderRadius: 14,
                background: "#fff",
                padding: 14,
              }}
            >
              <div style={{ color: UI.text, fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
                Data scope
              </div>
              <div style={{ color: UI.muted, fontSize: 12.5, lineHeight: 1.6 }}>
                The assistant is grounded in your software data, not just a generic model. It uses records from core collections and answers in operational language.
              </div>
              {contextMeta ? (
                <div style={{ marginTop: 10, color: UI.muted, fontSize: 12, lineHeight: 1.55 }}>
                  Last context load:
                  <div>Bookings: {contextMeta.bookings ?? 0}</div>
                  <div>Employees: {contextMeta.employees ?? 0}</div>
                  <div>Vehicles: {contextMeta.vehicles ?? 0}</div>
                  <div>Timesheets: {contextMeta.timesheets ?? 0}</div>
                  <div>Issues: {contextMeta.vehicleIssues ?? 0}</div>
                </div>
              ) : null}
            </div>
          </aside>

          <section
            style={{
              minHeight: "74vh",
              background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
              border: UI.border,
              borderRadius: 22,
              boxShadow: UI.shadow,
              overflow: "hidden",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                borderBottom: UI.border,
                background:
                  "radial-gradient(circle at top right, rgba(107,179,127,0.14), transparent 30%), linear-gradient(135deg, #162434 0%, #22364c 100%)",
                color: "#eef5fb",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800 }}>Bickers Assistant</div>
              <div style={{ fontSize: 12.5, opacity: 0.84, marginTop: 4 }}>
                Search the system, summarize activity, and answer operational questions from one place.
              </div>
            </div>

            <div
              ref={listRef}
              style={{
                overflowY: "auto",
                padding: 18,
                display: "grid",
                gap: 14,
                background:
                  "radial-gradient(circle at top left, rgba(237,243,248,0.9), transparent 35%), linear-gradient(180deg, #f8fbfd 0%, #fdfefe 100%)",
              }}
            >
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={`${message.role}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "82%",
                        borderRadius: 18,
                        padding: "12px 14px",
                        border: isUser ? `1px solid ${UI.brand}` : UI.border,
                        background: isUser ? "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)" : "#ffffff",
                        color: isUser ? "#fff" : UI.text,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                        fontSize: 14,
                        boxShadow: isUser
                          ? "0 10px 24px rgba(31,75,122,0.18)"
                          : "0 10px 20px rgba(15,23,42,0.05)",
                      }}
                    >
                      {message.content}
                    </div>
                  </div>
                );
              })}

              {loading ? (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      maxWidth: "82%",
                      borderRadius: 18,
                      padding: "12px 14px",
                      border: UI.border,
                      background: "#ffffff",
                      color: UI.muted,
                      fontSize: 14,
                    }}
                  >
                    Thinking through your system data...
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ borderTop: UI.border, padding: 16, background: "#fff" }}>
              {error ? (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    color: "#991b1b",
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  {error}
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12 }}>
                <textarea
                  rows={4}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about bookings, workshop, vehicles, employees, timesheets, issues, finance, or maintenance..."
                  style={{
                    width: "100%",
                    resize: "vertical",
                    minHeight: 92,
                    borderRadius: 16,
                    border: UI.border,
                    padding: "14px 15px",
                    outline: "none",
                    fontSize: 14,
                    color: UI.text,
                    background: "#fff",
                    boxSizing: "border-box",
                  }}
                />

                <button
                  type="button"
                  onClick={() => ask()}
                  disabled={loading || !String(input).trim()}
                  style={{
                    alignSelf: "end",
                    padding: "12px 18px",
                    borderRadius: 14,
                    border: `1px solid ${UI.brand}`,
                    background: loading || !String(input).trim()
                      ? "#d7e1ea"
                      : "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
                    color: loading || !String(input).trim() ? "#6b7280" : "#fff",
                    fontWeight: 800,
                    cursor: loading || !String(input).trim() ? "not-allowed" : "pointer",
                    minWidth: 118,
                    height: 48,
                  }}
                >
                  {loading ? "Thinking..." : "Send"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
