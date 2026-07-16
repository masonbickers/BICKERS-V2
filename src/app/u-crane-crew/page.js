// src/app/u-crane-crew/page.js
"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState, useCallback } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* ───────────────────────────────────────────
   UI tokens
─────────────────────────────────────────── */
const UI = UI_TOKENS;

const pageWrap = {
  padding: "24px 18px 40px",
  background: UI.bg,
  minHeight: "100vh",
};

const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};

const h1 = {
  color: UI.text,
  fontSize: 26,
  lineHeight: 1.15,
  fontWeight: 900,
  letterSpacing: "-0.01em",
  margin: 0,
};

const sub = { color: UI.muted, fontSize: 13 };

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const card = {
  ...surface,
  padding: 16,
};

const sectionHeader = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const titleMd = { fontSize: 16, fontWeight: 900, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12, marginTop: 4 };

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-hover)",
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid var(--color-border)",
      background: "var(--color-surface)",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  if (kind === "danger") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid var(--color-danger-border)",
      background: "var(--color-accent-soft)",
      color: "var(--color-danger)",
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    padding: "10px 12px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: UI.brand,
    color: "var(--color-white)",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  outline: "none",
  fontSize: 13.5,
  background: "var(--color-surface)",
};

const tableWrap = {
  width: "100%",
  overflow: "auto",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: "var(--color-surface)",
};

const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13.5,
};

const th = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-border)",
  position: "sticky",
  top: 0,
  background: "var(--color-surface-subtle)",
  zIndex: 1,
  whiteSpace: "nowrap",
  fontWeight: 900,
  fontSize: 12,
  color: UI.text,
};

const td = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-surface-hover)",
  verticalAlign: "top",
};

