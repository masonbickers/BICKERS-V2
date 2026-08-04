"use client";

import layoutStyles from "./DashboardMaintenanceModal.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "../../../firebaseConfig";
import EditMaintenanceBookingForm from "./EditMaintenanceBookingForm";
import MaintenanceBookingForm from "./MaintenanceBookingForm";
import {
  completeMaintenanceBooking,
  completeMaintenanceBookingItems,
  deleteMaintenanceBooking,
} from "../utils/maintenanceBookingService";
import {
  MAINTENANCE_JOB_WORKFLOW_STAGES,
  MAINTENANCE_STAGE_LABELS,
  MAINTENANCE_WORKFLOW_VERSION,
  normalizeMaintenanceStage,
  validateMaintenanceStageRequirements,
} from "@/app/utils/maintenanceWorkflowSpec";
import { tenantPayload, useDataAccessState } from "@/app/utils/firestoreAccess";
import { companyStoragePath } from "@/app/utils/storageAccess";
import { ADDITIONAL_MAINTENANCE_WORKFLOWS } from "@/app/utils/maintenanceSchema";
import {
  appendMaintenanceDocumentToHistory,
  buildMaintenanceDocument,
  getCurrentMaintenanceUploader,
  normalizeMaintenanceDocumentList,
  removeMaintenanceDocument,
  removeMaintenanceDocumentFromHistory,
} from "@/app/utils/maintenanceDocuments";
import { buildAdditionalMaintenanceCompletionPatch } from "@/app/utils/additionalMaintenanceCompletion";

const EMPTY_VALUE = "-";

const toJsDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (value) => {
  const d = toJsDate(value);
  return d ? d.toLocaleDateString("en-GB") : EMPTY_VALUE;
};

const fmtText = (value) => {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  return String(value);
};

const titleCase = (value) =>
  String(value || "")
    .trim()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const displayMaintenanceType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "MOT" || normalized === "PMI") return normalized;
  return titleCase(normalized.toLowerCase());
};

const ymd = (value) => {
  const d = toJsDate(value);
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const hasDisplayValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "" && value !== EMPTY_VALUE;

const formatNamedList = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return EMPTY_VALUE;

  const values = items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";

      const name = String(item.name || item.vehicleName || item.label || "").trim();
      const registration = String(item.registration || item.reg || "").trim().toUpperCase();
      if (name && registration) return `${name} (${registration})`;
      return name || registration || "";
    })
    .filter(Boolean);

  return values.length ? values.join(", ") : EMPTY_VALUE;
};

const deriveType = (event = {}) => {
  const kind = String(event.kind || "").toUpperCase();
  if (kind.includes("MOT")) return "MOT";
  if (kind.includes("SERVICE")) return "SERVICE";
  if (kind.includes("INSPECTION")) return "INSPECTION";
  return String(event.maintenanceType || event.type || "MAINTENANCE").toUpperCase();
};

const normalizeWorkflowStageCompat = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "complete") return "completed";
  if (raw === "qa") return "completed";
  if (raw === "awaiting_parts") return "booked";
  return normalizeMaintenanceStage(raw);
};

const prettyField = (field) =>
  String(field || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const safeFileName = (name = "document") =>
  String(name || "document")
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120) || "document";

const documentList = (value) => (Array.isArray(value) ? value.filter((item) => item?.url || item?.name) : []);
const safeArr = (value) => (Array.isArray(value) ? value : []);

