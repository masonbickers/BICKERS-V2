"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  documentId,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { ArrowLeft, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
} from "@/app/utils/maintenanceSchema";
import { buildMaintenanceHistoryRows } from "@/app/utils/maintenanceHistory";
import {
  appendMaintenanceDocumentToHistory,
  buildMaintenanceDocument,
  getCurrentMaintenanceUploader,
  maintenanceDocumentId,
  normalizeMaintenanceDocument,
  normalizeMaintenanceDocumentList,
  removeMaintenanceDocument,
  removeMaintenanceDocumentFromHistory,
} from "@/app/utils/maintenanceDocuments";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { companyStoragePath } from "@/app/utils/storageAccess";
import { auth, db, storage } from "../../../../../../firebaseConfig";
import styles from "./page.styles.module.css";

const safeArr = (value) => (Array.isArray(value) ? value : []);
const workflowById = Object.fromEntries(
  ADDITIONAL_MAINTENANCE_WORKFLOWS.map((workflow) => [workflow.maintenanceTypeId, workflow])
);
const TYPES = {
  tachoInspection: workflowById.tacho_inspection,
  brakeTest: workflowById.brake_test,
  pmiInspection: workflowById.pmi,
  tachoDownload: workflowById.tacho_download,
  tailLift: workflowById.tail_lift,
  loler: workflowById.loler,
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") return value.toDate();
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
};
const dateOnly = (value) => {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed = toDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
};
const displayDate = (value) => {
  const iso = dateOnly(value);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
};
const safeFileName = (name = "document") =>
  String(name || "document")
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120) || "document";

