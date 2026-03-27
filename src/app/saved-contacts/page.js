"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#163a63",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const chip = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
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
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "contacts"), (snapshot) => {
      setContacts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) })));
    });
    return () => unsub();
  }, []);

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
      await updateDoc(doc(db, "contacts", draft.id), {
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        number: draft.phone.trim(),
        department: draft.department.trim(),
        updatedAt: serverTimestamp(),
      });
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
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 }}>Saved Contacts</h1>
            <div style={{ color: UI.muted, fontSize: 13, marginTop: 4 }}>
              Manage the shared saved-contact list used on create and edit booking.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
              border: "1px solid #d1d5db",
              fontSize: 13,
              outline: "none",
              background: "#fff",
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
              background: "#f8fafc",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <div>Name</div>
            <div>Email</div>
            <div>Department</div>
            <div>Phone</div>
            <div>Actions</div>
          </div>

          <div style={{ display: "grid" }}>
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
                      background: index % 2 ? "#fcfdff" : "#ffffff",
                      borderBottom: "1px solid #eef2f7",
                    }}
                  >
                    <div>
                      {isEditing ? (
                        <input
                          value={draft.name}
                          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
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
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
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
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
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
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                        />
                      ) : (
                        <div style={{ fontSize: 12, color: UI.muted }}>{contact.phone || contact.number || "-"}</div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={saving}
                            style={{
                              padding: "7px 10px",
                              borderRadius: 999,
                              border: "1px solid #bfdbfe",
                              background: "#eff6ff",
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
                              border: "1px solid #e5e7eb",
                              background: "#fff",
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
                              border: "1px solid #e5e7eb",
                              background: "#fff",
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
                            style={{
                              padding: "7px 10px",
                              borderRadius: 999,
                              border: "1px solid #fecaca",
                              background: "#fff",
                              color: "#b91c1c",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
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
