"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { normaliseCustomerFinanceProfile } from "../utils/accountingMappings.js";

const UI = UI_TOKENS;

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const chip = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-subtle)",
  color: UI.text,
  fontSize: 10,
  fontWeight: 700,
};

const emptyDraft = {
  id: "",
  name: "",
  email: "",
  phone: "",
  department: "",
  financeProfile: normaliseCustomerFinanceProfile(),
};

const norm = (value = "") => String(value || "").trim().toLowerCase();

export default function SavedContactsPage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [sageQuery, setSageQuery] = useState("");
  const [sageLookup, setSageLookup] = useState(null);
  const [sageLookupError, setSageLookupError] = useState("");
  const [sageLookupBusy, setSageLookupBusy] = useState(false);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "contacts", operation: "load saved contacts" });
      setContacts([]);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "contacts", dataAccessState), (snapshot) => {
      setContacts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) })));
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  const filteredContacts = useMemo(() => {
    const q = norm(search);
    const sorted = [...contacts].sort((a, b) => {
      const aLabel = `${String(a?.name || "").trim()} ${String(a?.department || "").trim()}`.trim().toLowerCase();
      const bLabel = `${String(b?.name || "").trim()} ${String(b?.department || "").trim()}`.trim().toLowerCase();
      return aLabel.localeCompare(bLabel);
    });

    if (!q) return sorted;
    return sorted.filter((contact) =>
      [
        contact?.name,
        contact?.email,
        contact?.phone,
        contact?.number,
        contact?.department,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [contacts, search]);

  const startEdit = (contact) => {
    setEditingId(contact.id);
    setDraft({
      id: contact.id,
      name: String(contact?.name || ""),
      email: String(contact?.email || ""),
      phone: String(contact?.phone || contact?.number || ""),
      department: String(contact?.department || ""),
      financeProfile: normaliseCustomerFinanceProfile(contact),
    });
    setSageQuery(
      String(
        contact.financeProfile?.billingLegalName ||
        contact.name ||
        ""
      )
    );
    setSageLookup(null);
    setSageLookupError("");
  };

  const cancelEdit = () => {
    setEditingId("");
    setDraft(emptyDraft);
    setSageLookup(null);
    setSageLookupError("");
  };

  const saveEdit = async () => {
    if (!draft.id || saving) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "contacts", draft.id), tenantPayload(dataAccessState, {
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        number: draft.phone.trim(),
        department: draft.department.trim(),
        financeProfile: {
          ...draft.financeProfile,
        },
        updatedAt: serverTimestamp(),
      }));
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const authenticatedRequest = async (url, options = {}) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Sign in again before searching Sage.");
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Sage customer lookup failed.");
    return body;
  };

  const pollSageLookup = async (lookupJobId) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const body = await authenticatedRequest(
        `/api/integrations/sage50/customer-lookups?lookupJobId=${encodeURIComponent(lookupJobId)}`
      );
      setSageLookup(body.lookup);
      if (["succeeded", "failed", "expired", "cancelled"].includes(body.lookup?.status)) {
        return body.lookup;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error("Sage lookup is still processing. Try refreshing the search.");
  };

  const searchSageCustomers = async () => {
    if (!draft.id || sageLookupBusy) return;
    setSageLookupBusy(true);
    setSageLookupError("");
    setSageLookup(null);
    try {
      const body = await authenticatedRequest(
        "/api/integrations/sage50/customer-lookups",
        {
          method: "POST",
          body: JSON.stringify({ contactId: draft.id, query: sageQuery }),
        }
      );
      setSageLookup(body.lookup);
      await pollSageLookup(body.lookup.lookupJobId);
    } catch (error) {
      setSageLookupError(error?.message || String(error));
    } finally {
      setSageLookupBusy(false);
    }
  };

  const confirmSageMapping = async (result) => {
    if (!sageLookup?.lookupJobId || sageLookupBusy) return;
    if (!window.confirm(`Map ${result.accountReference} · ${result.name} to ${draft.name}?`)) return;
    setSageLookupBusy(true);
    setSageLookupError("");
    try {
      await authenticatedRequest(
        `/api/integrations/sage50/customer-lookups/${encodeURIComponent(sageLookup.lookupJobId)}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({ sageCustomerId: result.sageCustomerId }),
        }
      );
      setDraft((current) => ({
        ...current,
        financeProfile: {
          ...current.financeProfile,
          sageCustomerId: result.sageCustomerId,
          sageCustomerMappingStatus: "mapped",
          sageCustomerMappedAt: new Date().toISOString(),
          sageCustomerMappedBy:
            auth.currentUser?.email || auth.currentUser?.uid || "Authenticated finance user",
        },
      }));
      setSageLookup((current) => ({
        ...current,
        confirmedResult: {
          sageCustomerId: result.sageCustomerId,
          accountReference: result.accountReference,
          name: result.name,
        },
      }));
    } catch (error) {
      setSageLookupError(error?.message || String(error));
    } finally {
      setSageLookupBusy(false);
    }
  };

  const removeContact = async (contact) => {
    const label = contact?.name || contact?.email || "this contact";
    if (!window.confirm(`Delete ${label} from saved contacts?`)) return;
    await deleteDoc(doc(db, "contacts", contact.id));
    if (editingId === contact.id) cancelEdit();
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div
          className={layoutStyles.extracted1}
        >
          <div>
            <h1 style={{ color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 }}>Saved Contacts</h1>
            <div style={{ color: UI.muted, fontSize: 13, marginTop: 4 }}>
              Manage the shared saved-contact list used on create and edit booking.
            </div>
          </div>
          <div className={layoutStyles.extracted2}>
            <span style={chip}>{contacts.length} contacts</span>
            <Link href="/create-booking" style={{ color: UI.brand, fontWeight: 800, textDecoration: "none" }}>
              Back to booking →
            </Link>
          </div>
        </div>

        <div style={{ ...surface, padding: 12, marginBottom: 14 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, department, phone..."
            style={{
              width: "100%",
              padding: "9px 11px",
              borderRadius: UI.radiusSm,
              border: "1px solid var(--color-border)",
              fontSize: 13,
              outline: "none",
              background: "var(--color-surface)",
            }}
          />
        </div>

        <div style={{ ...surface, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 0.9fr) minmax(220px, 1.1fr) minmax(150px, 0.8fr) minmax(130px, 0.7fr) 180px",
              gap: 10,
              padding: "10px 12px",
              color: UI.muted,
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              background: "var(--color-surface-subtle)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div>Name</div>
            <div>Email</div>
            <div>Department</div>
            <div>Phone</div>
            <div>Actions</div>
          </div>

          <div className={layoutStyles.extracted3}>
            {filteredContacts.length ? (
              filteredContacts.map((contact, index) => {
                const isEditing = editingId === contact.id;
                return (
                  <div
                    key={contact.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(180px, 0.9fr) minmax(220px, 1.1fr) minmax(150px, 0.8fr) minmax(130px, 0.7fr) 180px",
                      gap: 10,
                      padding: "10px 12px",
                      alignItems: "center",
                      background: index % 2 ? "var(--color-surface)" : "var(--color-surface)",
                      borderBottom: "1px solid var(--color-brand-soft)",
                    }}
                  >
                    {isEditing ? (
                      <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, paddingBottom: 8 }}>
                        {[
                          ["billingLegalName", "Billing legal name"],
                          ["billingTradingName", "Trading name"],
                          ["accountsPayableContact", "Accounts payable contact"],
                          ["accountsPayableEmail", "Accounts payable email"],
                          ["companyRegistrationNumber", "Company registration no."],
                          ["vatNumber", "VAT number"],
                          ["billingCountry", "Billing country"],
                          ["defaultCurrency", "Currency"],
                          ["defaultPaymentTerms", "Payment terms (days)"],
                          ["poRequirement", "PO requirement"],
                        ].map(([field, label]) => (
                          <label key={field} style={{ display: "grid", gap: 4, color: UI.muted, fontSize: 10, fontWeight: 800 }}>
                            {label}
                            <input
                              value={draft.financeProfile?.[field] ?? ""}
                              type={field === "defaultPaymentTerms" ? "number" : "text"}
                              onChange={(event) => setDraft((previous) => ({
                                ...previous,
                                financeProfile: {
                                  ...previous.financeProfile,
                                  [field]: field === "defaultPaymentTerms" ? Number(event.target.value) : event.target.value,
                                },
                              }))}
                              className={layoutStyles.extracted4}
                            />
                          </label>
                        ))}
                        <label style={{ display: "grid", gap: 4, gridColumn: "span 2", color: UI.muted, fontSize: 10, fontWeight: 800 }}>
                          Billing address
                          <input
                            value={draft.financeProfile?.billingAddress?.line1 || ""}
                            onChange={(event) => setDraft((previous) => ({
                              ...previous,
                              financeProfile: {
                                ...previous.financeProfile,
                                billingAddress: { ...previous.financeProfile.billingAddress, line1: event.target.value },
                              },
                            }))}
                            className={layoutStyles.extracted4}
                          />
                        </label>
                        <div
                          style={{
                            gridColumn: "1 / -1",
                            display: "grid",
                            gap: 8,
                            padding: 10,
                            border: "1px solid var(--color-border)",
                            borderRadius: UI.radiusSm,
                            background: "var(--color-surface-subtle)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                            <div>
                              <strong style={{ color: UI.text, fontSize: 12 }}>Sage 50 customer mapping</strong>
                              <div style={{ color: UI.muted, fontSize: 11, marginTop: 2 }}>
                                {draft.financeProfile?.sageCustomerId
                                  ? `Mapped to ${draft.financeProfile.sageCustomerId}`
                                  : "Not mapped"}
                              </div>
                            </div>
                            <span style={chip}>
                              {draft.financeProfile?.sageCustomerMappingStatus || "unmapped"}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              value={sageQuery}
                              onChange={(event) => setSageQuery(event.target.value)}
                              placeholder="Search Sage account reference or customer name"
                              className={layoutStyles.extracted4}
                              style={{ flex: 1 }}
                            />
                            <button
                              type="button"
                              onClick={searchSageCustomers}
                              disabled={sageLookupBusy || sageQuery.trim().length < 2}
                            >
                              {sageLookupBusy ? "Searching..." : "Search Sage"}
                            </button>
                          </div>
                          {sageLookup?.status && sageLookup.status !== "succeeded" ? (
                            <div style={{ color: UI.muted, fontSize: 11 }}>
                              Lookup status: {String(sageLookup.status).replace(/_/g, " ")}
                            </div>
                          ) : null}
                          {sageLookupError ? (
                            <div style={{ color: "var(--color-danger)", fontSize: 11 }}>
                              {sageLookupError}
                            </div>
                          ) : null}
                          {sageLookup?.status === "succeeded" ? (
                            sageLookup.results?.length ? (
                              <div style={{ display: "grid", gap: 6 }}>
                                {sageLookup.results.map((result) => (
                                  <div
                                    key={result.sageCustomerId}
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "120px minmax(180px, 1fr) minmax(140px, 1fr) auto",
                                      gap: 8,
                                      alignItems: "center",
                                      padding: 8,
                                      border: "1px solid var(--color-border)",
                                      borderRadius: UI.radiusSm,
                                      background: "var(--color-surface)",
                                      fontSize: 11,
                                    }}
                                  >
                                    <strong>{result.accountReference}</strong>
                                    <span>{result.name}</span>
                                    <span style={{ color: UI.muted }}>
                                      {[result.postcode, result.email].filter(Boolean).join(" · ") || "No contact details"}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={
                                        sageLookupBusy ||
                                        !result.isActive ||
                                        sageLookup.confirmedResult
                                      }
                                      onClick={() => confirmSageMapping(result)}
                                    >
                                      {!result.isActive
                                        ? "Inactive"
                                        : sageLookup.confirmedResult?.sageCustomerId === result.sageCustomerId
                                        ? "Mapped"
                                        : "Confirm mapping"}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ color: UI.muted, fontSize: 11 }}>
                                No matching Sage customer accounts found.
                              </div>
                            )
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div>
                      {isEditing ? (
                        <input
                          value={draft.name}
                          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                          className={layoutStyles.extracted4}
                        />
                      ) : (
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 13, color: UI.text }}>{contact.name || "-"}</div>
                          {contact.financeProfile?.sageCustomerId ? (
                            <div style={{ color: UI.muted, fontSize: 10, marginTop: 2 }}>
                              Sage: {contact.financeProfile.sageCustomerId}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div>
                      {isEditing ? (
                        <input
                          value={draft.email}
                          onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
                          className={layoutStyles.extracted5}
                        />
                      ) : (
                        <div style={{ fontWeight: 700, fontSize: 13, color: UI.text, wordBreak: "break-word" }}>{contact.email || "-"}</div>
                      )}
                    </div>

                    <div>
                      {isEditing ? (
                        <input
                          value={draft.department}
                          onChange={(e) => setDraft((prev) => ({ ...prev, department: e.target.value }))}
                          className={layoutStyles.extracted6}
                        />
                      ) : (
                        <div style={{ fontSize: 12, color: UI.muted }}>{contact.department || "-"}</div>
                      )}
                    </div>

                    <div>
                      {isEditing ? (
                        <input
                          value={draft.phone}
                          onChange={(e) => setDraft((prev) => ({ ...prev, phone: e.target.value }))}
                          className={layoutStyles.extracted7}
                        />
                      ) : (
                        <div style={{ fontSize: 12, color: UI.muted }}>{contact.phone || contact.number || "-"}</div>
                      )}
                    </div>

                    <div className={layoutStyles.extracted8}>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={saving}
                            style={{
                              padding: "7px 10px",
                              borderRadius: 999,
                              border: "1px solid var(--color-info-border)",
                              background: "var(--color-info-soft)",
                              color: UI.brand,
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            style={{
                              padding: "7px 10px",
                              borderRadius: 999,
                              border: "1px solid var(--color-border)",
                              background: "var(--color-surface)",
                              color: UI.text,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(contact)}
                            style={{
                              padding: "7px 10px",
                              borderRadius: 999,
                              border: "1px solid var(--color-border)",
                              background: "var(--color-surface)",
                              color: UI.text,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeContact(contact)}
                            className={layoutStyles.extracted9}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: 16, color: UI.muted, fontSize: 12 }}>No saved contacts match the current search.</div>
            )}
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
