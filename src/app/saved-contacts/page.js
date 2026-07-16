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
import { db } from "../../../firebaseConfig";
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
    });
  };

  const cancelEdit = () => {
    setEditingId("");
    setDraft(emptyDraft);
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
        updatedAt: serverTimestamp(),
      }));
      cancelEdit();
    } finally {
      setSaving(false);
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
                    <div>
                      {isEditing ? (
                        <input
                          value={draft.name}
                          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                          className={layoutStyles.extracted4}
                        />
                      ) : (
                        <div style={{ fontWeight: 800, fontSize: 13, color: UI.text }}>{contact.name || "-"}</div>
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
