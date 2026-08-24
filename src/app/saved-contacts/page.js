"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { BusinessHeaderActions, BusinessPage, BusinessPageHeader } from "@/app/components/BusinessPage";
import { Badge, Button, Input } from "@/app/components/ui";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  SINGLE_COMPANY_ID,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import {
  analyseSavedContactDuplicates,
  createMergedContactPayload,
} from "@/app/utils/savedContactDuplicates";
import { normaliseCustomerFinanceProfile } from "../utils/accountingMappings.js";
import { useAuth } from "@/app/context/authContext";
import { hasFinanceAccess } from "@/app/utils/accessControl";

const UI = UI_TOKENS;

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
  const searchParams = useSearchParams();
  const { userDoc } = useAuth() || {};
  const canFinance = hasFinanceAccess(userDoc);
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [contacts, setContacts] = useState([]);
  const [financeProfiles, setFinanceProfiles] = useState({});
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [sageQuery, setSageQuery] = useState("");
  const [sageLookup, setSageLookup] = useState(null);
  const [sageLookupError, setSageLookupError] = useState("");
  const [sageLookupBusy, setSageLookupBusy] = useState(false);
  const [duplicateReviewOpen, setDuplicateReviewOpen] = useState(true);
  const [mergePrimaryIds, setMergePrimaryIds] = useState({});
  const [mergingGroupId, setMergingGroupId] = useState("");
  const [mergeError, setMergeError] = useState("");

  useEffect(() => {
    const querySearch = searchParams.get("search") || "";
    if (querySearch) setSearch(querySearch);
  }, [searchParams]);

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

  useEffect(() => {
    let cancelled = false;
    if (!canFinance) {
      setFinanceProfiles({});
      return undefined;
    }
    const companyId = resolveDataAccess(dataAccessState).companyId || SINGLE_COMPANY_ID;
    const profileUrl = `/api/finance/contact-profiles${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`;
    auth.currentUser?.getIdToken().then((token) => fetch(profileUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load finance profiles.");
      if (!cancelled) {
        setFinanceProfiles(Object.fromEntries((body.profiles || []).map((profile) => [profile.contactId || profile.id, profile])));
      }
    }).catch(() => {
      if (!cancelled) setFinanceProfiles({});
    });
    return () => { cancelled = true; };
  }, [accessKey, canFinance, dataAccessState]);

  const filteredContacts = useMemo(() => {
    const q = norm(search);
    const visibleContacts = contacts.map((contact) => canFinance && financeProfiles[contact.id]
      ? { ...contact, financeProfile: financeProfiles[contact.id] }
      : contact);
    const sorted = [...visibleContacts].sort((a, b) => {
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
  }, [canFinance, contacts, financeProfiles, search]);

  const duplicateAudit = useMemo(() => analyseSavedContactDuplicates(contacts), [contacts]);

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
        updatedAt: serverTimestamp(),
      }));
      if (canFinance) {
        const body = await authenticatedRequest(
          `/api/finance/contact-profiles/${encodeURIComponent(draft.id)}`,
          { method: "PUT", body: JSON.stringify({ profile: draft.financeProfile }) }
        );
        if (body.profile) {
          setFinanceProfiles((current) => ({ ...current, [draft.id]: body.profile }));
        }
      }
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
    if (!await systemDialogs.confirmSystem(`Map ${result.accountReference} · ${result.name} to ${draft.name}?`)) return;
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
    if (!await systemDialogs.confirmSystem(`Delete ${label} from saved contacts?`)) return;
    await deleteDoc(doc(db, "contacts", contact.id));
    if (editingId === contact.id) cancelEdit();
  };

  const mergeDuplicateGroup = async (group) => {
    if (mergingGroupId) return;
    const primaryId = mergePrimaryIds[group.id] || group.contacts[0]?.id;
    const primary = group.contacts.find((contact) => contact.id === primaryId);
    if (!primary) return;
    const redundantContacts = group.contacts.filter((contact) => contact.id !== primaryId);
    const primaryLabel = primary.name || primary.email || "the selected primary contact";
    if (!await systemDialogs.confirmSystem(
      `Merge ${group.contacts.length} records into ${primaryLabel}? This keeps alternate details on the primary record and deletes ${redundantContacts.length} redundant record${redundantContacts.length === 1 ? "" : "s"}.`
    )) return;

    setMergingGroupId(group.id);
    setMergeError("");
    try {
      const batch = writeBatch(db);
      batch.update(
        doc(db, "contacts", primaryId),
        tenantPayload(dataAccessState, {
          ...createMergedContactPayload(group.contacts, primaryId),
          updatedAt: serverTimestamp(),
        })
      );
      redundantContacts.forEach((contact) => batch.delete(doc(db, "contacts", contact.id)));
      await batch.commit();
      if (group.contacts.some((contact) => contact.id === editingId)) cancelEdit();
      setMergePrimaryIds((current) => {
        const next = { ...current };
        delete next[group.id];
        return next;
      });
    } catch (error) {
      setMergeError(error?.message || "The contacts could not be merged.");
    } finally {
      setMergingGroupId("");
    }
  };

  return (
    <HeaderSidebarLayout>
      <BusinessPage>
        <BusinessPageHeader
          title="Saved Contacts"
          subtitle="Manage the shared saved-contact list used on create and edit booking."
          actions={<BusinessHeaderActions>
            <Badge variant="info">{contacts.length} contacts</Badge>
            <Button as={Link} href="/create-booking" variant="secondary">Back to booking →</Button>
          </BusinessHeaderActions>}
        />

        {canFinance && (duplicateAudit.strongGroups.length || duplicateAudit.possibleGroups.length) ? (
          <section className={layoutStyles.duplicatePanel} aria-labelledby="duplicate-review-heading">
            <div className={layoutStyles.duplicateHeader}>
              <div>
                <div className={layoutStyles.duplicateTitleRow}>
                  <h2 id="duplicate-review-heading">Duplicate review</h2>
                  <Badge variant={duplicateAudit.strongGroups.length ? "warning" : "info"}>
                    {duplicateAudit.strongGroups.length} strong
                  </Badge>
                  <Badge variant="neutral">{duplicateAudit.possibleGroups.length} possible</Badge>
                </div>
                <p>Choose the primary record in each strong group, then merge. Alternate details are retained.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDuplicateReviewOpen((current) => !current)}
                aria-expanded={duplicateReviewOpen}
              >
                {duplicateReviewOpen ? "Hide groups" : "Show groups"}
              </Button>
            </div>

            {duplicateReviewOpen ? (
              <div className={layoutStyles.duplicateBody}>
                {mergeError ? <div className={layoutStyles.mergeError} role="alert">{mergeError}</div> : null}
                {duplicateAudit.strongGroups.length ? (
                  <div className={layoutStyles.groupList}>
                    {duplicateAudit.strongGroups.map((group, groupIndex) => {
                      const primaryId = mergePrimaryIds[group.id] || group.contacts[0]?.id;
                      return (
                        <article className={layoutStyles.duplicateGroup} key={group.id}>
                          <div className={layoutStyles.groupHeading}>
                            <div>
                              <strong>Duplicate group {groupIndex + 1}</strong>
                              <span>{group.reasons.join(" · ")}</span>
                            </div>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={Boolean(mergingGroupId)}
                              onClick={() => mergeDuplicateGroup(group)}
                            >
                              {mergingGroupId === group.id ? "Merging..." : `Merge ${group.contacts.length} records`}
                            </Button>
                          </div>
                          <div className={layoutStyles.duplicateRecords}>
                            {group.contacts.map((contact) => (
                              <label className={layoutStyles.duplicateRecord} key={contact.id}>
                                <input
                                  type="radio"
                                  name={`primary-${group.id}`}
                                  value={contact.id}
                                  checked={primaryId === contact.id}
                                  onChange={() => setMergePrimaryIds((current) => ({ ...current, [group.id]: contact.id }))}
                                />
                                <span>
                                  <strong>{contact.name || "Unnamed contact"}</strong>
                                  <small>{contact.email || "No email"}</small>
                                  <small>{contact.phone || contact.number || "No phone"} · {contact.department || "No department"}</small>
                                </span>
                                {primaryId === contact.id ? <Badge variant="success">Primary</Badge> : null}
                              </label>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className={layoutStyles.noStrongMatches}>No strong duplicate groups found.</div>
                )}

                {duplicateAudit.possibleGroups.length ? (
                  <div className={layoutStyles.possibleSection}>
                    <h3>Possible matches</h3>
                    <p>These share a name but do not share an email or phone. Review them manually before deleting either record.</p>
                    {duplicateAudit.possibleGroups.map((group) => (
                      <div className={layoutStyles.possibleGroup} key={group.id}>
                        <span>{group.contacts.map((contact) => contact.name || contact.email).join(" / ")}</span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setSearch(group.contacts[0]?.name?.split(" ").at(-1) || "")}
                        >
                          Show in list
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <div style={{ ...surface, padding: 12, marginBottom: 14 }}>
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, department, phone..."
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
                    {isEditing && canFinance ? (
                      <div className={layoutStyles.extracted10}>
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
                          <div className={layoutStyles.extracted11}>
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
                          <div className={layoutStyles.extracted12}>
                            <input
                              value={sageQuery}
                              onChange={(event) => setSageQuery(event.target.value)}
                              placeholder="Search Sage account reference or customer name"
                              className={layoutStyles.extracted4}
                              style={{ flex: 1 }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={searchSageCustomers}
                              disabled={sageLookupBusy || sageQuery.trim().length < 2}
                            >
                              {sageLookupBusy ? "Searching..." : "Search Sage"}
                            </Button>
                          </div>
                          {sageLookup?.status && sageLookup.status !== "succeeded" ? (
                            <div style={{ color: UI.muted, fontSize: 11 }}>
                              Lookup status: {String(sageLookup.status).replace(/_/g, " ")}
                            </div>
                          ) : null}
                          {sageLookupError ? (
                            <div className={layoutStyles.extracted13}>
                              {sageLookupError}
                            </div>
                          ) : null}
                          {sageLookup?.status === "succeeded" ? (
                            sageLookup.results?.length ? (
                              <div className={layoutStyles.extracted14}>
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
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
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
                                    </Button>
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
                          {canFinance && contact.financeProfile?.sageCustomerId ? (
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
                          <Button
                            type="button"
                            onClick={saveEdit}
                            disabled={saving}
                            variant="primary"
                            size="sm"
                          >
                            {saving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            type="button"
                            onClick={cancelEdit}
                            variant="secondary"
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            onClick={() => startEdit(contact)}
                            variant="secondary"
                            size="sm"
                          >
                            Edit
                          </Button>
                          {canFinance ? (
                            <Button
                              type="button"
                              onClick={() => removeContact(contact)}
                              variant="danger"
                              size="sm"
                            >
                              Delete
                            </Button>
                          ) : null}
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
      </BusinessPage>
    </HeaderSidebarLayout>
  );
}