export default function MaintenanceHistoryPage() {
  const { id, type } = useParams();
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = dataAccessKey(dataAccessState);
  const config = TYPES[type];
  const [vehicle, setVehicle] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [documentFile, setDocumentFile] = useState(null);
  const [savingDocument, setSavingDocument] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");

  useEffect(() => {
    if (!id || !config) {
      setLoading(false);
      return;
    }
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, {
        collectionName: "vehicles",
        operation: "Load maintenance history",
      });
      setError(gate.reason || "This maintenance history could not be loaded.");
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const [vehicleSnap, bookingSnap] = await Promise.all([
          getDocs(
            tenantCollectionQuery(db, "vehicles", dataAccessState, [
              where(documentId(), "==", id),
            ])
          ),
          getDocs(
            tenantCollectionQuery(db, "maintenanceBookings", dataAccessState, [
              where("vehicleId", "==", id),
            ])
          ),
        ]);
        const vehicleDoc = vehicleSnap.docs[0];
        if (!vehicleDoc) {
          setError("Vehicle not found.");
          return;
        }
        setVehicle({ id: vehicleDoc.id, ...(vehicleDoc.data() || {}) });
        setBookings(bookingSnap.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })));
      } catch (loadError) {
        console.error("Failed to load maintenance history:", loadError);
        handleFirestoreAccessError(loadError, {
          collectionName: "vehicles",
          operation: "Load maintenance history",
        });
        setError("This maintenance history could not be loaded.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accessKey, config, dataAccessState, id]);

  const history = useMemo(() => {
    return buildMaintenanceHistoryRows({ vehicle, bookings, workflow: config });
  }, [bookings, config, vehicle]);

  const documents = useMemo(() => {
    if (!vehicle || !config) return [];
    const rows = [];
    safeArr(vehicle[config.documentsField]).forEach((item, index) => {
      const file = normalizeMaintenanceDocument(item, {
        maintenanceTypeId: config.maintenanceTypeId,
        source: "vehicle",
        sourceRecordId: `${config.maintenanceTypeId}-${index}`,
        uploadedAt: vehicle.updatedAt,
      });
      if (file.url) rows.push(file);
    });
    history.forEach((entry) => entry.documents.forEach((item, index) => {
      const file = normalizeMaintenanceDocument(item, {
        maintenanceTypeId: config.maintenanceTypeId,
        source: entry.source,
        sourceRecordId: entry.id || `${entry.date}-${index}`,
        uploadedAt: entry.date,
      });
      if (file.url) rows.push(file);
    }));
    const seen = new Set();
    return rows.filter((file) => {
      const key = maintenanceDocumentId(file);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [config, history, vehicle]);

  const handleUploadDocument = async () => {
    if (!documentFile || !vehicle || !config || savingDocument) return;
    const completedDate = dateOnly(vehicle[config.lastField]) || dateOnly(new Date());
    const path = companyStoragePath(
      dataAccessState,
      `vehicles/${id}/maintenance-documents/${config.maintenanceTypeId}/${completedDate}-${Date.now()}-${safeFileName(documentFile.name)}`
    );
    setSavingDocument(true);
    setDocumentMessage("");
    try {
      const snapshot = await uploadBytes(storageRef(storage, path), documentFile);
      const url = await getDownloadURL(snapshot.ref);
      const maintenanceDocument = buildMaintenanceDocument({
        file: documentFile,
        url,
        storagePath: path,
        maintenanceTypeId: config.maintenanceTypeId,
        source: "history",
        sourceRecordId: completedDate,
        uploadedBy: getCurrentMaintenanceUploader(dataAccessState, auth.currentUser),
      });
      const nextDocuments = [
        ...normalizeMaintenanceDocumentList(vehicle[config.documentsField], {
          maintenanceTypeId: config.maintenanceTypeId,
        }),
        maintenanceDocument,
      ];
      const nextHistory = appendMaintenanceDocumentToHistory(
        vehicle[config.historyField],
        {
          maintenanceTypeId: config.maintenanceTypeId,
          label: config.label,
          completedDate,
          document: maintenanceDocument,
        }
      );
      await updateDoc(
        doc(db, "vehicles", id),
        tenantPayload(dataAccessState, {
          [config.documentsField]: nextDocuments,
          [config.historyField]: nextHistory,
          updatedAt: new Date().toISOString(),
          updatedAtServer: serverTimestamp(),
        })
      );
      setVehicle((current) => ({
        ...current,
        [config.documentsField]: nextDocuments,
        [config.historyField]: nextHistory,
      }));
      setDocumentFile(null);
      setDocumentMessage("Document uploaded.");
    } catch (uploadError) {
      console.error("Failed to upload maintenance document:", uploadError);
      setDocumentMessage("Could not upload the document.");
    } finally {
      setSavingDocument(false);
    }
  };

  const handleDeleteDocument = async (file) => {
    if (!vehicle || !config || deletingDocumentId) return;
    if (!window.confirm(`Delete ${file.name || "this document"}? This cannot be undone.`)) return;
    const fileId = maintenanceDocumentId(file);
    const nextDocuments = removeMaintenanceDocument(
      vehicle[config.documentsField],
      file,
      { maintenanceTypeId: config.maintenanceTypeId }
    );
    const nextHistory = removeMaintenanceDocumentFromHistory(
      vehicle[config.historyField],
      file,
      { maintenanceTypeId: config.maintenanceTypeId }
    );
    setDeletingDocumentId(fileId);
    setDocumentMessage("");
    try {
      await updateDoc(
        doc(db, "vehicles", id),
        tenantPayload(dataAccessState, {
          [config.documentsField]: nextDocuments,
          [config.historyField]: nextHistory,
          updatedAt: new Date().toISOString(),
          updatedAtServer: serverTimestamp(),
        })
      );
      setVehicle((current) => ({
        ...current,
        [config.documentsField]: nextDocuments,
        [config.historyField]: nextHistory,
      }));
      if (file.storagePath || file.url) {
        try {
          await deleteObject(storageRef(storage, file.storagePath || file.url));
        } catch (storageError) {
          if (storageError?.code !== "storage/object-not-found") throw storageError;
        }
      }
      setDocumentMessage("Document deleted.");
    } catch (deleteError) {
      console.error("Failed to delete maintenance document:", deleteError);
      setDocumentMessage("Could not fully delete the document.");
    } finally {
      setDeletingDocumentId("");
    }
  };

  if (!config) return <HeaderSidebarLayout><main className={styles.page}><div className={styles.state}>Maintenance type not found.</div></main></HeaderSidebarLayout>;
  const vehicleLabel = vehicle?.name || vehicle?.registration || vehicle?.reg || "Vehicle";

  return (
    <HeaderSidebarLayout>
      <main className={styles.page}>
        <header className={styles.header}>
          <div><div className={styles.eyebrow}>Maintenance history</div><h1>{config.label}</h1><p>{vehicleLabel} · Schedule, completed records and supporting documents.</p></div>
          <div className={styles.headerActions}>
            <button type="button" onClick={() => router.push(`/vehicle-edit/${id}/timeline`)}>Vehicle timeline</button>
            <button type="button" onClick={() => router.push(`/vehicle-edit/${id}`)}><ArrowLeft size={15} />Back to vehicle</button>
          </div>
        </header>
        {loading ? <div className={styles.state}>Loading maintenance history…</div> : error ? <div className={styles.state}>{error}</div> : (
          <>
            <section className={styles.metrics}>
              <div><span>Last completed</span><strong>{displayDate(vehicle?.[config.lastField])}</strong></div>
              <div><span>Frequency</span><strong>{vehicle?.[config.frequencyField] ? `${vehicle[config.frequencyField]} weeks` : "—"}</strong></div>
              <div><span>Next due</span><strong>{displayDate(vehicle?.[config.nextField])}</strong></div>
              <div><span>ISO week</span><strong>{vehicle?.[config.isoWeekField] || "—"}</strong></div>
            </section>
            <div className={styles.layout}>
              <section>
                <div className={styles.sectionHeader}><div><h2>Inspection history</h2><p>All recorded completions and linked maintenance bookings.</p></div><span>{history.length}</span></div>
                <div className={styles.list}>
                  {history.length ? history.map((entry) => (
                    <article key={entry.id} className={styles.historyCard}>
                      <div className={styles.cardHeader}><div><h3>{displayDate(entry.date)}</h3><span>{entry.status}</span></div>{entry.nextDueDate ? <strong>Next: {displayDate(entry.nextDueDate)}</strong> : null}</div>
                      <div className={styles.details}>{entry.provider ? <span>Provider: {entry.provider}</span> : null}{entry.bookingRef ? <span>Ref: {entry.bookingRef}</span> : null}{entry.odometer ? <span>Odometer: {entry.odometer} mi</span> : null}<span>Source: {entry.source}</span></div>
                      {entry.notes ? <p>{entry.notes}</p> : null}
                      {entry.documents.length ? <div className={styles.inlineDocuments}>{entry.documents.map((file, index) => {
                        return file.url ? (
                          <div key={`${maintenanceDocumentId(file)}-${index}`} className={styles.inlineDocument}>
                            <a href={file.url} target="_blank" rel="noreferrer"><FileText size={13} />{file.name || `Document ${index + 1}`}</a>
                            <button
                              type="button"
                              aria-label={`Delete ${file.name}`}
                              disabled={deletingDocumentId === maintenanceDocumentId(file)}
                              onClick={() => handleDeleteDocument(file)}
                            ><Trash2 size={12} /></button>
                          </div>
                        ) : null;
                      })}</div> : null}
                    </article>
                  )) : <div className={styles.state}>No completed history has been recorded yet.</div>}
                </div>
              </section>
              <aside>
                <div className={styles.sectionHeader}><div><h2>Documents</h2><p>All supporting files for this maintenance type.</p></div><span>{documents.length}</span></div>
                <div className={styles.uploadBox}>
                  <label>
                    <span>Upload document</span>
                    <input
                      type="file"
                      onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!documentFile || savingDocument}
                    onClick={handleUploadDocument}
                  ><Upload size={14} />{savingDocument ? "Uploading…" : "Upload"}</button>
                  {documentMessage ? <p>{documentMessage}</p> : null}
                </div>
                <div className={styles.documentList}>
                  {documents.length ? documents.map((file) => (
                    <div key={file.id} className={styles.documentRow}>
                      <a href={file.url} target="_blank" rel="noreferrer">
                        <FileText size={17} />
                        <div>
                          <strong>{file.name}</strong>
                          <span>{file.source} · {displayDate(file.uploadedAt)}</span>
                          <span>Uploaded by {file.uploadedBy?.name || file.uploadedBy?.email || "Unknown"}</span>
                        </div>
                        <ExternalLink size={14} />
                      </a>
                      <button
                        type="button"
                        aria-label={`Delete ${file.name}`}
                        disabled={deletingDocumentId === maintenanceDocumentId(file)}
                        onClick={() => handleDeleteDocument(file)}
                      ><Trash2 size={14} /></button>
                    </div>
                  )) : <div className={styles.state}>No documents are attached.</div>}
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
    </HeaderSidebarLayout>
  );
}
