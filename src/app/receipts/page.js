"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileUp,
  Pencil,
  ReceiptText,
  RotateCcw,
  Send,
  Trash2,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { BusinessPage, BusinessPageHeader } from "@/app/components/BusinessPage";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Select,
  Spinner,
  StatCard,
  Tabs,
  Textarea,
} from "@/app/components/ui";
import { useAuth } from "@/app/context/authContext";
import { getFirebaseStorageTools, db } from "@/app/utils/firebaseClient";
import { SINGLE_COMPANY_ID } from "@/app/utils/firestoreAccess";
import { hasFinanceAccess } from "@/app/utils/accessControl";
import {
  buildReceiptCsv,
  canCloseReceiptGroup,
  currentMonthKey,
  moneyToPence,
  normalizeReceiptStatus,
  penceToMoney,
  previousStatementMonthKey,
  receiptGroupId,
  receiptGroupStatusLabel,
  receiptMonthLabel,
  receiptStatusLabel,
  safeReceiptFileName,
  suggestedVatPence,
  summarizeReceipts,
} from "@/app/utils/receipts";
import styles from "./page.module.css";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function timestampMs(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "Just uploaded";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function currency(pence) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(pence || 0) / 100);
}

function receiptTone(status) {
  const normalized = normalizeReceiptStatus(status);
  if (["vat_claimed", "no_vat"].includes(normalized)) return "success";
  if (normalized === "queried") return "warning";
  if (normalized === "checked") return "info";
  return "warning";
}

function groupTone(status) {
  if (status === "closed") return "success";
  if (status === "action_required") return "warning";
  if (status === "submitted") return "info";
  return "warning";
}