const pill = (active) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${active ? "var(--color-info-border)" : "var(--color-border)"}`,
  background: active ? "var(--color-info-soft)" : "var(--color-surface-subtle)",
  color: active ? "var(--color-brand)" : UI.text,
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap",
});

const norm = (v) => String(v ?? "").trim().toLowerCase();

/* ───────────────────────────────────────────
   U-Crane roles (keys MUST match create page)
─────────────────────────────────────────── */
const UCRANE_ROLES = [
  { label: "Precision Driver", key: "u-crane driver" },
  { label: "Arm Operator", key: "arm operator" },
  { label: "Arm & Head Tech", key: "Head and Arm Tech" },
  { label: "Transport Driver", key: "transport driver" },
  { label: "Camera Operator", key: "camera operator" },
];

const asJobTitles = (emp) => {
  const jt = emp?.jobTitle;
  if (Array.isArray(jt)) return jt.filter(Boolean);
  if (typeof jt === "string" && jt.trim()) return [jt.trim()];
  return [];
};

const getDisplayName = (row) =>
  row?.name ||
  row?.fullName ||
  [row?.firstName, row?.lastName].filter(Boolean).join(" ").trim() ||
  row?.displayName ||
  row?.email ||
  row?.id ||
  "Unknown";

export default function UCrewManagePage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  // employees collection
  const [employees, setEmployees] = useState([]);
  // freelancers collection
  const [freelancers, setFreelancers] = useState([]);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showOnlyVisible, setShowOnlyVisible] = useState(false);

  const [savingKey, setSavingKey] = useState(null);
  const [savedPulse, setSavedPulse] = useState(false);

  // Add freelancer modal
  const [addOpen, setAddOpen] = useState(false);
  const [newF, setNewF] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
    uCraneVisible: true,
    uCraneRoles: [],
  });

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "uCraneFreelancers", operation: "load U-Crane crew" });
      setEmployees([]);
      setFreelancers([]);
      return undefined;
    }

    const unsubEmp = onSnapshot(tenantCollectionQuery(db, "employees", dataAccessState), (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        __collection: "employees",
        ...d.data(),
      }));
      rows.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
      setEmployees(rows);
    });

    //  freelancers live collection
    const unsubFree = onSnapshot(tenantCollectionQuery(db, "uCraneFreelancers", dataAccessState), (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        __collection: "uCraneFreelancers",
        ...d.data(),
      }));
      rows.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
      setFreelancers(rows);
    });

    return () => {
      unsubEmp();
      unsubFree();
    };
  }, [accessKey, dataAccessState]);

  // combined list
  const combined = useMemo(() => {
    return [...employees, ...freelancers].sort((a, b) =>
      getDisplayName(a).localeCompare(getDisplayName(b))
    );
  }, [employees, freelancers]);

  const filtered = useMemo(() => {
    const q = norm(query);

    return combined.filter((row) => {
      const name = norm(getDisplayName(row));
      const email = norm(row?.email);
      const titles = asJobTitles(row).map(norm).join(" ");
      const uRoles = Array.isArray(row?.uCraneRoles)
        ? row.uCraneRoles.map(norm).join(" ")
        : "";

      const matchesQuery =
        !q ||
        name.includes(q) ||
        email.includes(q) ||
        titles.includes(q) ||
        uRoles.includes(q);

      if (!matchesQuery) return false;

      if (showOnlyVisible && !row.uCraneVisible) return false;

      if (roleFilter === "all") return true;

      const roles = Array.isArray(row?.uCraneRoles) ? row.uCraneRoles : [];
      return roles.some((r) => String(r).trim() === roleFilter);
    });
  }, [combined, query, roleFilter, showOnlyVisible]);

  const visibleCount = useMemo(
    () => filtered.filter((r) => !!r.uCraneVisible).length,
    [filtered]
  );

  const pulseSaved = () => {
    setSavedPulse(true);
    setTimeout(() => setSavedPulse(false), 700);
  };

  const updateRow = useCallback(async (row, patch) => {
    const key = `${row.__collection}:${row.id}`;
    try {
      setSavingKey(key);
      await updateDoc(doc(db, row.__collection, row.id), tenantPayload(dataAccessState, {
        ...patch,
        uCraneUpdatedAt: new Date().toISOString(),
      }));
      pulseSaved();
    } catch (e) {
      console.error("Failed to update:", e);
      alert("Failed to save changes. Check console.");
    } finally {
      setSavingKey(null);
    }
  }, [dataAccessState]);

  const toggleVisible = useCallback(
    (row) => updateRow(row, { uCraneVisible: !row.uCraneVisible }),
    [updateRow]
  );

  const toggleRole = useCallback(
    (row, roleKey) => {
      const current = Array.isArray(row.uCraneRoles) ? row.uCraneRoles.slice() : [];
      const exists = current.some((r) => String(r).trim() === roleKey);
      const next = exists
        ? current.filter((r) => String(r).trim() !== roleKey)
        : [...current, roleKey];

      updateRow(row, {
        uCraneRoles: next,
        uCraneVisible: row.uCraneVisible ?? true,
      });
    },
    [updateRow]
  );

  const saveFreelancerField = useCallback(
    (row, field, value) => {
      // only freelancers editable inline here (employees come from HR page)
      if (row.__collection !== "uCraneFreelancers") return;
      updateRow(row, { [field]: value });
    },
    [updateRow]
  );

  const addFreelancer = useCallback(async () => {
    if (!newF.name.trim()) return alert("Please enter freelancer name.");

    try {
      setSavingKey("addFreelancer");
      await addDoc(collection(db, "uCraneFreelancers"), tenantPayload(dataAccessState, {
        name: newF.name.trim(),
        email: newF.email.trim(),
        phone: newF.phone.trim(),
        notes: newF.notes.trim(),
        uCraneVisible: !!newF.uCraneVisible,
        uCraneRoles: Array.isArray(newF.uCraneRoles) ? newF.uCraneRoles : [],
        type: "Freelancer",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      pulseSaved();
      setAddOpen(false);
      setNewF({
        name: "",
        email: "",
        phone: "",
        notes: "",
        uCraneVisible: true,
        uCraneRoles: [],
      });
    } catch (e) {
      console.error("Add freelancer failed:", e);
      alert("Failed to add freelancer. Check console.");
    } finally {
      setSavingKey(null);
    }
  }, [dataAccessState, newF]);

  const deleteFreelancer = useCallback(async (row) => {
    if (row.__collection !== "uCraneFreelancers") return;
    const ok = confirm(`Delete freelancer "${getDisplayName(row)}"?`);
    if (!ok) return;

    try {
      setSavingKey(`del:${row.id}`);
      await deleteDoc(doc(db, "uCraneFreelancers", row.id));
      pulseSaved();
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Failed to delete freelancer. Check console.");
    } finally {
      setSavingKey(null);
    }
  }, []);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div className={layoutStyles.extracted1}>
          <div>
            <h1 style={h1}>U-Crane Crew Manager</h1>
            <div style={sub}>
              Manage who appears on the Create U-Crane Booking page.
              <span style={{ display: "block", marginTop: 6, color: UI.muted }}>
                Includes <b>Employees</b> + <b>Freelancers</b>.
              </span>
            </div>
          </div>

          <div className={layoutStyles.extracted2}>
            <div style={{ ...chip, background: UI.brandSoft, borderColor: "var(--color-brand-soft)", color: UI.brand }}>
              Showing: {visibleCount} / {filtered.length}
            </div>
            <div
              style={{
                ...chip,
                background: savedPulse ? "var(--color-success-soft)" : "var(--color-surface-hover)",
                borderColor: savedPulse ? "var(--color-success-accent)" : "var(--color-border)",
                color: savedPulse ? "var(--color-success)" : UI.text,
              }}
            >
              {savingKey ? "Saving…" : savedPulse ? "Saved Yes" : "Ready"}
            </div>

            <button type="button" style={btn()} onClick={() => setAddOpen(true)}>
              + Add Freelancer
            </button>
          </div>
        </div>

        {/* Filters */}
        <section style={card}>
          <div className={layoutStyles.extracted3}>
            <div>
              <h2 style={titleMd}>Filters</h2>
              <div style={hint}>Search by name/email/job title. Filter by U-Crane role.</div>
            </div>
            <div className={layoutStyles.extracted4}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, ...chip, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showOnlyVisible}
                  onChange={(e) => setShowOnlyVisible(e.target.checked)}
                />
                Visible only
              </label>
            </div>
          </div>

          <div className={layoutStyles.extracted5}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search crew (name, email, job titles, U-Crane roles)…"
              className={layoutStyles.extracted6}
            />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={layoutStyles.extracted7}>
              <option value="all">All roles</option>
              {UCRANE_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Table */}
        <section style={card}>
          <div className={layoutStyles.extracted8}>
            <div>
              <h2 style={titleMd}>Crew List</h2>
              <div style={hint}>
                Employees (from <code>employees</code>) + Freelancers (from <code>uCraneFreelancers</code>).
                Freelancers can be edited here.
              </div>
            </div>
            <div style={chip}>{filtered.length} results</div>
          </div>

          <div style={tableWrap}>
            <table className={layoutStyles.extracted9}>
              <colgroup>
                <col className={layoutStyles.extracted10} />
                <col className={layoutStyles.extracted11} />
                <col className={layoutStyles.extracted12} />
                <col className={layoutStyles.extracted13} />
                <col className={layoutStyles.extracted14} />
              </colgroup>
              <thead>
                <tr>
                  <th style={th}>Person</th>
                  <th style={th}>Type / Titles</th>
                  <th style={th}>Visible</th>
                  <th style={th}>U-Crane Roles</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const name = getDisplayName(row);
                  const email = row?.email ? String(row.email) : "";
                  const titles = asJobTitles(row);
                  const roles = Array.isArray(row.uCraneRoles) ? row.uCraneRoles : [];
                  const rowKey = `${row.__collection}:${row.id}`;
                  const savingThis = savingKey === rowKey;

                  const isFreelancer = row.__collection === "uCraneFreelancers";

                  return (
                    <tr
                      key={rowKey}
                      style={{
                        background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-surface-subtle)",
                        opacity: savingThis ? 0.65 : 1,
                        transition: "opacity .12s ease",
                      }}
                    >
                      <td className={layoutStyles.extracted15}>
                        {isFreelancer ? (
                          <div className={layoutStyles.extracted16}>
                            <div style={{ fontWeight: 900, color: UI.text }}>
                              <input
                                value={row.name || ""}
                                onChange={(e) => saveFreelancerField(row, "name", e.target.value)}
                                className={layoutStyles.extracted17}
                                placeholder="Freelancer name"
                              />
                            </div>
                            <input
                              value={row.email || ""}
                              onChange={(e) => saveFreelancerField(row, "email", e.target.value)}
                              className={layoutStyles.extracted18}
                              placeholder="Email"
                            />
                            <input
                              value={row.phone || ""}
                              onChange={(e) => saveFreelancerField(row, "phone", e.target.value)}
                              className={layoutStyles.extracted19}
                              placeholder="Phone"
                            />
                            <textarea
                              value={row.notes || ""}
                              onChange={(e) => saveFreelancerField(row, "notes", e.target.value)}
                              className={layoutStyles.extracted20}
                              placeholder="Notes (rates, availability, etc.)"
                            />
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 900, color: UI.text }}>{name}</div>
                            {email && <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>{email}</div>}
                            <div style={{ fontSize: 12, color: UI.muted, marginTop: 6 }}>
                              Doc ID: <code className={layoutStyles.extracted21}>{row.id}</code>
                            </div>
                          </>
                        )}
                      </td>

                      <td className={layoutStyles.extracted22}>
                        <div className={layoutStyles.extracted23}>
                          <span style={{ ...chip, background: isFreelancer ? "var(--color-warning-soft)" : "var(--color-surface-hover)", borderColor: isFreelancer ? "var(--color-warning-border)" : "var(--color-border)" }}>
                            {isFreelancer ? "Freelancer" : "Employee"}
                          </span>
                          {!isFreelancer &&
                            (titles.length ? (
                              titles.map((t, idx) => (
                                <span key={idx} style={chip}>
                                  {t}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: UI.muted }}>—</span>
                            ))}
                        </div>
                      </td>

                      <td className={layoutStyles.extracted24}>
                        <button
                          type="button"
                          onClick={() => toggleVisible(row)}
                          style={{ ...pill(!!row.uCraneVisible), justifyContent: "center", minWidth: 120 }}
                          disabled={savingThis}
                        >
                          {row.uCraneVisible ? "Visible Yes" : "Hidden"}
                        </button>
                      </td>

                      <td className={layoutStyles.extracted25}>
                        <div className={layoutStyles.extracted26}>
                          {UCRANE_ROLES.map((r) => {
                            const active = roles.some((x) => String(x).trim() === r.key);
                            return (
                              <button
                                key={r.key}
                                type="button"
                                onClick={() => toggleRole(row, r.key)}
                                style={pill(active)}
                                disabled={savingThis}
                                title={active ? "Click to remove role" : "Click to add role"}
                              >
                                {active ? "Yes" : "+"} {r.label}
                              </button>
                            );
                          })}
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12, color: UI.muted }}>
                          Stored keys:{" "}
                          <code className={layoutStyles.extracted27}>{roles.length ? roles.join(", ") : "none"}</code>
                        </div>
                      </td>

                      <td className={layoutStyles.extracted28}>
                        {isFreelancer ? (
                          <button
                            type="button"
                            style={btn("danger")}
                            onClick={() => deleteFreelancer(row)}
                            disabled={savingKey === `del:${row.id}`}
                            title="Delete freelancer"
                          >
                            Delete
                          </button>
                        ) : (
                          <span style={{ color: UI.muted, fontSize: 12 }}>
                            Edit employees in HR
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!filtered.length && (
                  <tr>
                    <td className={layoutStyles.extracted29} colSpan={5}>
                      <div style={{ color: UI.muted, fontWeight: 700 }}>No results.</div>
                      <div style={{ color: UI.muted, fontSize: 12, marginTop: 6 }}>
                        Try clearing filters or searching a different name/job title.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, color: UI.muted, fontSize: 12, lineHeight: 1.4 }}>
            <b>Next step (to make Create Booking obey this):</b> your Create U-Crane page must filter crew by
            <code> uCraneVisible </code> + <code> uCraneRoles </code> (instead of only <code>jobTitle</code>).
            If you paste that file path you’re using for U-Crane create, I’ll wire it in one go.
          </div>
        </section>

        {/* Add Freelancer Modal */}
        {addOpen && (
          <div
            className={layoutStyles.extracted30}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAddOpen(false);
            }}
          >
            <div
              style={{
                ...surface,
                width: 620,
                maxWidth: "95vw",
                padding: 16,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className={layoutStyles.extracted31}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: UI.text }}>Add Freelancer</h3>
                  <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                    Saves into Firestore: <code>uCraneFreelancers</code>
                  </div>
                </div>
                <button type="button" style={btn("ghost")} onClick={() => setAddOpen(false)}>
                  Close
                </button>
              </div>

              <div className={layoutStyles.extracted32}>
                <input
                  className={layoutStyles.extracted33}
                  placeholder="Full name *"
                  value={newF.name}
                  onChange={(e) => setNewF((s) => ({ ...s, name: e.target.value }))}
                />
                <div className={layoutStyles.extracted34}>
                  <input
                    className={layoutStyles.extracted35}
                    placeholder="Email"
                    value={newF.email}
                    onChange={(e) => setNewF((s) => ({ ...s, email: e.target.value }))}
                  />
                  <input
                    className={layoutStyles.extracted36}
                    placeholder="Phone"
                    value={newF.phone}
                    onChange={(e) => setNewF((s) => ({ ...s, phone: e.target.value }))}
                  />
                </div>

                <textarea
                  className={layoutStyles.extracted37}
                  placeholder="Notes (rates, availability, kit, etc.)"
                  value={newF.notes}
                  onChange={(e) => setNewF((s) => ({ ...s, notes: e.target.value }))}
                />

                <div className={layoutStyles.extracted38}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, ...chip, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!newF.uCraneVisible}
                      onChange={(e) => setNewF((s) => ({ ...s, uCraneVisible: e.target.checked }))}
                    />
                    Visible on Create
                  </label>

                  <div style={{ color: UI.muted, fontSize: 12 }}>
                    Pick their U-Crane roles:
                  </div>
                </div>

                <div className={layoutStyles.extracted39}>
                  {UCRANE_ROLES.map((r) => {
                    const active = (newF.uCraneRoles || []).includes(r.key);
                    return (
                      <button
                        key={r.key}
                        type="button"
                        style={pill(active)}
                        onClick={() =>
                          setNewF((s) => {
                            const cur = Array.isArray(s.uCraneRoles) ? s.uCraneRoles.slice() : [];
                            const exists = cur.includes(r.key);
                            const next = exists ? cur.filter((x) => x !== r.key) : [...cur, r.key];
                            return { ...s, uCraneRoles: next };
                          })
                        }
                      >
                        {active ? "Yes" : "+"} {r.label}
                      </button>
                    );
                  })}
                </div>

                <div className={layoutStyles.extracted40}>
                  <button type="button" style={btn("ghost")} onClick={() => setAddOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" style={btn()} onClick={addFreelancer} disabled={savingKey === "addFreelancer"}>
                    {savingKey === "addFreelancer" ? "Saving…" : "Add Freelancer"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
