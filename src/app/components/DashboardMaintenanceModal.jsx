"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { arrayUnion, deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../../../firebaseConfig";
import EditMaintenanceBookingForm from "./EditMaintenanceBookingForm";
import MaintenanceBookingForm from "./MaintenanceBookingForm";
import {
  completeMaintenanceBooking,
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

const ymd = (value) => {
  const d = toJsDate(value);
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addWeeksToYmd = (value, weeks) => {
  const start = toJsDate(value);
  const numericWeeks = Number(weeks || 0);
  if (!start || !Number.isFinite(numericWeeks) || numericWeeks <= 0) return "";
  const next = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  next.setDate(next.getDate() + Math.round(numericWeeks) * 7);
  return ymd(next);
};

const getIsoWeekLabel = (value) => {
  const date = toJsDate(value);
  if (!date) return "";
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const resolveFreqWeeks = (explicitFreq, lastDate, nextDate) => {
  const explicit = Number(explicitFreq || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

  const last = toJsDate(lastDate);
  const next = toJsDate(nextDate);
  if (!last || !next) return 0;

  const diffDays = Math.round((next.getTime() - last.getTime()) / 86400000);
  if (diffDays <= 0) return 0;
  return Math.max(1, Math.round(diffDays / 7));
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
  const [brakeTestDocumentFile, setBrakeTestDocumentFile] = useState(null);
  const [pmiDocumentFile, setPmiDocumentFile] = useState(null);

  const vehicleId = String(event?.vehicleId || "").trim();
  const bookingId = String(event?.__parentId || event?.id || "").trim();
  const eventType = deriveType(event);
  const isDueEvent =
    event?.__collection === "vehicleDueDates" ||
    event?.kind === "MOT" ||
    event?.kind === "SERVICE" ||
    event?.kind === "INSPECTION" ||
    event?.kind === "MAINTENANCE_APPOINTMENT";
  const isGeneratedMaintenanceAppointment = event?.kind === "MAINTENANCE_APPOINTMENT";
  const isMaintenanceJob = event?.__collection === "maintenanceJobs";
  const isBookingLikeEvent = !isDueEvent && !isMaintenanceJob && !!bookingId;
  const canBook =
    !!vehicleId &&
    (eventType === "MOT" || eventType === "SERVICE" || eventType === "INSPECTION");
  const canDeleteBooking = isBookingLikeEvent;
  const canEditBooking = isBookingLikeEvent;
  const canManageJob = isMaintenanceJob && !!bookingId;
  const canCompleteGeneratedAppointment =
    isGeneratedMaintenanceAppointment &&
    !!vehicleId &&
    !["completed", "complete"].includes(String(event?.bookingStatus || "").trim().toLowerCase());

  const generatedAppointmentKinds = useMemo(() => {
    const maintenanceTypes = Array.isArray(event?.maintenanceTypes)
      ? event.maintenanceTypes.map((item) => String(item || "").trim().toLowerCase())
      : [];
    const label = String(event?.maintenanceTypeLabel || event?.title || "").trim().toLowerCase();
    return {
      brake: maintenanceTypes.some((item) => item.includes("brake")) || label.includes("brake"),
      pmi: maintenanceTypes.some((item) => item.includes("pmi")) || label.includes("pmi"),
    };
  }, [event]);
  const canAttachGeneratedAppointmentDocuments =
    isGeneratedMaintenanceAppointment &&
    !!vehicleId &&
    (generatedAppointmentKinds.brake || generatedAppointmentKinds.pmi);

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
      return `${fmtDate(source.startDate || source.start)} -> ${fmtDate(source.endDate || source.end)}`;
    }
    if (source.start || source.end) {
      return `${fmtDate(source.start)} -> ${fmtDate(source.end)}`;
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
    const allowedType = eventType === "MOT" || eventType === "SERVICE";
    return (
      canEditBooking &&
      allowedType &&
      bookingStatus !== "completed" &&
      bookingStatus !== "complete" &&
      bookingStatus !== "cancelled"
    );
  }, [canEditBooking, eventType, booking?.status, event?.status]);

  if (!event || loading) return null;

  const uploadAppointmentDocument = async (file, kind, completedDate) => {
    if (!file) return null;
    const kindLabel = kind === "pmi" ? "PMI inspection" : "Brake test";
    const path = companyStoragePath(
      dataAccessState,
      `vehicles/${vehicleId}/maintenance-documents/${kind}/${completedDate}-${Date.now()}-${safeFileName(file.name)}`
    );
    const snap = await uploadBytes(storageRef(storage, path), file);
    const url = await getDownloadURL(snap.ref);
    return {
      name: file.name || `${kindLabel} document`,
      url,
      type: kind,
      label: kindLabel,
      uploadedAt: new Date().toISOString(),
    };
  };

  const buildGeneratedAppointmentCompletionPatch = ({ brakeDocument = null, pmiDocument = null } = {}) => {
    const completedDate = ymd(event?.appointmentDateISO || event?.start);
    if (!completedDate) return null;

    const shouldCompleteBrake = generatedAppointmentKinds.brake;
    const shouldCompletePmi = generatedAppointmentKinds.pmi;
    const patch = {
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
    };
    const localPatch = {
      updatedAt: patch.updatedAt,
    };
    const completedAt = new Date().toISOString();

    if (shouldCompleteBrake) {
      const freqWeeks = resolveFreqWeeks(vehicle?.brakeTestFreq, vehicle?.lastBrakeTest, vehicle?.nextBrakeTest);
      const nextBrakeTest = addWeeksToYmd(completedDate, freqWeeks);
      const brakeDocuments = brakeDocument ? [brakeDocument] : [];
      patch.lastBrakeTest = completedDate;
      localPatch.lastBrakeTest = completedDate;
      if (brakeDocument) {
        patch.brakeTestDocuments = arrayUnion(brakeDocument);
        localPatch.brakeTestDocuments = [...documentList(vehicle?.brakeTestDocuments), brakeDocument];
      }
      if (nextBrakeTest) {
        patch.nextBrakeTest = nextBrakeTest;
        patch.brakeISOWeek = getIsoWeekLabel(nextBrakeTest);
        localPatch.nextBrakeTest = nextBrakeTest;
        localPatch.brakeISOWeek = patch.brakeISOWeek;
      }
      patch.brakeTestHistory = arrayUnion({
        type: "brake_test",
        label: "Brake test",
        completedDate,
        nextDueDate: nextBrakeTest || "",
        completedAt,
        documents: brakeDocuments,
      });
      localPatch.brakeTestHistory = [
        ...(Array.isArray(vehicle?.brakeTestHistory) ? vehicle.brakeTestHistory : []),
        {
          type: "brake_test",
          label: "Brake test",
          completedDate,
          nextDueDate: nextBrakeTest || "",
          completedAt,
          documents: brakeDocuments,
        },
      ];
    }

    if (shouldCompletePmi) {
      const freqWeeks = resolveFreqWeeks(vehicle?.pmiFreq, vehicle?.lastPMI, vehicle?.nextPMI);
      const nextPMI = addWeeksToYmd(completedDate, freqWeeks);
      const pmiDocuments = pmiDocument ? [pmiDocument] : [];
      patch.lastPMI = completedDate;
      localPatch.lastPMI = completedDate;
      if (pmiDocument) {
        patch.pmiDocuments = arrayUnion(pmiDocument);
        localPatch.pmiDocuments = [...documentList(vehicle?.pmiDocuments), pmiDocument];
      }
      if (nextPMI) {
        patch.nextPMI = nextPMI;
        patch.pmiISOWeek = getIsoWeekLabel(nextPMI);
        localPatch.nextPMI = nextPMI;
        localPatch.pmiISOWeek = patch.pmiISOWeek;
      }
      patch.pmiHistory = arrayUnion({
        type: "pmi",
        label: "PMI inspection",
        completedDate,
        nextDueDate: nextPMI || "",
        completedAt,
        documents: pmiDocuments,
      });
      localPatch.pmiHistory = [
        ...(Array.isArray(vehicle?.pmiHistory) ? vehicle.pmiHistory : []),
        {
          type: "pmi",
          label: "PMI inspection",
          completedDate,
          nextDueDate: nextPMI || "",
          completedAt,
          documents: pmiDocuments,
        },
      ];
    }

    if (!shouldCompleteBrake && !shouldCompletePmi) return null;
    return { patch, localPatch };
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
      const [brakeDocument, pmiDocument] = await Promise.all([
        generatedAppointmentKinds.brake
          ? uploadAppointmentDocument(brakeTestDocumentFile, "brake_test", completedDate)
          : Promise.resolve(null),
        generatedAppointmentKinds.pmi
          ? uploadAppointmentDocument(pmiDocumentFile, "pmi", completedDate)
          : Promise.resolve(null),
      ]);
      const completionPatch = buildGeneratedAppointmentCompletionPatch({ brakeDocument, pmiDocument });
      if (!completionPatch?.patch) {
        setBookingActionError("Could not calculate the next maintenance date.");
        setBookingActionMessage("");
        setCompletingAppointment(false);
        return;
      }
      await updateDoc(doc(db, "vehicles", vehicleId), tenantPayload(dataAccessState, completionPatch.patch));
      setVehicle((prev) => (prev ? { ...prev, ...completionPatch.localPatch } : prev));
      setBrakeTestDocumentFile(null);
      setPmiDocumentFile(null);
      setBookingActionMessage("Appointment marked complete and next date calculated.");
    } catch (error) {
      console.error("[DashboardMaintenanceModal] generated appointment complete failed:", error);
      setBookingActionError("Could not mark appointment as complete.");
    } finally {
      setCompletingAppointment(false);
    }
  };

  const appendDocumentToHistory = (history, { type, label, completedDate, completedAt, document }) => {
    if (!document) return Array.isArray(history) ? history : [];
    const rows = Array.isArray(history) ? [...history] : [];
    const index = rows.findIndex((item) => {
      const itemType = String(item?.type || item?.key || "").trim().toLowerCase();
      const itemLabel = String(item?.label || "").trim().toLowerCase();
      return (
        String(item?.completedDate || "").slice(0, 10) === completedDate &&
        (itemType === type || itemLabel === label.toLowerCase())
      );
    });

    if (index >= 0) {
      const existingDocuments = documentList(rows[index]?.documents);
      rows[index] = {
        ...rows[index],
        documents: [...existingDocuments, document],
      };
      return rows;
    }

    return [
      ...rows,
      {
        type,
        label,
        completedDate,
        nextDueDate: "",
        completedAt,
        documents: [document],
      },
    ];
  };

  const handleSaveGeneratedAppointmentDocuments = async () => {
    if (!canAttachGeneratedAppointmentDocuments || completingAppointment) return;
    const completedDate = ymd(event?.appointmentDateISO || event?.start);
    if (!completedDate) {
      setBookingActionError("Could not identify the appointment date.");
      setBookingActionMessage("");
      return;
    }
    if (!brakeTestDocumentFile && !pmiDocumentFile) {
      setBookingActionError("Choose a document before saving.");
      setBookingActionMessage("");
      return;
    }

    setCompletingAppointment(true);
    setBookingActionError("");
    setBookingActionMessage("");
    try {
      const [brakeDocument, pmiDocument] = await Promise.all([
        generatedAppointmentKinds.brake
          ? uploadAppointmentDocument(brakeTestDocumentFile, "brake_test", completedDate)
          : Promise.resolve(null),
        generatedAppointmentKinds.pmi
          ? uploadAppointmentDocument(pmiDocumentFile, "pmi", completedDate)
          : Promise.resolve(null),
      ]);

      const patch = {
        updatedAt: new Date().toISOString(),
        updatedAtServer: serverTimestamp(),
      };
      const localPatch = { updatedAt: patch.updatedAt };
      const completedAt = event?.completedAt || new Date().toISOString();

      if (brakeDocument) {
        patch.brakeTestDocuments = arrayUnion(brakeDocument);
        patch.brakeTestHistory = appendDocumentToHistory(vehicle?.brakeTestHistory, {
          type: "brake_test",
          label: "Brake test",
          completedDate,
          completedAt,
          document: brakeDocument,
        });
        localPatch.brakeTestDocuments = [...documentList(vehicle?.brakeTestDocuments), brakeDocument];
        localPatch.brakeTestHistory = patch.brakeTestHistory;
      }

      if (pmiDocument) {
        patch.pmiDocuments = arrayUnion(pmiDocument);
        patch.pmiHistory = appendDocumentToHistory(vehicle?.pmiHistory, {
          type: "pmi",
          label: "PMI inspection",
          completedDate,
          completedAt,
          document: pmiDocument,
        });
        localPatch.pmiDocuments = [...documentList(vehicle?.pmiDocuments), pmiDocument];
        localPatch.pmiHistory = patch.pmiHistory;
      }

      await updateDoc(doc(db, "vehicles", vehicleId), tenantPayload(dataAccessState, patch));
      setVehicle((prev) => (prev ? { ...prev, ...localPatch } : prev));
      setBrakeTestDocumentFile(null);
      setPmiDocumentFile(null);
      setBookingActionMessage("Maintenance document saved.");
    } catch (error) {
      console.error("[DashboardMaintenanceModal] document save failed:", error);
      setBookingActionError("Could not save the maintenance document.");
    } finally {
      setCompletingAppointment(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteBooking || deleting) return;
    const ok = window.confirm("Delete this maintenance booking?");
    if (!ok) return;

    setDeleting(true);
    setBookingActionError("");
    setBookingActionMessage("");
    try {
      await deleteMaintenanceBooking({
        bookingId,
        booking,
        vehicleId,
        vehicle,
      });
      onClose?.();
    } catch (error) {
      console.error("[DashboardMaintenanceModal] delete failed:", error);
      setBookingActionError("Could not delete booking.");
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
      const completedBooking = await completeMaintenanceBooking({
        bookingId,
        booking: booking || event,
        vehicleId,
        vehicle,
        authState: dataAccessState,
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
              history: completedBooking.history,
            }
          : prev
      );
      setBookingActionMessage("Booking marked as completed.");
    } catch (error) {
      console.error("[DashboardMaintenanceModal] mark booking complete failed:", error);
      setBookingActionError("Could not mark booking as completed.");
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

  const displayType = eventType === "MAINTENANCE" ? "Maintenance" : eventType;
  const modalTitle = isGeneratedMaintenanceAppointment
    ? "Maintenance Appointment"
    : isDueEvent
    ? `${displayType} Due`
    : isMaintenanceJob
    ? "Maintenance Job"
    : `${displayType} Booking`;
  const statusText = isDueEvent ? event?.bookingStatus || "Due" : bookingDetails.status;
  const dateLabel = isGeneratedMaintenanceAppointment ? "Appointment Date" : isDueEvent ? "Due Date" : "Date(s)";
  const dateValue = isDueEvent ? fmtDate(event?.appointmentDateISO || event?.dueDate || event?.start) : rangeText;
  const nextDueLabel =
    eventType === "MOT" ? "Next MOT Due" : eventType === "SERVICE" ? "Next Service Due" : "";
  const summaryCards = [
    { label: "Vehicle", value: vehicleLabel },
    { label: "Status", value: statusText },
    { label: dateLabel, value: dateValue },
    {
      label: nextDueLabel,
      value: bookingDetails.nextDue,
      show: canEditBooking && hasDisplayValue(nextDueLabel) && hasDisplayValue(bookingDetails.nextDue),
    },
  ].filter((item) => item.show !== false && hasDisplayValue(item.value));

  const detailRows = [
    { label: "Type", value: displayType },
    { label: "Workflow Stage", value: workflowStatusLabel, show: canManageJob },
    { label: "Booking Type", value: bookingDetails.bookingType, show: canEditBooking },
    { label: "Start Date", value: bookingDetails.startDate, show: canEditBooking && bookingDetails.isMultiDay },
    { label: "End Date", value: bookingDetails.endDate, show: canEditBooking && bookingDetails.isMultiDay },
    { label: "ISO Week", value: event?.isoWeek, show: isDueEvent && hasDisplayValue(event?.isoWeek) },
    { label: "Provider / Garage", value: bookingDetails.provider, show: hasDisplayValue(bookingDetails.provider) },
    { label: "Completed", value: bookingDetails.completedDate, show: canEditBooking },
    { label: "Vehicles", value: bookingDetails.vehicles, show: canEditBooking && hasDisplayValue(bookingDetails.vehicles) },
    { label: "Equipment", value: bookingDetails.equipment, show: canEditBooking && hasDisplayValue(bookingDetails.equipment) },
  ].filter((item) => item.show !== false && hasDisplayValue(item.value));
  const eventDocuments = documentList(event?.documents);

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={modal}>
        <div style={header}>
          <div>
            <div style={eyebrow}>Dashboard Maintenance</div>
            <h2 style={title}>{modalTitle}</h2>
          </div>
          <button onClick={onClose} style={closeBtn} type="button" aria-label="Close">
            X
          </button>
        </div>

        <div style={card}>
          {bookingActionError ? <div style={{ ...feedbackError, margin: 10 }}>{bookingActionError}</div> : null}
          {bookingActionMessage ? <div style={{ ...feedbackSuccess, margin: 10 }}>{bookingActionMessage}</div> : null}
          <div style={summaryStrip}>
            {summaryCards.map((item) => (
              <div key={item.label} style={summaryTile}>
                <div style={summaryLabel}>{item.label}</div>
                <div style={summaryValue}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={detailsPanel}>
            {detailRows.map((item) => (
              <Row key={item.label} label={item.label} value={item.value} />
            ))}
            {eventDocuments.length ? (
              <div style={documentsBlock}>
                <div style={labelStyle}>Documents</div>
                <div style={documentLinks}>
                  {eventDocuments.map((item, index) => (
                    <a
                      key={`${item.url || item.name}-${index}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={documentLink}
                    >
                      {item.label || item.name || `Document ${index + 1}`}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
            {hasDisplayValue(bookingDetails.notes) ? (
              <div style={notesBlock}>
                <div style={labelStyle}>Notes</div>
                <div style={notesText}>{bookingDetails.notes}</div>
              </div>
            ) : null}
          </div>
        </div>

        {canAttachGeneratedAppointmentDocuments ? (
          <div style={documentUploadCard}>
            <div style={jobEditorTitle}>Completion Documents</div>
            <div style={jobEditorSubtitle}>
              Attach the inspection paperwork for this maintenance appointment.
            </div>
            <div style={jobGrid}>
              {generatedAppointmentKinds.brake ? (
                <Field label="Brake Test Document">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => setBrakeTestDocumentFile(e.target.files?.[0] || null)}
                    style={fieldInput}
                  />
                  {brakeTestDocumentFile ? <div style={fileHint}>{brakeTestDocumentFile.name}</div> : null}
                </Field>
              ) : null}
              {generatedAppointmentKinds.pmi ? (
                <Field label="PMI Inspection Document">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => setPmiDocumentFile(e.target.files?.[0] || null)}
                    style={fieldInput}
                  />
                  {pmiDocumentFile ? <div style={fileHint}>{pmiDocumentFile.name}</div> : null}
                </Field>
              ) : null}
            </div>
            {!canCompleteGeneratedAppointment ? (
              <div style={jobEditorActions}>
                <button
                  type="button"
                  style={primaryBtn}
                  onClick={handleSaveGeneratedAppointmentDocuments}
                  disabled={completingAppointment}
                >
                  {completingAppointment ? "Saving..." : "Save Documents"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={actions}>
          {canBook && (
            <button
              type="button"
              style={primaryBtn}
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
              style={ghostBtn}
              onClick={() => router.push(`/vehicle-edit/${encodeURIComponent(vehicleId)}`)}
            >
              Open Vehicle
            </button>
          )}

          {canEditBooking && (
            <button type="button" style={primaryBtn} onClick={() => setShowEditBooking(true)}>
              Edit Booking
            </button>
          )}

          {canQuickCompleteBooking && (
            <button
              type="button"
              style={successBtn}
              onClick={handleMarkBookingComplete}
              disabled={completingBooking}
            >
              {completingBooking ? "Saving..." : "Mark Complete"}
            </button>
          )}

          {canCompleteGeneratedAppointment && (
            <button
              type="button"
              style={successBtn}
              onClick={handleMarkGeneratedAppointmentComplete}
              disabled={completingAppointment}
            >
              {completingAppointment ? "Saving..." : "Mark Complete"}
            </button>
          )}

          {canManageJob && (
            <button type="button" style={primaryBtn} onClick={() => setShowEditJob((prev) => !prev)}>
              {showEditJob ? "Close Editor" : "Edit Job"}
            </button>
          )}

          {canQuickCompleteJob && (
            <button type="button" style={successBtn} onClick={handleMarkJobComplete} disabled={savingJob}>
              {savingJob ? "Saving..." : "Mark Complete"}
            </button>
          )}

          {canManageJob && (
            <button
              type="button"
              style={ghostBtn}
              onClick={() => router.push(`/maintenance-jobs?jobId=${encodeURIComponent(bookingId)}`)}
            >
              Open Jobs
            </button>
          )}

          {canDeleteBooking && (
            <button type="button" style={dangerBtn} onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Booking"}
            </button>
          )}

          {canManageJob && (
            <button type="button" style={dangerBtn} onClick={handleDeleteJob} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Job"}
            </button>
          )}
        </div>

        {showBookType && vehicleId && (
          <div style={{ margin: "0 12px 12px" }}>
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
              sourceDueKey={String(event?.id || "")}
              onClose={() => setShowBookType("")}
              onSaved={() => {
                setShowBookType("");
                onClose?.();
              }}
            />
          </div>
        )}

        {showEditBooking && canEditBooking && (
          <div style={{ margin: "0 12px 12px" }}>
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
          <div style={jobEditorCard}>
            <div style={jobEditorTitle}>Edit Maintenance Job</div>
            <div style={jobEditorSubtitle}>
              Keep the workflow details complete here so the job can move cleanly from planning through invoice close-out.
            </div>
            {jobEditorError ? <div style={feedbackError}>{jobEditorError}</div> : null}
            {jobEditorMessage ? <div style={feedbackSuccess}>{jobEditorMessage}</div> : null}
            <div style={jobGrid}>
              <Field label="Type">
                <select value={jobType} onChange={(e) => setJobType(e.target.value)} style={fieldInput}>
                  <option value="service">Service</option>
                  <option value="mot">MOT</option>
                  <option value="inspection">Inspection</option>
                  <option value="repair">Repair</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={jobStatus} onChange={(e) => setJobStatus(e.target.value)} style={fieldInput}>
                  {MAINTENANCE_JOB_WORKFLOW_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {MAINTENANCE_STAGE_LABELS[stage] || stage}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Job Title" full>
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Planned Date">
                <input type="date" value={jobPlannedDate} onChange={(e) => setJobPlannedDate(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Due Date">
                <input type="date" value={jobDueDate} onChange={(e) => setJobDueDate(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Priority">
                <select value={jobPriority} onChange={(e) => setJobPriority(e.target.value)} style={fieldInput}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
              <Field label="Provider">
                <input value={jobProvider} onChange={(e) => setJobProvider(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Booked Date">
                <input type="date" value={jobBookedDate} onChange={(e) => setJobBookedDate(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Assigned To">
                <input value={jobAssignedToName} onChange={(e) => setJobAssignedToName(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Total Cost">
                <input value={jobTotalCost} onChange={(e) => setJobTotalCost(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="PO Number">
                <input value={jobPoNumber} onChange={(e) => setJobPoNumber(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Invoice Ref">
                <input value={jobInvoiceRef} onChange={(e) => setJobInvoiceRef(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Completion Notes" full>
                <textarea
                  value={jobCompletionNotes}
                  onChange={(e) => setJobCompletionNotes(e.target.value)}
                  rows={4}
                  style={{ ...fieldInput, resize: "vertical" }}
                />
              </Field>
              <Field label="Notes" full>
                <textarea value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} rows={4} style={{ ...fieldInput, resize: "vertical" }} />
              </Field>
            </div>
            <div style={jobEditorActions}>
              <button type="button" style={ghostBtn} onClick={() => setShowEditJob(false)} disabled={savingJob}>
                Cancel
              </button>
              <button type="button" style={primaryBtn} onClick={handleSaveJob} disabled={savingJob}>
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
    <div style={row}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value || EMPTY_VALUE}</div>
    </div>
  );
}

function Field({ label, children, full = false }) {
  return (
    <div style={full ? fullField : undefined}>
      <div style={fieldLabel}>{label}</div>
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
  background: "var(--legacy-color-f3f6f9)",
  border: "1px solid var(--legacy-color-d7dee8)",
  borderRadius: 8,
  boxShadow: "0 22px 60px rgba(15,23,42,0.28)",
  padding: 0,
  color: "var(--legacy-color-0f172a)",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "14px 16px",
  background: "var(--legacy-color-ffffff)",
  borderBottom: "1px solid var(--legacy-color-d7dee8)",
};

const eyebrow = {
  fontSize: 11,
  color: "var(--legacy-color-5f6f82)",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  fontWeight: 900,
};

const title = {
  margin: "3px 0 0",
  fontSize: 22,
  lineHeight: 1.08,
  color: "var(--legacy-color-0f172a)",
  fontWeight: 900,
  letterSpacing: 0,
};

const closeBtn = {
  width: 34,
  height: 34,
  border: "1px solid var(--legacy-color-d7dee8)",
  borderRadius: 8,
  background: "var(--legacy-color-ffffff)",
  fontSize: 14,
  lineHeight: 1,
  color: "var(--legacy-color-5f6f82)",
  fontWeight: 900,
  cursor: "pointer",
};

const card = {
  border: "1px solid var(--legacy-color-d7dee8)",
  borderRadius: 8,
  padding: 10,
  background: "var(--legacy-color-ffffff)",
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
  border: "1px solid var(--legacy-color-d7dee8)",
  background: "var(--legacy-color-f8fafc)",
  borderRadius: 8,
  padding: "10px 11px",
  minWidth: 0,
};

const summaryLabel = {
  fontSize: 11,
  color: "var(--legacy-color-5f6f82)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 4,
};

const summaryValue = {
  fontSize: 13.5,
  color: "var(--legacy-color-0f172a)",
  fontWeight: 900,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};

const detailsPanel = {
  border: "1px solid var(--legacy-color-e3ebf3)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--legacy-color-ffffff)",
};

const documentUploadCard = {
  margin: "0 12px 12px",
  border: "1px solid var(--legacy-color-d7dee8)",
  borderRadius: 8,
  padding: 12,
  background: "var(--legacy-color-ffffff)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
};

const documentsBlock = {
  padding: 10,
  borderTop: "1px solid var(--legacy-color-e3ebf3)",
  background: "var(--legacy-color-ffffff)",
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
  border: "1px solid var(--legacy-color-c8d6e3)",
  background: "var(--legacy-color-edf3f8)",
  color: "var(--legacy-color-1f4b7a)",
  fontSize: 12,
  fontWeight: 800,
  textDecoration: "none",
};

const fileHint = {
  marginTop: 6,
  color: "var(--legacy-color-5f6f82)",
  fontSize: 12,
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const row = {
  display: "grid",
  gridTemplateColumns: "150px minmax(0, 1fr)",
  gap: 14,
  padding: "8px 11px",
  borderBottom: "1px solid var(--legacy-color-e8eef5)",
  alignItems: "start",
};

const labelStyle = {
  fontSize: 11.5,
  color: "var(--legacy-color-5f6f82)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".035em",
  lineHeight: 1.35,
};

const valueStyle = {
  fontSize: 13.5,
  color: "var(--legacy-color-0f172a)",
  fontWeight: 800,
  lineHeight: 1.4,
  overflowWrap: "anywhere",
};

const notesBlock = {
  display: "grid",
  gap: 6,
  padding: "10px 11px",
  background: "var(--legacy-color-f8fafc)",
};

const notesText = {
  color: "var(--legacy-color-0f172a)",
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
  border: "1px solid var(--legacy-color-1f4b7a)",
  background: "var(--legacy-color-1f4b7a)",
  color: "var(--legacy-color-fff)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 6px 12px rgba(31,75,122,0.16)",
};

const ghostBtn = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--legacy-color-c8d6e3)",
  background: "var(--legacy-color-fff)",
  color: "var(--legacy-color-0f172a)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
};

const successBtn = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--legacy-color-15803d)",
  background: "var(--legacy-color-15803d)",
  color: "var(--legacy-color-fff)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 6px 12px rgba(21,128,61,0.16)",
};

const dangerBtn = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--legacy-color-b91c1c)",
  background: "var(--legacy-color-b91c1c)",
  color: "var(--legacy-color-fff)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 6px 12px rgba(185,28,28,0.14)",
};

const jobEditorCard = {
  margin: "0 12px 12px",
  border: "1px solid var(--legacy-color-d7dee8)",
  borderRadius: 8,
  padding: 12,
  background: "var(--legacy-color-ffffff)",
};

const jobEditorTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: "var(--legacy-color-0f172a)",
  marginBottom: 6,
};

const jobEditorSubtitle = {
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--legacy-color-5f6f82)",
  marginBottom: 12,
};

const jobGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldLabel = {
  fontSize: 12,
  color: "var(--legacy-color-5f6f82)",
  fontWeight: 900,
  textTransform: "uppercase",
  marginBottom: 6,
};

const fieldInput = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid var(--legacy-color-c8d6e3)",
  background: "var(--legacy-color-fff)",
  color: "var(--legacy-color-0f172a)",
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
  background: "var(--legacy-color-fef2f2)",
  border: "1px solid var(--legacy-color-fecaca)",
  color: "var(--legacy-color-991b1b)",
};

const feedbackSuccess = {
  ...feedbackBase,
  background: "var(--legacy-color-eff6ff)",
  border: "1px solid var(--legacy-color-bfdbfe)",
  color: "var(--legacy-color-1d4ed8)",
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