export default function DashboardMaintenanceModal({ event, onClose }) {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const [vehicle, setVehicle] = useState(null);
  const [booking, setBooking] = useState(null);
  const [job, setJob] = useState(null);
  const [showBookType, setShowBookType] = useState("");
  const [showEditBooking, setShowEditBooking] = useState(false);
  const [showEditJob, setShowEditJob] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [completingBooking, setCompletingBooking] = useState(false);
  const [completingAppointment, setCompletingAppointment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [jobType, setJobType] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobPlannedDate, setJobPlannedDate] = useState("");
  const [jobDueDate, setJobDueDate] = useState("");
  const [jobPriority, setJobPriority] = useState("normal");
  const [jobStatus, setJobStatus] = useState("planned");
  const [jobNotes, setJobNotes] = useState("");
  const [jobProvider, setJobProvider] = useState("");
  const [jobBookedDate, setJobBookedDate] = useState("");
  const [jobAssignedToName, setJobAssignedToName] = useState("");
  const [jobCompletionNotes, setJobCompletionNotes] = useState("");
  const [jobTotalCost, setJobTotalCost] = useState("");
  const [jobPoNumber, setJobPoNumber] = useState("");
  const [jobInvoiceRef, setJobInvoiceRef] = useState("");
  const [jobEditorMessage, setJobEditorMessage] = useState("");
  const [jobEditorError, setJobEditorError] = useState("");
  const [bookingActionMessage, setBookingActionMessage] = useState("");
  const [bookingActionError, setBookingActionError] = useState("");
  const [maintenanceDocumentFiles, setMaintenanceDocumentFiles] = useState({});
  const [maintenanceDocumentInputVersion, setMaintenanceDocumentInputVersion] = useState(0);
  const [deletingDocumentUrl, setDeletingDocumentUrl] = useState("");
  const [deletedDocumentUrls, setDeletedDocumentUrls] = useState([]);

  const vehicleId = String(event?.vehicleId || "").trim();
  const bookingId = String(event?.__parentId || event?.id || "").trim();
  const eventType = deriveType(event);
  const isSavedMaintenanceBooking = event?.__collection === "maintenanceBookings";
  const isDueEvent =
    !isSavedMaintenanceBooking && (
    event?.__collection === "vehicleDueDates" ||
    event?.kind === "MOT" ||
    event?.kind === "SERVICE" ||
    event?.kind === "INSPECTION" ||
    event?.kind === "MAINTENANCE_APPOINTMENT");
  const isGeneratedMaintenanceAppointment = event?.kind === "MAINTENANCE_APPOINTMENT";
  const isMaintenanceJob = event?.__collection === "maintenanceJobs";
  const isPlannerRecord = event?.__collection === "hgvPlannerHistory";
  const isBookingLikeEvent = isSavedMaintenanceBooking && !!bookingId;
  const eventRecordStatus = String(event?.recordStatus || event?.bookingStatus || "").trim().toLowerCase();
  const isRequestedBooking = isBookingLikeEvent && eventRecordStatus === "requested";
  const canBook =
    !event?.disableBookingActions &&
    (isDueEvent || isRequestedBooking) &&
    !!vehicleId &&
    (eventType === "MOT" || eventType === "SERVICE" || eventType === "INSPECTION");
  const maintenanceAdminRole = String(
    dataAccessState?.userDoc?.role || dataAccessState?.userDoc?.platformRole || ""
  ).trim().toLowerCase();
  const canDeleteBooking =
    isBookingLikeEvent &&
    !isRequestedBooking &&
    ["admin", "platformadmin", "platform_admin"].includes(maintenanceAdminRole);
  const canEditBooking = isBookingLikeEvent && !isRequestedBooking;
  const canManageJob = false;
  const canCompleteGeneratedAppointment = false;

  const generatedAppointmentKinds = useMemo(() => {
    const maintenanceTypeIds = Array.isArray(event?.maintenanceTypeIds)
      ? event.maintenanceTypeIds.map((item) => String(item || "").trim().toLowerCase())
      : event?.maintenanceTypeId
      ? [String(event.maintenanceTypeId).trim().toLowerCase()]
      : [];
    return Object.fromEntries(
      ADDITIONAL_MAINTENANCE_WORKFLOWS.map((workflow) => [
        workflow.key,
        maintenanceTypeIds.includes(workflow.maintenanceTypeId),
      ])
    );
  }, [event]);
  const activeGeneratedWorkflows = ADDITIONAL_MAINTENANCE_WORKFLOWS.filter(
    (workflow) => generatedAppointmentKinds[workflow.key]
  );
  const canAttachGeneratedAppointmentDocuments =
    isBookingLikeEvent &&
    !isRequestedBooking &&
    !!vehicleId &&
    activeGeneratedWorkflows.length > 0;

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      try {
        if (vehicleId) {
          const vSnap = await getDoc(doc(db, "vehicles", vehicleId));
          if (active && vSnap.exists()) {
            setVehicle({ id: vSnap.id, ...(vSnap.data() || {}) });
          }
        }

        if (isBookingLikeEvent && bookingId) {
          const bSnap = await getDoc(doc(db, "maintenanceBookings", bookingId));
          if (active && bSnap.exists()) {
            setBooking({ id: bSnap.id, ...(bSnap.data() || {}) });
          }
        }

        if (event?.__collection === "maintenanceJobs" && bookingId) {
          const jSnap = await getDoc(doc(db, "maintenanceJobs", bookingId));
          if (active && jSnap.exists()) {
            const jobData = { id: jSnap.id, ...(jSnap.data() || {}) };
            setJob(jobData);
            setJobType(String(jobData.type || "").trim().toLowerCase() || "repair");
            setJobTitle(String(jobData.title || "").trim());
            setJobPlannedDate(String(jobData.plannedDate || "").slice(0, 10));
            setJobDueDate(String(jobData.dueDate || "").slice(0, 10));
            setJobPriority(String(jobData.priority || "normal").trim().toLowerCase());
            setJobStatus(normalizeWorkflowStageCompat(jobData.status || "planned"));
            setJobNotes(String(jobData.notes || ""));
            setJobProvider(String(jobData.provider || ""));
            setJobBookedDate(String(jobData.bookedDate || "").slice(0, 10));
            setJobAssignedToName(String(jobData.assignedToName || ""));
            setJobCompletionNotes(String(jobData.completionNotes || ""));
            setJobTotalCost(String(jobData.totalCost || ""));
            setJobPoNumber(String(jobData.poNumber || ""));
            setJobInvoiceRef(String(jobData.invoiceRef || ""));
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [vehicleId, bookingId, event?.__collection, isBookingLikeEvent]);

  const vehicleLabel = useMemo(() => {
    if (vehicle?.name && vehicle?.registration) {
      return `${vehicle.name} (${String(vehicle.registration).toUpperCase()})`;
    }
    if (vehicle?.name) return vehicle.name;
    if (event?.title) return event.title;
    return vehicleId || "Vehicle";
  }, [vehicle, event?.title, vehicleId]);

  const rangeText = useMemo(() => {
    const source = booking || job || event || {};
    const appointment = source.appointmentDate || source.appointmentDateISO;
    if (appointment) return fmtDate(appointment);
    if (source.startDate || source.endDate) {
      const start = fmtDate(source.startDate || source.start);
      const end = fmtDate(source.endDate || source.end);
      if (!hasDisplayValue(end)) return start;
      if (!hasDisplayValue(start)) return end;
      return start === end ? start : `${start} – ${end}`;
    }
    if (source.start || source.end) {
      const start = fmtDate(source.start);
      const end = fmtDate(source.end);
      if (!hasDisplayValue(end)) return start;
      if (!hasDisplayValue(start)) return end;
      return start === end ? start : `${start} – ${end}`;
    }
    return EMPTY_VALUE;
  }, [booking, job, event]);

  const bookingDetails = useMemo(() => {
    const source = booking || job || event || {};
    const appointment = source.appointmentDate || source.appointmentDateISO;
    const start = source.startDate || source.startDateISO || source.start;
    const end = source.endDate || source.endDateISO || source.end;
    const normalizedStatus = String(source.status || source.bookingStatus || event?.status || "").trim().toLowerCase();
    const hasAppointment = !!appointment;
    const hasExplicitRange =
      !!source.startDate ||
      !!source.endDate ||
      !!source.startDateISO ||
      !!source.endDateISO;
    const isSingleDay = hasAppointment && !hasExplicitRange;
    const isMultiDay = hasExplicitRange;

    return {
      status: fmtText(source.status || source.bookingStatus || event?.status),
      bookingType: isMultiDay ? "Multi-day" : isSingleDay ? "Single day" : EMPTY_VALUE,
      isSingleDay,
      isMultiDay,
      appointmentDate: isSingleDay && hasAppointment ? fmtDate(appointment) : EMPTY_VALUE,
      startDate: isMultiDay && start ? fmtDate(start) : EMPTY_VALUE,
      endDate: isMultiDay && end ? fmtDate(end) : EMPTY_VALUE,
      provider: fmtText(source.provider || source.location),
      bookingRef: fmtText(source.bookingRef),
      location: fmtText(source.location),
      cost: fmtText(source.cost),
      notes: fmtText(source.notes),
      vehicles: formatNamedList(source.vehicles),
      equipment: formatNamedList(source.equipment),
      completedDate:
        normalizedStatus === "completed" || normalizedStatus === "complete"
          ? fmtDate(source.completedAtISO || source.endDateISO || source.appointmentDateISO || source.startDateISO)
          : EMPTY_VALUE,
      nextDue:
        eventType === "MOT"
          ? fmtDate(vehicle?.nextMOT)
          : eventType === "SERVICE"
          ? fmtDate(vehicle?.nextService)
          : EMPTY_VALUE,
    };
  }, [booking, job, event, eventType, vehicle]);

  const workflowStatusLabel = useMemo(() => {
    const stage = normalizeWorkflowStageCompat(jobStatus || job?.status || "planned");
    return MAINTENANCE_STAGE_LABELS[stage] || stage;
  }, [jobStatus, job?.status]);

  const canQuickCompleteJob = useMemo(() => {
    const stage = normalizeWorkflowStageCompat(jobStatus || job?.status || "planned");
    return canManageJob && stage !== "completed" && stage !== "ready_to_invoice" && stage !== "closed";
  }, [canManageJob, jobStatus, job?.status]);

  const canQuickCompleteBooking = useMemo(() => {
    const bookingStatus = String(booking?.status || event?.status || "").trim().toLowerCase();
    return (
      canEditBooking &&
      bookingStatus !== "completed" &&
      bookingStatus !== "complete" &&
      bookingStatus !== "cancelled"
    );
  }, [canEditBooking, booking?.status, event?.status]);

  if (!event || loading) return null;

  const uploadAppointmentDocument = async (file, kind, completedDate) => {
    if (!file) return null;
    const workflow = ADDITIONAL_MAINTENANCE_WORKFLOWS.find((item) => item.key === kind);
    const path = companyStoragePath(
      dataAccessState,
      `vehicles/${vehicleId}/maintenance-documents/${kind}/${completedDate}-${Date.now()}-${safeFileName(file.name)}`
    );
    const snap = await uploadBytes(storageRef(storage, path), file);
    const url = await getDownloadURL(snap.ref);
    return buildMaintenanceDocument({
      file,
      url,
      storagePath: path,
      maintenanceTypeId: workflow?.maintenanceTypeId || kind,
      source: isBookingLikeEvent ? "maintenance_booking" : "appointment",
      sourceRecordId: isBookingLikeEvent ? bookingId : String(event?.id || completedDate),
      uploadedBy: getCurrentMaintenanceUploader(dataAccessState, auth.currentUser),
    });
  };

  const buildGeneratedAppointmentCompletionPatch = (documentsByKey = {}) => {
    const completedDate = ymd(event?.appointmentDateISO || event?.start);
    if (!completedDate) return null;
    const completedAt = new Date().toISOString();
    const localPatch = buildAdditionalMaintenanceCompletionPatch({
      vehicle,
      workflows: activeGeneratedWorkflows,
      completedDate,
      completedAt,
      documentsByKey,
      auditUser: getCurrentMaintenanceUploader(dataAccessState, auth.currentUser),
      bookingId: String(event?.id || ""),
      source: "dashboard_maintenance_appointment",
    });
    if (!localPatch) return null;
    return {
      localPatch,
      patch: { ...localPatch, updatedAtServer: serverTimestamp() },
    };
  };

  const handleMarkGeneratedAppointmentComplete = async () => {
    if (!canCompleteGeneratedAppointment || completingAppointment) return;

    const completedDate = ymd(event?.appointmentDateISO || event?.start);
    if (!completedDate) {
      setBookingActionError("Could not calculate the next maintenance date.");
      setBookingActionMessage("");
      return;
    }

    setCompletingAppointment(true);
    setBookingActionError("");
    setBookingActionMessage("");
    try {
      const uploadedEntries = await Promise.all(
        activeGeneratedWorkflows.map(async (workflow) => [
          workflow.key,
          await uploadAppointmentDocument(
            maintenanceDocumentFiles[workflow.key],
            workflow.key,
            completedDate
          ),
        ])
      );
      const completionPatch = buildGeneratedAppointmentCompletionPatch(
        Object.fromEntries(uploadedEntries)
      );
      if (!completionPatch?.patch) {
        setBookingActionError("Could not calculate the next maintenance date.");
        setBookingActionMessage("");
        setCompletingAppointment(false);
        return;
      }
      await updateDoc(doc(db, "vehicles", vehicleId), tenantPayload(dataAccessState, completionPatch.patch));
      setVehicle((prev) => (prev ? { ...prev, ...completionPatch.localPatch } : prev));
      setMaintenanceDocumentFiles({});
      setMaintenanceDocumentInputVersion((previous) => previous + 1);
      setBookingActionMessage("Appointment marked complete and next date calculated.");
    } catch (error) {
      console.error("[DashboardMaintenanceModal] generated appointment complete failed:", error);
      setBookingActionError("Could not mark appointment as complete.");
    } finally {
      setCompletingAppointment(false);
    }
  };

  const handleSaveGeneratedAppointmentDocuments = async () => {
    if (!canAttachGeneratedAppointmentDocuments || completingAppointment) return;
    const completedDate = ymd(event?.appointmentDateISO || event?.start);
    if (!completedDate) {
      setBookingActionError("Could not identify the appointment date.");
      setBookingActionMessage("");
      return;
    }
    if (!activeGeneratedWorkflows.some((workflow) => maintenanceDocumentFiles[workflow.key])) {
      setBookingActionError("Choose a document before saving.");
      setBookingActionMessage("");
      return;
    }

    setCompletingAppointment(true);
    setBookingActionError("");
    setBookingActionMessage("");
    try {
      const uploadedEntries = await Promise.all(
        activeGeneratedWorkflows.map(async (workflow) => [
          workflow.key,
          await uploadAppointmentDocument(
            maintenanceDocumentFiles[workflow.key],
            workflow.key,
            completedDate
          ),
        ])
      );
      const documentsByKey = Object.fromEntries(uploadedEntries);

      const patch = {
        updatedAt: new Date().toISOString(),
        updatedAtServer: serverTimestamp(),
      };
      const localPatch = { updatedAt: patch.updatedAt };
      const completedAt = event?.completedAt || new Date().toISOString();

      activeGeneratedWorkflows.forEach((workflow) => {
        const document = documentsByKey[workflow.key];
        if (!document) return;
        patch[workflow.documentsField] = [
          ...normalizeMaintenanceDocumentList(vehicle?.[workflow.documentsField], {
            maintenanceTypeId: workflow.maintenanceTypeId,
          }),
          document,
        ];
        patch[workflow.historyField] = appendMaintenanceDocumentToHistory(
          vehicle?.[workflow.historyField],
          {
            maintenanceTypeId: workflow.maintenanceTypeId,
            label: workflow.label,
            completedDate,
            completedAt,
            document,
          }
        );
        localPatch[workflow.documentsField] = patch[workflow.documentsField];
        localPatch[workflow.historyField] = patch[workflow.historyField];
      });

      if (isBookingLikeEvent && bookingId) {
        const currentItems = safeArr(booking?.items || event?.canonicalItems);
        const nextItems = currentItems.map((item) => {
          const workflow = activeGeneratedWorkflows.find(
            (candidate) =>
              candidate.maintenanceTypeId ===
              String(item?.maintenanceTypeId || "").trim().toLowerCase()
          );
          const document = workflow ? documentsByKey[workflow.key] : null;
          if (!document) return item;
          return {
            ...item,
            documents: [...safeArr(item?.documents), document],
            evidenceStatus: "attached",
          };
        });
        await updateDoc(
          doc(db, "maintenanceBookings", bookingId),
          tenantPayload(dataAccessState, { items: nextItems, updatedAt: serverTimestamp() })
        );
        setBooking((previous) => ({ ...(previous || {}), items: nextItems }));
      }

      await updateDoc(doc(db, "vehicles", vehicleId), tenantPayload(dataAccessState, patch));
      setVehicle((prev) => (prev ? { ...prev, ...localPatch } : prev));
      setMaintenanceDocumentFiles({});
      setMaintenanceDocumentInputVersion((previous) => previous + 1);
      setBookingActionMessage("Maintenance document saved.");
    } catch (error) {
      console.error("[DashboardMaintenanceModal] document save failed:", error);
      setBookingActionError("Could not save the maintenance document.");
    } finally {
      setCompletingAppointment(false);
    }
  };

  const handleDeleteGeneratedAppointmentDocument = async (kind, file) => {
    if (!vehicleId || deletingDocumentUrl) return;
    const url = String(file?.url || "").trim();
    const name = String(file?.name || file?.label || "this document").trim();
    const confirmed = window.confirm(`Delete ${name}? This cannot be undone.`);
    if (!confirmed) return;

    const workflow = ADDITIONAL_MAINTENANCE_WORKFLOWS.find((item) => item.key === kind);
    if (!workflow) return;
    if (isBookingLikeEvent && bookingId) {
      const nextItems = safeArr(booking?.items || event?.canonicalItems).map((item) => {
        if (String(item?.maintenanceTypeId || "").trim().toLowerCase() !== workflow.maintenanceTypeId) {
          return item;
        }
        const documents = removeMaintenanceDocument(item?.documents, file, {
          maintenanceTypeId: workflow.maintenanceTypeId,
        });
        return {
          ...item,
          documents,
          evidenceStatus: documents.length ? "attached" : "not_recorded",
        };
      });
      setDeletingDocumentUrl(url || name);
      setBookingActionError("");
      try {
        await updateDoc(
          doc(db, "maintenanceBookings", bookingId),
          tenantPayload(dataAccessState, { items: nextItems, updatedAt: serverTimestamp() })
        );
        setBooking((previous) => ({ ...(previous || {}), items: nextItems }));
        if (file?.storagePath || url) {
          try {
            await deleteObject(storageRef(storage, file.storagePath || url));
          } catch (storageError) {
            if (storageError?.code !== "storage/object-not-found") throw storageError;
          }
        }
        setBookingActionMessage("Maintenance document deleted.");
      } catch (error) {
        console.error("[DashboardMaintenanceModal] booking document delete failed:", error);
        setBookingActionError("Could not delete the maintenance document.");
      } finally {
        setDeletingDocumentUrl("");
      }
      return;
    }
    const documentField = workflow.documentsField;
    const historyField = workflow.historyField;
    const nextDocuments = removeMaintenanceDocument(
      vehicle?.[documentField],
      file,
      { maintenanceTypeId: workflow.maintenanceTypeId }
    );
    const nextHistory = removeMaintenanceDocumentFromHistory(
      vehicle?.[historyField],
      file,
      { maintenanceTypeId: workflow.maintenanceTypeId }
    );

    setDeletingDocumentUrl(url || name);
    setBookingActionError("");
    setBookingActionMessage("");
    try {
      await updateDoc(
        doc(db, "vehicles", vehicleId),
        tenantPayload(dataAccessState, {
          [documentField]: nextDocuments,
          [historyField]: nextHistory,
          updatedAt: new Date().toISOString(),
          updatedAtServer: serverTimestamp(),
        })
      );
      setVehicle((previous) =>
        previous
          ? {
              ...previous,
              [documentField]: nextDocuments,
              [historyField]: nextHistory,
            }
          : previous
      );
      if (file?.storagePath || url) {
        setDeletedDocumentUrls((previous) =>
          previous.includes(url) ? previous : [...previous, url]
        );
        try {
          await deleteObject(storageRef(storage, file.storagePath || url));
        } catch (storageError) {
          if (storageError?.code !== "storage/object-not-found") throw storageError;
        }
      }
      setBookingActionMessage("Maintenance document deleted.");
    } catch (error) {
      console.error("[DashboardMaintenanceModal] document delete failed:", error);
      setBookingActionError("Could not delete the maintenance document.");
    } finally {
      setDeletingDocumentUrl("");
    }
  };

  const handleDelete = async () => {
    if (!canDeleteBooking || deleting) return;
    const ok = window.confirm("Archive this maintenance booking? Its audit history will be retained.");
    if (!ok) return;
    const reason = window.prompt("Reason for cancelling this legal maintenance requirement:", "");
    if (!String(reason || "").trim()) return;

    setDeleting(true);
    setBookingActionError("");
    setBookingActionMessage("");
    try {
      await deleteMaintenanceBooking({
        bookingId,
        booking,
        vehicleId,
        vehicle,
        authState: dataAccessState,
        reason,
      });
      onClose?.();
    } catch (error) {
      console.error("[DashboardMaintenanceModal] delete failed:", error);
      setBookingActionError("Could not archive booking.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteJob = async () => {
    if (!canManageJob || deleting) return;
    const ok = window.confirm("Delete this maintenance job?");
    if (!ok) return;

    setDeleting(true);
    setJobEditorError("");
    setJobEditorMessage("");
    try {
      await deleteDoc(doc(db, "maintenanceJobs", bookingId));
      onClose?.();
    } catch (error) {
      console.error("[DashboardMaintenanceModal] maintenance job delete failed:", error);
      setJobEditorError("Could not delete maintenance job.");
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkBookingComplete = async () => {
    if (!canQuickCompleteBooking || completingBooking || !bookingId) return;

    setCompletingBooking(true);
    setBookingActionError("");
    setBookingActionMessage("");
    try {
      const completedDate =
        ymd(booking?.appointmentDateISO || booking?.endDateISO || booking?.startDateISO || event?.start) ||
        new Date().toISOString().slice(0, 10);
      const uploadedEntries = await Promise.all(
        activeGeneratedWorkflows.map(async (workflow) => [
          workflow.maintenanceTypeId,
          await uploadAppointmentDocument(
            maintenanceDocumentFiles[workflow.key],
            workflow.key,
            completedDate
          ),
        ])
      );
      const documentsByType = Object.fromEntries(
        uploadedEntries.map(([typeId, document]) => [typeId, document ? [document] : []])
      );
      const completedBooking = await completeMaintenanceBooking({
        bookingId,
        booking: booking || event,
        vehicleId,
        vehicle,
        authState: dataAccessState,
        documentsByType,
      });
      if (completedBooking.vehiclePatch) {
        setVehicle((prev) => (prev ? { ...prev, ...completedBooking.vehiclePatch } : prev));
      }
      setBooking((prev) =>
        prev
          ? {
              ...prev,
              status: "Completed",
              completedAtISO: completedBooking.completedAtISO,
              items: completedBooking.items,
              history: completedBooking.history,
            }
          : prev
      );
      setBookingActionMessage("Booking marked as completed.");
      setMaintenanceDocumentFiles({});
      setMaintenanceDocumentInputVersion((previous) => previous + 1);
    } catch (error) {
      console.error("[DashboardMaintenanceModal] mark booking complete failed:", error);
      setBookingActionError(error?.message || "Could not mark booking as completed.");
    } finally {
      setCompletingBooking(false);
    }
  };

  const handleMarkBookingItemComplete = async (maintenanceTypeId) => {
    if (!canQuickCompleteBooking || completingBooking || !bookingId) return;
    const workflow = activeGeneratedWorkflows.find(
      (item) => item.maintenanceTypeId === maintenanceTypeId
    );
    setCompletingBooking(true);
    setBookingActionError("");
    setBookingActionMessage("");
    try {
      const completedDate =
        ymd(booking?.appointmentDateISO || booking?.endDateISO || booking?.startDateISO || event?.start) ||
        new Date().toISOString().slice(0, 10);
      const document = workflow
        ? await uploadAppointmentDocument(
            maintenanceDocumentFiles[workflow.key],
            workflow.key,
            completedDate
          )
        : null;
      const completedBooking = await completeMaintenanceBookingItems({
        bookingId,
        booking: booking || event,
        vehicleId,
        vehicle,
        authState: dataAccessState,
        maintenanceTypeIds: [maintenanceTypeId],
        documentsByType: { [maintenanceTypeId]: document ? [document] : [] },
      });
      if (completedBooking.vehiclePatch) {
        setVehicle((previous) =>
          previous ? { ...previous, ...completedBooking.vehiclePatch } : previous
        );
      }
      setBooking((previous) => ({ ...(previous || event), ...completedBooking }));
      setMaintenanceDocumentFiles((previous) => ({
        ...previous,
        ...(workflow ? { [workflow.key]: null } : {}),
      }));
      setBookingActionMessage(`${workflow?.label || maintenanceTypeId} marked complete.`);
    } catch (error) {
      console.error("[DashboardMaintenanceModal] item completion failed:", error);
      setBookingActionError(error?.message || "Could not complete this maintenance item.");
    } finally {
      setCompletingBooking(false);
    }
  };

  const handleSaveJob = async () => {
    if (!canManageJob || savingJob) return;
    if (!jobTitle.trim()) {
      setJobEditorError("Enter a job title before saving.");
      setJobEditorMessage("");
      return;
    }

    setSavingJob(true);
    setJobEditorError("");
    setJobEditorMessage("");
    try {
      const normalizedStatus = normalizeWorkflowStageCompat(jobStatus || "planned");
      const patch = {
        type: String(jobType || "repair").trim().toLowerCase(),
        title: jobTitle.trim(),
        plannedDate: String(jobPlannedDate || "").trim(),
        dueDate: String(jobDueDate || "").trim(),
        priority: String(jobPriority || "normal").trim().toLowerCase(),
        status: normalizedStatus,
        notes: String(jobNotes || "").trim(),
        provider: String(jobProvider || "").trim(),
        bookedDate: String(jobBookedDate || "").trim(),
        assignedToName: String(jobAssignedToName || "").trim(),
        completionNotes: String(jobCompletionNotes || "").trim(),
        totalCost: String(jobTotalCost || "").trim(),
        poNumber: String(jobPoNumber || "").trim(),
        invoiceRef: String(jobInvoiceRef || "").trim(),
        workflowVersion: MAINTENANCE_WORKFLOW_VERSION,
        updatedAt: new Date().toISOString(),
        updatedAtServer: serverTimestamp(),
      };

      const candidate = { ...(job || {}), ...patch };
      const validation = validateMaintenanceStageRequirements(candidate, normalizedStatus);
      if (!validation.ok) {
        setJobEditorError(`Missing required fields: ${validation.missing.map(prettyField).join(", ")}`);
        setSavingJob(false);
        return;
      }

      await updateDoc(doc(db, "maintenanceJobs", bookingId), tenantPayload(dataAccessState, patch));
      setJob((prev) => ({ ...(prev || {}), ...patch }));
      setJobEditorMessage(`Job updated. Stage: ${MAINTENANCE_STAGE_LABELS[normalizedStatus] || normalizedStatus}.`);
    } catch (error) {
      console.error("[DashboardMaintenanceModal] maintenance job save failed:", error);
      setJobEditorError("Could not update maintenance job.");
    } finally {
      setSavingJob(false);
    }
  };

  const handleMarkJobComplete = async () => {
    if (!canManageJob || savingJob) return;

    setSavingJob(true);
    setJobEditorError("");
    setJobEditorMessage("");

    try {
      const nowIso = new Date().toISOString();
      const patch = {
        type: String(jobType || "repair").trim().toLowerCase(),
        title: jobTitle.trim(),
        plannedDate: String(jobPlannedDate || "").trim(),
        dueDate: String(jobDueDate || "").trim(),
        priority: String(jobPriority || "normal").trim().toLowerCase(),
        status: "completed",
        notes: String(jobNotes || "").trim(),
        provider: String(jobProvider || "").trim(),
        bookedDate: String(jobBookedDate || "").trim(),
        assignedToName: String(jobAssignedToName || "").trim(),
        completionNotes: String(jobCompletionNotes || "").trim(),
        totalCost: String(jobTotalCost || "").trim(),
        poNumber: String(jobPoNumber || "").trim(),
        invoiceRef: String(jobInvoiceRef || "").trim(),
        workflowVersion: MAINTENANCE_WORKFLOW_VERSION,
        updatedAt: nowIso,
        updatedAtServer: serverTimestamp(),
        completedAt: job?.completedAt || nowIso,
        startedAt: job?.startedAt || nowIso,
      };

      const candidate = { ...(job || {}), ...patch };
      const validation = validateMaintenanceStageRequirements(candidate, "completed");
      if (!validation.ok) {
        setShowEditJob(true);
        setJobEditorError(`Add these before completing: ${validation.missing.map(prettyField).join(", ")}`);
        setSavingJob(false);
        return;
      }

      await updateDoc(doc(db, "maintenanceJobs", bookingId), tenantPayload(dataAccessState, patch));
      setJob((prev) => ({ ...(prev || {}), ...patch }));
      setJobStatus("completed");
      setJobEditorMessage("Job marked as completed.");
    } catch (error) {
      console.error("[DashboardMaintenanceModal] mark complete failed:", error);
      setJobEditorError("Could not mark maintenance job as complete.");
    } finally {
      setSavingJob(false);
    }
  };

  const displayType =
    eventType === "MAINTENANCE" ? "Maintenance" : displayMaintenanceType(eventType);
  const modalTitle = isGeneratedMaintenanceAppointment
    ? "Maintenance Appointment"
    : isDueEvent
    ? `${displayType} Due`
    : isMaintenanceJob
    ? "Maintenance Job"
    : isPlannerRecord
    ? `${displayType} Record`
    : isRequestedBooking
    ? `${displayType} Due`
    : `${displayType} Booking`;
  const statusText = titleCase(
    isRequestedBooking
      ? "Due — not booked"
      : isDueEvent
      ? event?.bookingStatus || "Due"
      : bookingDetails.status
  );
  const dateValue = isDueEvent ? fmtDate(event?.appointmentDateISO || event?.dueDate || event?.start) : rangeText;
  const headerMeta = [modalTitle, dateValue].filter(hasDisplayValue).join(" · ");
  const sourceLabel =
    event?.plannerSourceLabel ||
    (isPlannerRecord
      ? "Completed maintenance history"
      : isRequestedBooking
      ? "Scheduled maintenance requirement"
      : isBookingLikeEvent
      ? "Saved maintenance booking"
      : isDueEvent
      ? "Vehicle maintenance schedule"
      : "Maintenance record");
  const nextDueLabel =
    eventType === "MOT" ? "Next MOT Due" : eventType === "SERVICE" ? "Next Service Due" : "";
  const summaryCards = [
    {
      label: nextDueLabel,
      value: bookingDetails.nextDue,
      show: canEditBooking && hasDisplayValue(nextDueLabel) && hasDisplayValue(bookingDetails.nextDue),
    },
  ].filter((item) => item.show !== false && hasDisplayValue(item.value));

  const detailRows = [
    { label: "Type", value: displayType },
    { label: "Source", value: sourceLabel },
    {
      label: "Booking",
      value: "Recorded completion only — no saved booking is linked",
      show: isPlannerRecord,
    },
    { label: "Workflow Stage", value: workflowStatusLabel, show: canManageJob },
    { label: "Booking Type", value: bookingDetails.bookingType, show: canEditBooking },
    { label: "ISO Week", value: event?.isoWeek, show: isDueEvent && hasDisplayValue(event?.isoWeek) },
    { label: "Provider / Garage", value: bookingDetails.provider, show: hasDisplayValue(bookingDetails.provider) },
    { label: "Completed", value: bookingDetails.completedDate, show: canEditBooking || isPlannerRecord },
    { label: "Vehicles", value: bookingDetails.vehicles, show: (canEditBooking || isPlannerRecord) && hasDisplayValue(bookingDetails.vehicles) },
    { label: "Equipment", value: bookingDetails.equipment, show: canEditBooking && hasDisplayValue(bookingDetails.equipment) },
  ].filter((item) => item.show !== false && hasDisplayValue(item.value));
  const eventDocuments = documentList(event?.documents).filter(
    (item) => !deletedDocumentUrls.includes(String(item?.url || "").trim())
  );
  const generatedAppointmentDate = ymd(event?.appointmentDateISO || event?.start);
  const documentsForAppointment = (kind) => {
    const workflow = ADDITIONAL_MAINTENANCE_WORKFLOWS.find((item) => item.key === kind);
    if (!workflow) return [];
    if (isBookingLikeEvent) {
      const canonicalItem = safeArr(booking?.items || event?.canonicalItems).find(
        (item) => String(item?.maintenanceTypeId || "").trim().toLowerCase() === workflow.maintenanceTypeId
      );
      return normalizeMaintenanceDocumentList(canonicalItem?.documents, {
        maintenanceTypeId: workflow.maintenanceTypeId,
        source: "maintenance_booking",
        sourceRecordId: bookingId,
      }).filter((item) => !deletedDocumentUrls.includes(String(item?.url || "").trim()));
    }
    return safeArr(vehicle?.[workflow.historyField])
      .filter(
        (entry) =>
          !generatedAppointmentDate ||
          String(entry?.completedDate || "").slice(0, 10) === generatedAppointmentDate
      )
      .flatMap((entry) =>
        normalizeMaintenanceDocumentList(entry?.documents, {
          maintenanceTypeId: workflow.maintenanceTypeId,
          source: "appointment",
          sourceRecordId: entry?.completedDate || generatedAppointmentDate,
          uploadedAt: entry?.completedAt || entry?.completedDate || "",
        })
      )
      .filter((item) => !deletedDocumentUrls.includes(String(item?.url || "").trim()));
  };
  const savedDocumentsByKey = Object.fromEntries(
    activeGeneratedWorkflows.map((workflow) => [
      workflow.key,
      documentsForAppointment(workflow.key),
    ])
  );
  const evidenceOutstandingItems = safeArr(booking?.items || event?.canonicalItems).filter(
    (item) =>
      String(item?.status || "").trim().toLowerCase() === "completed" &&
      ["pmi", "brake_test"].includes(
        String(item?.maintenanceTypeId || "").trim().toLowerCase()
      ) &&
      String(item?.evidenceStatus || "").trim().toLowerCase() !== "attached" &&
      safeArr(item?.documents).length === 0
  );

  return (
    <div className={layoutStyles.extracted1} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={layoutStyles.extracted2}>
        <div className={layoutStyles.extracted3}>
          <div>
            <div className={layoutStyles.extracted4}>Dashboard Maintenance</div>
            <div className={layoutStyles.extracted72}>
              <h2 className={layoutStyles.extracted5}>{vehicleLabel}</h2>
              {hasDisplayValue(statusText) ? (
                <span className={layoutStyles.extracted73}>{statusText}</span>
              ) : null}
              {hasDisplayValue(sourceLabel) ? (
                <span className={layoutStyles.plannerSourceBadge}>{sourceLabel}</span>
              ) : null}
            </div>
            <div className={layoutStyles.extracted74}>{headerMeta}</div>
          </div>
          <button onClick={onClose} className={layoutStyles.extracted6} type="button" aria-label="Close">
            X
          </button>
        </div>

        <div className={layoutStyles.extracted7}>
          {bookingActionError ? <div className={layoutStyles.extracted8}>{bookingActionError}</div> : null}
          {bookingActionMessage ? <div className={layoutStyles.extracted9}>{bookingActionMessage}</div> : null}
          {evidenceOutstandingItems.length ? (
            <div className={layoutStyles.extracted8}>
              Maintenance is complete, but {evidenceOutstandingItems.length === 1 ? "the document is" : "documents are"} still outstanding. Upload the paperwork below when it arrives.
            </div>
          ) : null}
          {summaryCards.length ? (
            <div className={layoutStyles.extracted10}>
              {summaryCards.map((item) => (
                <div key={item.label} className={layoutStyles.extracted11}>
                  <div className={layoutStyles.extracted12}>{item.label}</div>
                  <div className={layoutStyles.extracted13}>{item.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          <div className={layoutStyles.extracted14}>
            {detailRows.map((item) => (
              <Row key={item.label} label={item.label} value={item.value} />
            ))}
            {eventDocuments.length ? (
              <div className={layoutStyles.extracted15}>
                <div className={layoutStyles.extracted16}>Documents</div>
                <div className={layoutStyles.extracted17}>
                  {eventDocuments.map((item, index) => (
                    <a
                      key={`${item.url || item.name}-${index}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={layoutStyles.extracted18}
                    >
                      {item.label || item.name || `Document ${index + 1}`}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
            {hasDisplayValue(bookingDetails.notes) ? (
              <div className={layoutStyles.extracted19}>
                <div className={layoutStyles.extracted20}>Notes</div>
                <div className={layoutStyles.extracted21}>{bookingDetails.notes}</div>
              </div>
            ) : null}
          </div>
        </div>

        {canAttachGeneratedAppointmentDocuments ? (
          <div className={layoutStyles.extracted22}>
            <div className={layoutStyles.extracted23}>Completion Documents</div>
            <div className={layoutStyles.extracted24}>
              Paperwork can be uploaded before or after completion. Completed items remain flagged until their evidence is attached.
            </div>
            <div className={layoutStyles.extracted25}>
              {activeGeneratedWorkflows.map((workflow) => {
                const savedDocuments = savedDocumentsByKey[workflow.key] || [];
                const selectedFile = maintenanceDocumentFiles[workflow.key] || null;
                const workflowCompleted = safeArr(booking?.items || event?.canonicalItems).some(
                  (item) =>
                    String(item?.maintenanceTypeId || "").trim().toLowerCase() ===
                      workflow.maintenanceTypeId &&
                    String(item?.status || "").trim().toLowerCase() === "completed"
                );
                return (
                <Field key={workflow.key} label={`${workflow.label} Document`}>
                  {savedDocuments.length ? (
                    <div className={layoutStyles.savedDocumentList}>
                      {savedDocuments.map((file, index) => (
                        <div
                          key={`${file.url || file.name}-${index}`}
                          className={layoutStyles.savedDocumentRow}
                        >
                          <div className={layoutStyles.savedDocumentDetails}>
                            <a href={file.url} target="_blank" rel="noopener noreferrer">
                              {file.name || `${workflow.label} document ${index + 1}`}
                            </a>
                            <span>
                              {file.source} · {fmtDate(file.uploadedAt)} ·{" "}
                              {file.uploadedBy?.name || file.uploadedBy?.email || "Unknown"}
                            </span>
                          </div>
                          {!workflowCompleted ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteGeneratedAppointmentDocument(workflow.key, file)
                              }
                              disabled={deletingDocumentUrl === (file.url || file.name)}
                            >
                              {deletingDocumentUrl === (file.url || file.name)
                                ? "Deleting…"
                                : "Delete"}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <input
                    key={`${workflow.key}-${maintenanceDocumentInputVersion}`}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(event) =>
                      setMaintenanceDocumentFiles((previous) => ({
                        ...previous,
                        [workflow.key]: event.target.files?.[0] || null,
                      }))
                    }
                    className={layoutStyles.extracted26}
                  />
                  {selectedFile ? (
                    <div className={layoutStyles.extracted27}>{selectedFile.name}</div>
                  ) : null}
                </Field>
                );
              })}
            </div>
            {!canCompleteGeneratedAppointment ? (
              <div className={layoutStyles.extracted30}>
                <button
                  type="button"
                  className={layoutStyles.extracted31}
                  onClick={handleSaveGeneratedAppointmentDocuments}
                  disabled={completingAppointment}
                >
                  {completingAppointment ? "Saving..." : "Save Documents"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={layoutStyles.extracted32}>
          {canBook && (
            <button
              type="button"
              className={layoutStyles.extracted33}
              onClick={() =>
                setShowBookType(
                  eventType === "SERVICE"
                    ? "SERVICE"
                    : eventType === "INSPECTION"
                    ? "INSPECTION"
                    : "MOT"
                )
              }
            >
              {eventType === "SERVICE"
                ? "Book Service"
                : eventType === "INSPECTION"
                ? "Book Inspection"
                : "Book MOT"}
            </button>
          )}

          {vehicleId && (
            <button
              type="button"
              className={layoutStyles.extracted34}
              onClick={() => router.push(`/vehicle-edit/${encodeURIComponent(vehicleId)}`)}
            >
              Open Vehicle
            </button>
          )}

          {canEditBooking && (
            <button type="button" className={layoutStyles.extracted35} onClick={() => setShowEditBooking(true)}>
              Edit Booking
            </button>
          )}

          {canQuickCompleteBooking && (
            <button
              type="button"
              className={layoutStyles.extracted36}
              onClick={handleMarkBookingComplete}
              disabled={completingBooking}
            >
              {completingBooking ? "Saving..." : "Mark Complete"}
            </button>
          )}

          {canQuickCompleteBooking && activeGeneratedWorkflows.length > 1
            ? activeGeneratedWorkflows.map((workflow) => {
                const canonicalItem = safeArr(booking?.items || event?.canonicalItems).find(
                  (item) =>
                    String(item?.maintenanceTypeId || "").trim().toLowerCase() ===
                    workflow.maintenanceTypeId
                );
                const completed =
                  String(canonicalItem?.status || "").trim().toLowerCase() === "completed";
                return completed ? null : (
                  <button
                    key={workflow.maintenanceTypeId}
                    type="button"
                    className={layoutStyles.extracted36}
                    onClick={() => handleMarkBookingItemComplete(workflow.maintenanceTypeId)}
                    disabled={completingBooking}
                  >
                    {completingBooking ? "Saving..." : `Complete ${workflow.label}`}
                  </button>
                );
              })
            : null}

          {canCompleteGeneratedAppointment && (
            <button
              type="button"
              className={layoutStyles.extracted37}
              onClick={handleMarkGeneratedAppointmentComplete}
              disabled={completingAppointment}
            >
              {completingAppointment ? "Saving..." : "Mark Complete"}
            </button>
          )}

          {canManageJob && (
            <button type="button" className={layoutStyles.extracted38} onClick={() => setShowEditJob((prev) => !prev)}>
              {showEditJob ? "Close Editor" : "Edit Job"}
            </button>
          )}

          {canQuickCompleteJob && (
            <button type="button" className={layoutStyles.extracted39} onClick={handleMarkJobComplete} disabled={savingJob}>
              {savingJob ? "Saving..." : "Mark Complete"}
            </button>
          )}

          {canManageJob && (
            <button
              type="button"
              className={layoutStyles.extracted40}
              onClick={() => router.push(`/maintenance-jobs?jobId=${encodeURIComponent(bookingId)}`)}
            >
              Open Jobs
            </button>
          )}

          {canDeleteBooking && (
            <button type="button" className={layoutStyles.extracted41} onClick={handleDelete} disabled={deleting}>
              {deleting ? "Archiving..." : "Archive Booking"}
            </button>
          )}

          {canManageJob && (
            <button type="button" className={layoutStyles.extracted42} onClick={handleDeleteJob} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Job"}
            </button>
          )}
        </div>

        {showBookType && vehicleId && (
          <div className={layoutStyles.extracted43}>
            <MaintenanceBookingForm
              vehicleId={vehicleId}
              type={showBookType}
              defaultDate={
                (event?.dueDate ? new Date(event.dueDate) : toJsDate(event?.start))
                  ?.toISOString?.()
                  .slice(0, 10) || ""
              }
              sourceDueDate={
                (event?.dueDate ? new Date(event.dueDate) : toJsDate(event?.start))
                  ?.toISOString?.()
                  .slice(0, 10) || ""
              }
              sourceDueIsoWeek={event?.isoWeek || ""}
              sourceDueKey={String(event?.requirementKey || event?.sourceDueKey || event?.id || "")}
              requestedRecordId={isRequestedBooking ? bookingId : ""}
              defaultMaintenanceTypeIds={safeArr(event?.canonicalItems)
                .map((item) => String(item?.maintenanceTypeId || "").trim().toLowerCase())
                .filter(Boolean)}
              onClose={() => setShowBookType("")}
              onSaved={() => {
                setShowBookType("");
                onClose?.();
              }}
            />
          </div>
        )}

        {showEditBooking && canEditBooking && (
          <div className={layoutStyles.extracted44}>
            <EditMaintenanceBookingForm
              bookingId={bookingId}
              vehicleId={vehicleId || undefined}
              onClose={() => setShowEditBooking(false)}
              onSaved={() => {
                setShowEditBooking(false);
                onClose?.();
              }}
            />
          </div>
        )}

        {showEditJob && canManageJob && (
          <div className={layoutStyles.extracted45}>
            <div className={layoutStyles.extracted46}>Edit Maintenance Job</div>
            <div className={layoutStyles.extracted47}>
              Keep the workflow details complete here so the job can move cleanly from planning through invoice close-out.
            </div>
            {jobEditorError ? <div className={layoutStyles.extracted48}>{jobEditorError}</div> : null}
            {jobEditorMessage ? <div className={layoutStyles.extracted49}>{jobEditorMessage}</div> : null}
            <div className={layoutStyles.extracted50}>
              <Field label="Type">
                <select value={jobType} onChange={(e) => setJobType(e.target.value)} className={layoutStyles.extracted51}>
                  <option value="service">Service</option>
                  <option value="mot">MOT</option>
                  <option value="inspection">Inspection</option>
                  <option value="repair">Repair</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={jobStatus} onChange={(e) => setJobStatus(e.target.value)} className={layoutStyles.extracted52}>
                  {MAINTENANCE_JOB_WORKFLOW_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {MAINTENANCE_STAGE_LABELS[stage] || stage}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Job Title" full>
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={layoutStyles.extracted53} />
              </Field>
              <Field label="Planned Date">
                <input type="date" value={jobPlannedDate} onChange={(e) => setJobPlannedDate(e.target.value)} className={layoutStyles.extracted54} />
              </Field>
              <Field label="Due Date">
                <input type="date" value={jobDueDate} onChange={(e) => setJobDueDate(e.target.value)} className={layoutStyles.extracted55} />
              </Field>
              <Field label="Priority">
                <select value={jobPriority} onChange={(e) => setJobPriority(e.target.value)} className={layoutStyles.extracted56}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
              <Field label="Provider">
                <input value={jobProvider} onChange={(e) => setJobProvider(e.target.value)} className={layoutStyles.extracted57} />
              </Field>
              <Field label="Booked Date">
                <input type="date" value={jobBookedDate} onChange={(e) => setJobBookedDate(e.target.value)} className={layoutStyles.extracted58} />
              </Field>
              <Field label="Assigned To">
                <input value={jobAssignedToName} onChange={(e) => setJobAssignedToName(e.target.value)} className={layoutStyles.extracted59} />
              </Field>
              <Field label="Total Cost">
                <input value={jobTotalCost} onChange={(e) => setJobTotalCost(e.target.value)} className={layoutStyles.extracted60} />
              </Field>
              <Field label="PO Number">
                <input value={jobPoNumber} onChange={(e) => setJobPoNumber(e.target.value)} className={layoutStyles.extracted61} />
              </Field>
              <Field label="Invoice Ref">
                <input value={jobInvoiceRef} onChange={(e) => setJobInvoiceRef(e.target.value)} className={layoutStyles.extracted62} />
              </Field>
              <Field label="Completion Notes" full>
                <textarea
                  value={jobCompletionNotes}
                  onChange={(e) => setJobCompletionNotes(e.target.value)}
                  rows={4}
                  className={layoutStyles.extracted63}
                />
              </Field>
              <Field label="Notes" full>
                <textarea value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} rows={4} className={layoutStyles.extracted64} />
              </Field>
            </div>
            <div className={layoutStyles.extracted65}>
              <button type="button" className={layoutStyles.extracted66} onClick={() => setShowEditJob(false)} disabled={savingJob}>
                Cancel
              </button>
              <button type="button" className={layoutStyles.extracted67} onClick={handleSaveJob} disabled={savingJob}>
                {savingJob ? "Saving..." : "Save Job"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className={layoutStyles.extracted68}>
      <div className={layoutStyles.extracted69}>{label}</div>
      <div className={layoutStyles.extracted70}>{value || EMPTY_VALUE}</div>
    </div>
  );
}

function Field({ label, children, full = false }) {
  return (
    <div style={full ? fullField : undefined}>
      <div className={layoutStyles.extracted71}>{label}</div>
      {children}
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.56)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
  padding: 18,
};

const modal = {
  width: "min(760px, calc(100vw - 32px))",
  maxHeight: "90vh",
  overflow: "auto",
  background: "var(--color-canvas)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  boxShadow: "0 22px 60px rgba(15,23,42,0.28)",
  padding: 0,
  color: "var(--color-text)",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "14px 16px",
  background: "var(--color-surface)",
  borderBottom: "1px solid var(--color-border)",
};

const eyebrow = {
  fontSize: 11,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  fontWeight: 900,
};

const title = {
  margin: "3px 0 0",
  fontSize: 22,
  lineHeight: 1.08,
  color: "var(--color-text)",
  fontWeight: 900,
  letterSpacing: 0,
};

const closeBtn = {
  width: 34,
  height: 34,
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
  fontSize: 14,
  lineHeight: 1,
  color: "var(--color-text-muted)",
  fontWeight: 900,
  cursor: "pointer",
};

const card = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: 10,
  background: "var(--color-surface)",
  margin: 12,
  overflow: "hidden",
};

const summaryStrip = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
  marginBottom: 10,
};

const summaryTile = {
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-subtle)",
  borderRadius: 8,
  padding: "10px 11px",
  minWidth: 0,
};

const summaryLabel = {
  fontSize: 11,
  color: "var(--color-text-muted)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 4,
};

const summaryValue = {
  fontSize: 13.5,
  color: "var(--color-text)",
  fontWeight: 900,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};

const detailsPanel = {
  border: "1px solid var(--color-brand-soft)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--color-surface)",
};

const documentUploadCard = {
  margin: "0 12px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: 12,
  background: "var(--color-surface)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
};

const documentsBlock = {
  padding: 10,
  borderTop: "1px solid var(--color-brand-soft)",
  background: "var(--color-surface)",
};

const documentLinks = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 6,
};

const documentLink = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 8px",
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-brand-soft)",
  color: "var(--color-brand)",
  fontSize: 12,
  fontWeight: 800,
  textDecoration: "none",
};

const fileHint = {
  marginTop: 6,
  color: "var(--color-text-muted)",
  fontSize: 12,
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const row = {
  display: "grid",
  gridTemplateColumns: "150px minmax(0, 1fr)",
  gap: 14,
  padding: "8px 11px",
  borderBottom: "1px solid var(--color-brand-soft)",
  alignItems: "start",
};

const labelStyle = {
  fontSize: 11.5,
  color: "var(--color-text-muted)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".035em",
  lineHeight: 1.35,
};

const valueStyle = {
  fontSize: 13.5,
  color: "var(--color-text)",
  fontWeight: 800,
  lineHeight: 1.4,
  overflowWrap: "anywhere",
};

const notesBlock = {
  display: "grid",
  gap: 6,
  padding: "10px 11px",
  background: "var(--color-surface-subtle)",
};

const notesText = {
  color: "var(--color-text)",
  fontSize: 13.5,
  fontWeight: 800,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const actions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  padding: "0 12px 12px",
  marginTop: 0,
};

const primaryBtn = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-brand)",
  background: "var(--color-brand)",
  color: "var(--color-white)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 6px 12px rgba(31,75,122,0.16)",
};

const ghostBtn = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
};

const successBtn = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-success)",
  background: "var(--color-success)",
  color: "var(--color-white)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 6px 12px rgba(21,128,61,0.16)",
};

const dangerBtn = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-danger)",
  background: "var(--color-danger)",
  color: "var(--color-white)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 6px 12px rgba(185,28,28,0.14)",
};

const jobEditorCard = {
  margin: "0 12px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: 12,
  background: "var(--color-surface)",
};

const jobEditorTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: "var(--color-text)",
  marginBottom: 6,
};

const jobEditorSubtitle = {
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--color-text-muted)",
  marginBottom: 12,
};

const jobGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldLabel = {
  fontSize: 12,
  color: "var(--color-text-muted)",
  fontWeight: 900,
  textTransform: "uppercase",
  marginBottom: 6,
};

const fieldInput = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: 14,
};

const feedbackBase = {
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 12,
};

const feedbackError = {
  ...feedbackBase,
  background: "var(--color-danger-soft)",
  border: "1px solid var(--color-danger-border)",
  color: "var(--color-danger)",
};

const feedbackSuccess = {
  ...feedbackBase,
  background: "var(--color-info-soft)",
  border: "1px solid var(--color-info-border)",
  color: "var(--color-brand)",
};

const fullField = {
  gridColumn: "1 / -1",
};

const jobEditorActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 12,
};