export default function ReceiptsPage() {
  const { user, userDoc, isAdmin, accessReady, isEnabled } = useAuth() || {};
  const canReview = Boolean(isAdmin || hasFinanceAccess(userDoc));
  const companyId = String(userDoc?.companyId || SINGLE_COMPANY_ID);
  const maxMonth = currentMonthKey();
  const [mode, setMode] = useState(canReview ? "finance" : "mine");
  const [monthKey, setMonthKey] = useState(() => previousStatementMonthKey());
  const [receipts, setReceipts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [purpose, setPurpose] = useState("");
  const [value, setValue] = useState("");
  const [file, setFile] = useState(null);
  const [editingReceipt, setEditingReceipt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [expanded, setExpanded] = useState({});
  const [vatDrafts, setVatDrafts] = useState({});
  const [queryDrafts, setQueryDrafts] = useState({});
  const fileRef = useRef(null);
  const dragDepthRef = useRef(0);

  const ownGroupId = receiptGroupId(companyId, user?.uid, monthKey);
  const ownGroup = groups.find((row) => row.id === ownGroupId) || null;
  const ownReceipts = receipts.filter((row) => row.submitterUid === user?.uid);
  const ownSummary = useMemo(() => summarizeReceipts(ownReceipts), [ownReceipts]);

  useEffect(() => {
    if (!accessReady || !isEnabled || !user?.uid) return undefined;
    setLoading(true);
    const constraints = [where("companyId", "==", companyId), where("monthKey", "==", monthKey)];
    if (mode === "mine") constraints.push(where("submitterUid", "==", user.uid));
    const unsubs = [
      onSnapshot(query(collection(db, "receipts"), ...constraints), (snapshot) => {
        setReceipts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt)));
        setLoading(false);
      }, (error) => {
        console.error("Receipt load failed:", error);
        setNotice({ type: "danger", message: "Receipts could not be loaded." });
        setLoading(false);
      }),
      onSnapshot(query(collection(db, "receiptGroups"), ...constraints), (snapshot) => {
        setGroups(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [accessReady, companyId, isEnabled, mode, monthKey, user?.uid]);

  useEffect(() => {
    if (!canReview || mode !== "finance" || !user) return undefined;
    let cancelled = false;
    user.getIdToken().then((token) => fetch(`/api/receipts/participants?companyId=${encodeURIComponent(companyId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    })).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load users.");
      if (!cancelled) setParticipants(data.participants || []);
    }).catch((error) => {
      console.error("Receipt participants failed:", error);
      if (!cancelled) setNotice({ type: "danger", message: error.message });
    });
    return () => { cancelled = true; };
  }, [canReview, companyId, mode, user]);

  const financeRows = useMemo(() => {
    const groupByUid = new Map(groups.map((group) => [group.submitterUid, group]));
    const receiptsByUid = receipts.reduce((map, row) => {
      if (!map.has(row.submitterUid)) map.set(row.submitterUid, []);
      map.get(row.submitterUid).push(row);
      return map;
    }, new Map());
    return participants.map((participant) => {
      const participantUids = [...new Set([participant.uid, ...(participant.uids || [])].filter(Boolean))];
      const participantGroups = participantUids.map((uid) => groupByUid.get(uid)).filter(Boolean);
      const group = participantGroups.find((candidate) => candidate.submitterUid === participant.uid) || participantGroups[0] || null;
      const userReceipts = participantUids.flatMap((uid) => receiptsByUid.get(uid) || []);
      return { participant, group, receipts: userReceipts, summary: summarizeReceipts(userReceipts) };
    });
  }, [groups, participants, receipts]);

  const financeTotals = useMemo(() => summarizeReceipts(receipts), [receipts]);

  const authFetch = async (url, body) => {
    const token = await user.getIdToken();
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The receipt action failed.");
    return data;
  };

  const selectFile = (nextFile) => {
    if (!nextFile) return false;
    if (!ALLOWED_TYPES.has(nextFile.type)) {
      setNotice({ type: "danger", message: "Choose a PDF or receipt photo." });
      return false;
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      setNotice({ type: "danger", message: "Receipt files must be 15 MB or smaller." });
      return false;
    }
    setFile(nextFile);
    setNotice(null);
    return true;
  };

  const chooseFile = (event) => {
    if (!selectFile(event.target.files?.[0])) event.target.value = "";
  };

  const uploadFile = async (receiptId, nextFile) => {
    const storageTools = await getFirebaseStorageTools();
    const fileName = safeReceiptFileName(nextFile.name);
    const storageName = `${Date.now()}-${fileName}`;
    const path = `companies/${companyId}/receipts/${user.uid}/${receiptId}/${storageName}`;
    const target = storageTools.ref(storageTools.storage, path);
    const task = storageTools.uploadBytesResumable(target, nextFile, { contentType: nextFile.type });
    await new Promise((resolve, reject) => task.on("state_changed", (snapshot) => {
      setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
    }, reject, resolve));
    return { target, path, fileName, fileType: nextFile.type, fileSize: nextFile.size };
  };

  const resetForm = () => {
    setPurpose(""); setValue(""); setFile(null); setEditingReceipt(null); setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const saveReceipt = async () => {
    const valuePence = moneyToPence(value);
    if (!purpose.trim()) return setNotice({ type: "danger", message: "Enter what the receipt is for." });
    if (!valuePence || valuePence <= 0) return setNotice({ type: "danger", message: "Enter a valid gross value." });
    if (!editingReceipt && !file) return setNotice({ type: "danger", message: "Choose or drop a receipt file." });
    setSaving(true); setNotice(null); setProgress(0);
    let uploaded = null;
    try {
      if (editingReceipt) {
        if (file) uploaded = await uploadFile(editingReceipt.id, file);
        const filePatch = uploaded ? { storagePath: uploaded.path, fileName: uploaded.fileName, fileType: uploaded.fileType, fileSize: uploaded.fileSize } : {};
        if (normalizeReceiptStatus(editingReceipt.status) === "queried") {
          await authFetch(`/api/receipts/${editingReceipt.id}/resubmit`, { purpose: purpose.trim(), valuePence, ...filePatch });
        } else {
          await updateDoc(doc(db, "receipts", editingReceipt.id), {
            purpose: purpose.trim(), valuePence, suggestedVatPence: suggestedVatPence(valuePence), ...filePatch, updatedAt: serverTimestamp(),
          });
        }
        if (uploaded && editingReceipt.storagePath && editingReceipt.storagePath !== uploaded.path) {
          const storageTools = await getFirebaseStorageTools();
          await storageTools.deleteObject(storageTools.ref(storageTools.storage, editingReceipt.storagePath)).catch(() => {});
        }
      } else {
        const receiptRef = doc(collection(db, "receipts"));
        uploaded = await uploadFile(receiptRef.id, file);
        const groupRef = doc(db, "receiptGroups", ownGroupId);
        const batch = writeBatch(db);
        if (!ownGroup) batch.set(groupRef, {
          companyId, submitterUid: user.uid,
          submitterName: userDoc?.name || userDoc?.displayName || user.displayName || user.email || "User",
          monthKey, status: "draft", declaredNoReceipts: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        batch.set(receiptRef, {
          companyId, submitterUid: user.uid,
          submitterName: userDoc?.name || userDoc?.displayName || user.displayName || user.email || "User",
          submitterEmail: userDoc?.email || user.email || "", monthKey, groupId: ownGroupId,
          purpose: purpose.trim(), valuePence, suggestedVatPence: suggestedVatPence(valuePence), vatPence: 0,
          storagePath: uploaded.path, fileName: uploaded.fileName, fileType: uploaded.fileType, fileSize: uploaded.fileSize,
          status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        await batch.commit();
      }
      resetForm();
      setNotice({ type: "success", message: editingReceipt ? "Receipt updated." : `Receipt added to ${receiptMonthLabel(monthKey)}.` });
    } catch (error) {
      if (uploaded && !editingReceipt) {
        const storageTools = await getFirebaseStorageTools();
        await storageTools.deleteObject(uploaded.target).catch(() => {});
      }
      console.error("Receipt save failed:", error);
      setNotice({ type: "danger", message: error.message || "Receipt could not be saved." });
    } finally { setSaving(false); setProgress(0); }
  };

  const startEdit = (row) => {
    setEditingReceipt(row); setPurpose(row.purpose || ""); setValue(penceToMoney(row.valuePence)); setFile(null); setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeReceipt = async (row) => {
    if (!await systemDialogs.confirmSystem(`Delete “${row.purpose || row.fileName}”?`)) return;
    setBusyKey(`delete:${row.id}`);
    try {
      await deleteDoc(doc(db, "receipts", row.id));
      const storageTools = await getFirebaseStorageTools();
      await storageTools.deleteObject(storageTools.ref(storageTools.storage, row.storagePath)).catch(() => {});
      setNotice({ type: "success", message: "Receipt deleted." });
    } catch (error) { setNotice({ type: "danger", message: error.message }); }
    finally { setBusyKey(""); }
  };

  const transitionGroup = async ({ group, participant }, action) => {
    const targetId = group?.id || receiptGroupId(companyId, participant.uid, monthKey);
    setBusyKey(`${action}:${targetId}`);
    try {
      await authFetch(`/api/receipts/groups/${encodeURIComponent(targetId)}/transition`, {
        action, companyId, submitterUid: participant.uid, submitterName: participant.name, monthKey,
      });
      setNotice({ type: "success", message: action === "close" ? "Month closed." : action === "reopen" ? "Month reopened." : "Month submitted." });
    } catch (error) { setNotice({ type: "danger", message: error.message }); }
    finally { setBusyKey(""); }
  };

  const reviewReceipt = async (row, action) => {
    const vatPence = moneyToPence(vatDrafts[row.id] ?? penceToMoney(row.vatPence || row.suggestedVatPence));
    const queryNote = String(queryDrafts[row.id] || "").trim();
    setBusyKey(`${action}:${row.id}`);
    try {
      await authFetch(`/api/receipts/${row.id}/review`, { action, vatPence, queryNote });
      setQueryDrafts((current) => ({ ...current, [row.id]: "" }));
      setNotice({ type: "success", message: "Receipt review updated." });
    } catch (error) { setNotice({ type: "danger", message: error.message }); }
    finally { setBusyKey(""); }
  };

  const openEvidence = async (row) => {
    setBusyKey(`open:${row.id}`);
    try {
      const storageTools = await getFirebaseStorageTools();
      const url = await storageTools.getDownloadURL(storageTools.ref(storageTools.storage, row.storagePath));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch { setNotice({ type: "danger", message: "The receipt file could not be opened." }); }
    finally { setBusyKey(""); }
  };

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([`\uFEFF${buildReceiptCsv(receipts)}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `receipts-${monthKey}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const dragHandlers = {
    onDragEnter: (event) => { event.preventDefault(); dragDepthRef.current += 1; if (!saving) setDragActive(true); },
    onDragOver: (event) => { event.preventDefault(); event.dataTransfer.dropEffect = saving ? "none" : "copy"; },
    onDragLeave: (event) => { event.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDragActive(false); },
    onDrop: (event) => { event.preventDefault(); dragDepthRef.current = 0; setDragActive(false); if (!saving) selectFile(event.dataTransfer.files?.[0]); },
  };

  const canAdd = !ownGroup || ownGroup.status === "draft";

  const receiptCard = (row, finance = false) => (
    <Card
      key={row.id}
      className={`${styles.receiptCard} ${finance ? "" : styles.receiptCardCompact}`}
    >
      <div className={styles.receiptIdentity}>
        <ReceiptText size={21} />
        <div><strong>{row.purpose || row.fileName}</strong><span>{currency(row.valuePence)} · {formatTimestamp(row.createdAt)}</span></div>
      </div>
      <Badge variant={receiptTone(row.status)}>{receiptStatusLabel(normalizeReceiptStatus(row.status))}</Badge>
      {row.queryNote && normalizeReceiptStatus(row.status) === "queried" ? <Alert variant="warning" className={styles.queryAlert}><strong>Finance query:</strong> {row.queryNote}</Alert> : null}
      {finance ? (
        <div className={styles.reviewPanel}>
          <FormField label="VAT amount (£)"><Input type="number" min="0" step="0.01" value={vatDrafts[row.id] ?? penceToMoney(row.vatPence || row.suggestedVatPence)} onChange={(event) => setVatDrafts((current) => ({ ...current, [row.id]: event.target.value }))} /></FormField>
          <FormField label="Query reason"><Textarea value={queryDrafts[row.id] || ""} onChange={(event) => setQueryDrafts((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Required when raising a query" /></FormField>
          <div className={styles.reviewActions}>
            <Button size="sm" variant="secondary" onClick={() => openEvidence(row)} loading={busyKey === `open:${row.id}`}><ExternalLink size={14} /> Open</Button>
            <Button size="sm" variant="secondary" onClick={() => reviewReceipt(row, "checked")} loading={busyKey === `checked:${row.id}`}><Check size={14} /> Checked</Button>
            <Button size="sm" variant="danger" onClick={() => reviewReceipt(row, "queried")} loading={busyKey === `queried:${row.id}`}><AlertCircle size={14} /> Query</Button>
            <Button size="sm" variant="success" onClick={() => reviewReceipt(row, "vat_claimed")} loading={busyKey === `vat_claimed:${row.id}`}><CheckCircle2 size={14} /> VAT claimed</Button>
            <Button size="sm" variant="secondary" onClick={() => reviewReceipt(row, "no_vat")} loading={busyKey === `no_vat:${row.id}`}><XCircle size={14} /> No VAT</Button>
          </div>
        </div>
      ) : (
        <div className={styles.rowActions}>
          <Button size="sm" variant="secondary" onClick={() => openEvidence(row)} loading={busyKey === `open:${row.id}`}><ExternalLink size={14} /> Open</Button>
          {(canAdd || normalizeReceiptStatus(row.status) === "queried") ? <Button size="sm" variant="secondary" onClick={() => startEdit(row)}><Pencil size={14} /> {normalizeReceiptStatus(row.status) === "queried" ? "Correct & resubmit" : "Edit"}</Button> : null}
          {canAdd ? <Button size="sm" variant="danger" onClick={() => removeReceipt(row)} loading={busyKey === `delete:${row.id}`}><Trash2 size={14} /> Delete</Button> : null}
        </div>
      )}
    </Card>
  );

  return (
    <HeaderSidebarLayout>
      <BusinessPage>
        <BusinessPageHeader title="Receipts" subtitle="Monthly receipt groups for staff submissions and VAT review." actions={<div className={styles.headerActions}>{canReview ? <Tabs items={[{ value: "mine", label: "My receipts" }, { value: "finance", label: "Finance review" }]} value={mode} onChange={setMode} /> : null}<Input className={styles.monthInput} type="month" max={maxMonth} value={monthKey} onChange={(event) => setMonthKey(event.target.value)} /></div>} />
        {notice ? <Alert className={styles.notice} variant={notice.type}>{notice.message}</Alert> : null}
        {loading ? <div className={styles.loading}><Spinner /> Loading {receiptMonthLabel(monthKey)}…</div> : mode === "finance" && canReview ? (
          <>
            <div className={styles.stats}><StatCard label="Expected users" value={participants.length} hint={receiptMonthLabel(monthKey)} icon={<Users size={20} />} /><StatCard label="Gross receipts" value={currency(financeTotals.grossPence)} hint={`${financeTotals.count} receipt(s)`} icon={<ReceiptText size={20} />} /><StatCard label="Reclaimable VAT" value={currency(financeTotals.actualVatPence)} hint={`Suggested ${currency(financeTotals.suggestedVatPence)}`} icon={<CheckCircle2 size={20} />} /><StatCard label="Action required" value={financeTotals.queried} hint={`${financeTotals.resolved}/${financeTotals.count} resolved`} icon={<AlertCircle size={20} />} /></div>
            <div className={styles.sectionHeading}><div><h2>{receiptMonthLabel(monthKey)} user groups</h2><p>Open a user to review their submitted receipts.</p></div><Button variant="secondary" onClick={exportCsv} disabled={!receipts.length}><Download size={16} /> Export CSV</Button></div>
            <div className={styles.groupList}>{financeRows.map((entry) => {
              const status = entry.group?.status || "not_started"; const open = expanded[entry.participant.uid] === true;
              return <Card key={entry.participant.uid} className={styles.groupCard}>
                <button type="button" className={styles.groupHeader} onClick={() => setExpanded((current) => ({ ...current, [entry.participant.uid]: !open }))}>
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<span className={styles.groupName}>{entry.participant.name}</span><span>{entry.summary.count} receipt(s)</span><strong>{currency(entry.summary.grossPence)}</strong><Badge variant={groupTone(status)}>{receiptGroupStatusLabel(status)}</Badge>
                </button>
                {open ? <div className={styles.groupBody}>
                  <div className={styles.groupActions}>
                    {status === "not_started" ? <Button size="sm" variant="secondary" onClick={() => transitionGroup(entry, "declare_none")} loading={busyKey.startsWith("declare_none:")}>Declare none</Button> : null}
                    {status === "draft" ? <Button size="sm" onClick={() => transitionGroup(entry, entry.receipts.length ? "submit" : "declare_none")} loading={busyKey.startsWith("submit:") || busyKey.startsWith("declare_none:")}><Send size={14} /> Submit for user</Button> : null}
                    {["submitted", "closed"].includes(status) ? <Button size="sm" variant="secondary" onClick={() => transitionGroup(entry, "reopen")} loading={busyKey.startsWith("reopen:")}><RotateCcw size={14} /> Reopen</Button> : null}
                    {entry.group && canCloseReceiptGroup(entry.group, entry.receipts) ? <Button size="sm" variant="success" onClick={() => transitionGroup(entry, "close")} loading={busyKey.startsWith("close:")}><CheckCircle2 size={14} /> Close month</Button> : null}
                  </div>
                  {entry.receipts.length ? <div className={styles.receiptList}>{entry.receipts.map((row) => receiptCard(row, true))}</div> : <EmptyState title={status === "not_started" ? "Not started" : "No receipts declared"} description={status === "not_started" ? "This user has not submitted this month." : "This month contains no receipts."} />}
                </div> : null}
              </Card>;
            })}</div>
          </>
        ) : (
          <>
            {ownGroup?.status === "action_required" ? <Alert variant="warning" className={styles.notice}><strong>Finance needs a correction.</strong> Open the queried receipt below, make the requested change and resubmit it.</Alert> : null}
            <div className={styles.stats}><StatCard label="Month status" value={receiptGroupStatusLabel(ownGroup?.status || "not_started")} hint={receiptMonthLabel(monthKey)} icon={<Send size={20} />} /><StatCard label="Receipts" value={ownSummary.count} hint={currency(ownSummary.grossPence)} icon={<ReceiptText size={20} />} /><StatCard label="Action required" value={ownSummary.queried} hint={`${ownSummary.resolved} resolved`} icon={<AlertCircle size={20} />} /></div>
            {canAdd || editingReceipt ? <section className={styles.section}><div className={styles.sectionHeading}><div><h2>{editingReceipt ? "Update receipt" : "Add a receipt"}</h2><p>Enter the purpose and gross amount, then drag in the receipt.</p></div></div><Card className={styles.uploadShell}>
              <div className={styles.uploadRow}><FormField label="What is it for?" required><Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="e.g. Fuel for job 2451" maxLength={160} /></FormField><FormField label="Gross value (£)" required><Input type="number" inputMode="decimal" min="0.01" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0.00" /></FormField><FormField label={editingReceipt ? "Replacement file (optional)" : "Receipt file"} required={!editingReceipt}><div className={`${styles.uploadCard} ${dragActive ? styles.uploadCardActive : ""}`} {...dragHandlers}><input ref={fileRef} className={styles.hiddenFileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={chooseFile} /><div className={styles.uploadIcon}><UploadCloud size={20} /></div><div className={styles.uploadCopy}><strong>{dragActive ? "Drop receipt here" : file ? file.name : editingReceipt ? "Keep current file or replace" : "Drag and drop receipt"}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready to upload` : "PDF or photo · Maximum 15 MB"}</span></div><Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={saving}><FileUp size={14} /> Choose</Button></div></FormField><div className={styles.uploadActions}>{editingReceipt ? <Button variant="secondary" onClick={resetForm}>Cancel</Button> : null}<Button onClick={saveReceipt} loading={saving}>{saving ? `Uploading ${progress}%` : editingReceipt && normalizeReceiptStatus(editingReceipt.status) === "queried" ? "Resubmit" : editingReceipt ? "Save changes" : "Add receipt"}</Button></div></div>
            </Card></section> : null}
            <section className={styles.section}><div className={styles.sectionHeading}><div><h2>{receiptMonthLabel(monthKey)} receipts</h2><p>{canAdd ? "Build your group, then submit it to finance." : "This month has been submitted to finance."}</p></div><div className={styles.formActions}>{canAdd && ownReceipts.length ? <Button onClick={() => transitionGroup({ group: ownGroup, participant: { uid: user.uid, name: userDoc?.name || user.email || "User" } }, "submit")} loading={busyKey.startsWith("submit:")}><Send size={15} /> Submit month</Button> : null}{canAdd && !ownReceipts.length ? <Button variant="secondary" onClick={() => transitionGroup({ group: ownGroup, participant: { uid: user.uid, name: userDoc?.name || user.email || "User" } }, "declare_none")} loading={busyKey.startsWith("declare_none:")}>Declare no receipts</Button> : null}</div></div>
              {ownReceipts.length ? <div className={styles.receiptList}>{ownReceipts.map((row) => receiptCard(row, false))}</div> : <EmptyState icon={<ReceiptText size={28} />} title="No receipts this month" description="Add your first receipt or declare that you have none." />}
            </section>
          </>
        )}
      </BusinessPage>
    </HeaderSidebarLayout>
  );
}
