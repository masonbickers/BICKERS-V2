// src/app/edit-equipment/[id]/page.js
"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Hash,
  MapPin,
  Package,
  Save,
  Trash2,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { requestGuardedNavigation, useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { normalizeVehicleAssetNumber } from "@/app/utils/vehicleAssetNumber";

const BOOKING_REFERENCE_CACHE_PREFIX = "booking-form-reference-data:v1";

const clearBookingReferenceCache = () => {
  if (typeof window === "undefined") return;
  try {
    Object.keys(window.sessionStorage || {}).forEach((key) => {
      if (key.startsWith(BOOKING_REFERENCE_CACHE_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    });
  } catch {
    // Cache invalidation is best-effort.
  }
};

const parseLocalDateOnly = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const addWeeksToISO = (isoDate, weeks) => {
  const d = parseLocalDateOnly(isoDate);
  const w = Number(weeks || 0);
  if (!d || !w) return "";
  d.setDate(d.getDate() + w * 7);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const NEW_CATEGORY_OPTION = "__new_category__";

const formatUKDate = (isoDate) => {
  const date = parseLocalDateOnly(isoDate);
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const getInspectionState = (isoDate) => {
  const dueDate = parseLocalDateOnly(isoDate);
  if (!dueDate) {
    return {
      tone: "neutral",
      label: "Not scheduled",
      detail: "Add the last inspection and frequency to create a schedule.",
      Icon: CalendarDays,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const days = Math.round((dueDate.getTime() - today.getTime()) / 86400000);

  if (days < 0) {
    const overdueDays = Math.abs(days);
    return {
      tone: "danger",
      label: `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`,
      detail: `Inspection was due ${formatUKDate(isoDate)}.`,
      Icon: AlertTriangle,
    };
  }
  if (days === 0) {
    return {
      tone: "warning",
      label: "Due today",
      detail: `Inspection is due ${formatUKDate(isoDate)}.`,
      Icon: Clock3,
    };
  }
  if (days <= 30) {
    return {
      tone: "warning",
      label: `Due in ${days} day${days === 1 ? "" : "s"}`,
      detail: `Next inspection is ${formatUKDate(isoDate)}.`,
      Icon: Clock3,
    };
  }
  return {
    tone: "success",
    label: "Inspection in date",
    detail: `Next inspection is ${formatUKDate(isoDate)}.`,
    Icon: CheckCircle2,
  };
};

export default function EditEquipmentPage() {
  const router = useRouter();
  const { id } = useParams();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [equipment, setEquipment] = useState(null);
  const [existingCategories, setExistingCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState("");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "equipment", operation: "load equipment categories" });
      setExistingCategories([]);
      return;
    }
    const loadCats = async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "equipment", dataAccessState));
        const cats = snap.docs.map((d) => d.data()?.category).filter(Boolean);
        const unique = Array.from(new Set(cats)).sort((a, b) => String(a).localeCompare(String(b)));
        setExistingCategories(unique);
      } catch (e) {
        if (!handleFirestoreAccessError(e, { collectionName: "equipment", operation: "load equipment categories" })) {
          console.error("Load equipment categories failed:", e);
        }
      }
    };
    loadCats();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const fetchEquipment = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const refDoc = doc(db, "equipment", id);
        const snap = await getDoc(refDoc);
        if (snap.exists()) {
          const rawEquipment = { id: snap.id, ...snap.data() };
          const assetNumber = normalizeVehicleAssetNumber(
            rawEquipment.asset || rawEquipment.assetNumber || rawEquipment.sageAssetNumber
          );
          const nextEquipment = {
            ...rawEquipment,
            asset: assetNumber,
            assetNumber,
            sageAssetNumber: assetNumber,
          };
          setEquipment(nextEquipment);
          setInitialSnapshot(JSON.stringify(nextEquipment));
        } else {
          systemDialogs.showSystemNotification("Equipment not found.");
          router.push("/equipment");
        }
      } catch (e) {
        console.error("Fetch equipment failed:", e);
        systemDialogs.showSystemNotification("Failed to load equipment.");
      } finally {
        setLoading(false);
      }
    };
    fetchEquipment();
  }, [id, router]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "category") {
      if (value === NEW_CATEGORY_OPTION) {
        setIsCreatingCategory(true);
        setEquipment((prev) => ({ ...(prev || {}), category: newCategory.trim() }));
        return;
      }
      setIsCreatingCategory(false);
      setNewCategory("");
      setEquipment((prev) => ({ ...(prev || {}), category: value }));
      return;
    }

    const numeric = ["inspectionFrequency"];
    const nextValue =
      numeric.includes(name) ? (value === "" ? "" : String(value).replace(/[^\d]/g, "")) : value;

    setEquipment((prev) => ({ ...(prev || {}), [name]: nextValue }));
  };

  useEffect(() => {
    setEquipment((prev) => {
      if (!prev) return prev;
      const li = prev.lastInspection;
      const fq = prev.inspectionFrequency;
      if (!li || !fq) return prev;
      const calc = addWeeksToISO(li, fq);
      if (!calc || prev.nextInspection === calc) return prev;
      return { ...prev, nextInspection: calc };
    });
  }, [equipment?.lastInspection, equipment?.inspectionFrequency]);

  const canSave = useMemo(() => {
    if (!equipment) return false;
    return (equipment.name || "").trim() && (equipment.category || "").trim();
  }, [equipment]);

  const hasUnsavedChanges = useMemo(() => {
    if (!equipment || !initialSnapshot) return false;
    return JSON.stringify(equipment) !== initialSnapshot;
  }, [equipment, initialSnapshot]);

  const handleSave = async (options = {}) => {
    if (!equipment || !id || saving) return false;
    if (!canSave) {
      systemDialogs.showSystemNotification("Please fill Name and Category.");
      return false;
    }

    const { navigateOnSuccess = true } = options;

    setSaving(true);
    try {
      const refDoc = doc(db, "equipment", id);
      const { id: _ignore, ...rest } = equipment;
      const assetNumber = normalizeVehicleAssetNumber(
        rest.asset || rest.assetNumber || rest.sageAssetNumber
      );

      const payload = {
        ...rest,
        name: (rest.name || "").trim(),
        category: (rest.category || "").trim(),
        serialNumber: (rest.serialNumber || "").trim(),
        asset: assetNumber,
        assetNumber,
        sageAssetNumber: assetNumber,
        location: (rest.location || "").trim(),
        status: rest.status || "Available",
        updatedAt: serverTimestamp(),
      };

      await updateDoc(refDoc, tenantPayload(dataAccessState, payload));
      clearBookingReferenceCache();
      systemDialogs.showSystemNotification("Equipment updated.");
      setInitialSnapshot(JSON.stringify({ ...equipment, ...payload }));
      if (navigateOnSuccess) {
        router.push("/equipment");
        router.refresh?.();
      }
      return true;
    } catch (e) {
      console.error("Update equipment failed:", e);
      systemDialogs.showSystemNotification("Could not save changes.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || deleting) return;
    const ok = await systemDialogs.confirmSystem("Are you sure you want to delete this equipment?");
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, "equipment", id));
      systemDialogs.showSystemNotification("Equipment deleted.");
      router.push("/equipment");
      router.refresh?.();
    } catch (e) {
      console.error("Delete equipment failed:", e);
      systemDialogs.showSystemNotification("Failed to delete equipment.");
    } finally {
      setDeleting(false);
    }
  };

  const inspectionState = useMemo(
    () => getInspectionState(equipment?.nextInspection),
    [equipment?.nextInspection]
  );

  useUnsavedChangesGuard({
    enabled: !loading,
    isDirty: hasUnsavedChanges && !saving && !deleting,
    onSave: () => handleSave({ navigateOnSuccess: false }),
  });

  if (loading) {
    return (
      <HeaderSidebarLayout showBackButton={false}>
        <div className={layoutStyles.page}>
          <div className={layoutStyles.loadingCard}>Loading equipment...</div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  if (!equipment) return null;
  const InspectionIcon = inspectionState.Icon;

  return (
    <HeaderSidebarLayout showBackButton={false}>
      <main className={layoutStyles.page} data-sidebar-page>
        <header className={layoutStyles.header} data-sidebar-page-header>
          <div className={layoutStyles.headingBlock}>
            <button
              type="button"
              className={layoutStyles.backLink}
              onClick={() => requestGuardedNavigation(() => router.back())}
              disabled={saving || deleting}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              Equipment overview
            </button>
            <div className={layoutStyles.titleRow}>
              <span className={layoutStyles.titleIcon} aria-hidden="true">
                <Package size={20} />
              </span>
              <div>
                <div className={layoutStyles.eyebrow}>Edit equipment</div>
                <h1>{equipment.name || "Unnamed equipment"}</h1>
                <p>Update the record, location and inspection schedule.</p>
              </div>
            </div>
          </div>

          <div className={layoutStyles.headerActions}>
            {hasUnsavedChanges ? <span className={layoutStyles.unsaved}>Unsaved changes</span> : null}
            <button
              type="button"
              className={`${layoutStyles.button} ${layoutStyles.dangerButton}`}
              onClick={handleDelete}
              disabled={saving || deleting}
              title="Delete equipment"
            >
              <Trash2 size={15} aria-hidden="true" />
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <button
              type="button"
              className={`${layoutStyles.button} ${layoutStyles.primaryButton}`}
              onClick={() => handleSave()}
              disabled={!canSave || saving || deleting}
              title={!canSave ? "Fill in the name and category" : "Save equipment changes"}
            >
              <Save size={15} aria-hidden="true" />
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </header>

        <section className={layoutStyles.summaryGrid} aria-label="Equipment summary">
          <div className={layoutStyles.summaryItem}>
            <span className={layoutStyles.summaryIcon}><Hash size={16} aria-hidden="true" /></span>
            <span><small>Asset number</small><strong>{equipment.asset || "Not assigned"}</strong></span>
          </div>
          <div className={layoutStyles.summaryItem}>
            <span className={layoutStyles.summaryIcon}><Package size={16} aria-hidden="true" /></span>
            <span><small>Category</small><strong>{equipment.category || "Not assigned"}</strong></span>
          </div>
          <div className={layoutStyles.summaryItem}>
            <span className={layoutStyles.summaryIcon}><MapPin size={16} aria-hidden="true" /></span>
            <span><small>Current location</small><strong>{equipment.location || "Not recorded"}</strong></span>
          </div>
          <div className={layoutStyles.summaryItem}>
            <span className={layoutStyles.statusDot} data-status={equipment.status || "Available"} aria-hidden="true" />
            <span><small>Availability</small><strong>{equipment.status || "Available"}</strong></span>
          </div>
        </section>

        <div className={layoutStyles.contentGrid}>
          <section className={layoutStyles.panel}>
            <div className={layoutStyles.sectionHeading}>
              <div><h2>Equipment information</h2><p>Identification and booking details shown across the system.</p></div>
            </div>

            <div className={layoutStyles.detailsGrid}>
              <div className={layoutStyles.fieldWide}>
                <label className={layoutStyles.label} htmlFor="equipment-name">Name <span>*</span></label>
                <input id="equipment-name" name="name" value={equipment.name || ""} onChange={handleChange} className={layoutStyles.control} placeholder="e.g., Monitor Kit" />
              </div>

              <div>
                <label className={layoutStyles.label} htmlFor="equipment-serial">Serial number</label>
                <input id="equipment-serial" name="serialNumber" value={equipment.serialNumber || ""} onChange={handleChange} className={layoutStyles.control} placeholder="Optional" />
              </div>

              <div>
                <label className={layoutStyles.label} htmlFor="equipment-category">Category <span>*</span></label>
                <select id="equipment-category" name="category" value={isCreatingCategory ? NEW_CATEGORY_OPTION : equipment.category || ""} onChange={handleChange} className={layoutStyles.control}>
                  <option value="">Select category...</option>
                  {existingCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                  {equipment.category && !existingCategories.includes(equipment.category) ? <option value={equipment.category}>{equipment.category}</option> : null}
                  <option value={NEW_CATEGORY_OPTION}>+ Add new category</option>
                </select>
                {isCreatingCategory ? (
                  <input
                    value={newCategory}
                    onChange={(event) => {
                      const next = event.target.value;
                      setNewCategory(next);
                      setEquipment((previous) => ({ ...(previous || {}), category: next }));
                    }}
                    className={`${layoutStyles.control} ${layoutStyles.newCategoryInput}`}
                    placeholder="Type new category name"
                    required
                  />
                ) : null}
                <div className={layoutStyles.helpText}>Controls grouping in Equipment Overview.</div>
              </div>

              <div>
                <label className={layoutStyles.label} htmlFor="equipment-status">Status</label>
                <select id="equipment-status" name="status" value={equipment.status || "Available"} onChange={handleChange} className={layoutStyles.control}>
                  <option value="Available">Available</option>
                  <option value="Not Available">Not Available</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Off-site">Off-site</option>
                </select>
              </div>

              <div>
                <label className={layoutStyles.label} htmlFor="equipment-asset">Asset number</label>
                <input id="equipment-asset" name="asset" value={equipment.asset || ""} onChange={handleChange} className={layoutStyles.control} placeholder="Optional" />
              </div>

              <div className={layoutStyles.fieldWide}>
                <label className={layoutStyles.label} htmlFor="equipment-location">Location</label>
                <input id="equipment-location" name="location" value={equipment.location || ""} onChange={handleChange} className={layoutStyles.control} placeholder="e.g., Workshop / Truck 2" />
              </div>
            </div>
          </section>

          <section className={`${layoutStyles.panel} ${layoutStyles.inspectionPanel}`}>
            <div className={layoutStyles.sectionHeading}>
              <div><h2>Inspection schedule</h2><p>Keep the compliance cycle current.</p></div>
            </div>

            <div className={layoutStyles.inspectionFields}>
              <div>
                <label className={layoutStyles.label} htmlFor="last-inspection">Last inspection</label>
                <input id="last-inspection" type="date" name="lastInspection" value={equipment.lastInspection || ""} onChange={handleChange} className={layoutStyles.control} />
              </div>
              <div>
                <label className={layoutStyles.label} htmlFor="inspection-frequency">Frequency (weeks)</label>
                <input id="inspection-frequency" name="inspectionFrequency" value={equipment.inspectionFrequency || ""} onChange={handleChange} className={layoutStyles.control} inputMode="numeric" placeholder="e.g., 26" />
              </div>
              <div className={layoutStyles.nextInspectionField}>
                <label className={layoutStyles.label} htmlFor="next-inspection">Next inspection due</label>
                <input id="next-inspection" type="date" name="nextInspection" value={equipment.nextInspection || ""} onChange={handleChange} className={layoutStyles.control} />
                <div className={layoutStyles.helpText}>Auto-calculated from the last inspection and frequency; edit if needed.</div>
              </div>
            </div>

            <div className={layoutStyles.inspectionState} data-tone={inspectionState.tone}>
              <span className={layoutStyles.inspectionStateIcon} aria-hidden="true"><InspectionIcon size={18} /></span>
              <span><strong>{inspectionState.label}</strong><small>{inspectionState.detail}</small></span>
            </div>
          </section>

          <section className={`${layoutStyles.panel} ${layoutStyles.notesPanel}`}>
            <div className={layoutStyles.sectionHeading}>
              <div><h2>Operational notes</h2><p>Record issues, missing parts, usage context or certificate references.</p></div>
              <span className={layoutStyles.characterCount}>{(equipment.notes || "").length} characters</span>
            </div>
            <textarea id="equipment-notes" name="notes" value={equipment.notes || ""} onChange={handleChange} className={`${layoutStyles.control} ${layoutStyles.textarea}`} placeholder="Usage notes, missing parts, inspection notes, certificates..." />
          </section>
        </div>
      </main>
    </HeaderSidebarLayout>
  );
}
