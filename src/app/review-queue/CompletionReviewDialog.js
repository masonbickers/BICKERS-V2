"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FilePlus2, FileText, Paperclip, Trash2, Undo2, X } from "lucide-react";
import { Button, Input } from "@/app/components/ui";

const initialForm = (job) => ({
  generalNotes: job?.generalNotes || "",
  po: job?.po || "",
  invoiceContactName: job?.invoiceContactName || "",
  invoiceContactEmail: job?.invoiceContactEmail || "",
  invoiceContactPhone: job?.invoiceContactPhone || "",
});

export default function CompletionReviewDialog({ job, open, saving, uploadProgress, error, onClose, onConfirm }) {
  const [form, setForm] = useState(() => initialForm(job));
  const [file, setFile] = useState(null);
  const [removedAttachmentIndexes, setRemovedAttachmentIndexes] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setForm(initialForm(job));
    setFile(null);
    setRemovedAttachmentIndexes([]);

    return undefined;
  }, [job, open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open, saving]);

  const quoteNumber = String(job?.acceptedQuoteNumber || job?.quoteNumber || "").trim();
  const quoteHref = useMemo(
    () => (job?.id && quoteNumber ? `/quote/${job.id}?quote=${encodeURIComponent(quoteNumber)}` : ""),
    [job?.id, quoteNumber]
  );
  const attachments = Array.isArray(job?.attachments) ? job.attachments : [];
  const visibleAttachments = attachments
    .map((attachment, index) => ({ attachment, index }))
    .filter(({ index }) => !removedAttachmentIndexes.includes(index));

  if (!open || !job) return null;

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const submit = (event) => {
    event.preventDefault();
    onConfirm({ fields: form, file, removedAttachmentIndexes });
  };

  return (
    <div className="completion-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section
        className="completion-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-dialog-title"
      >
        <form onSubmit={submit}>
          <header className="completion-dialog-header">
            <div>
              <div className="completion-dialog-kicker">Complete job</div>
              <h2 id="completion-dialog-title">
                #{job.jobNumber || job.id} · {job.production || job.client || "Job review"}
              </h2>
              <p>Add the handover information now, then mark the job as complete.</p>
            </div>
            <button type="button" className="completion-dialog-close" onClick={onClose} disabled={saving} aria-label="Close">
              <X size={18} />
            </button>
          </header>

          <div className="completion-dialog-body">
            <label className="completion-dialog-field completion-dialog-full">
              <span>General summary / notes</span>
              <textarea
                rows={2}
                value={form.generalNotes}
                onChange={updateField("generalNotes")}
                placeholder="Add a general summary for Finance…"
                disabled={saving}
              />
            </label>

            <div className="completion-dialog-section-title completion-dialog-full">Invoicing & PO details</div>
            <label className="completion-dialog-field">
              <span>Name</span>
              <Input
                value={form.invoiceContactName}
                onChange={updateField("invoiceContactName")}
                placeholder="Accounts contact name"
                disabled={saving}
              />
            </label>
            <label className="completion-dialog-field">
              <span>Email</span>
              <Input
                type="email"
                value={form.invoiceContactEmail}
                onChange={updateField("invoiceContactEmail")}
                placeholder="Accounts email"
                disabled={saving}
              />
            </label>
            <label className="completion-dialog-field">
              <span>Purchase Order (PO)</span>
              <Input
                value={form.po}
                onChange={updateField("po")}
                placeholder="Enter PO reference…"
                disabled={saving}
              />
            </label>
            <label className="completion-dialog-field">
              <span>Phone (optional)</span>
              <Input
                type="tel"
                value={form.invoiceContactPhone}
                onChange={updateField("invoiceContactPhone")}
                placeholder="Accounts phone"
                disabled={saving}
              />
            </label>

            <div className="completion-dialog-documents completion-dialog-full">
              <div className="completion-dialog-documents-heading">
                <div className="completion-dialog-section-title">Quote & attachments</div>
                <button
                  type="button"
                  className="completion-dialog-add-quote"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  <FilePlus2 size={14} /> Add quote PDF
                </button>
              </div>
              {quoteHref ? (
                <Link href={quoteHref} target="_blank" className="completion-dialog-document-link">
                  <FileText size={15} /> Open quote {quoteNumber}
                </Link>
              ) : (
                <div className="completion-dialog-empty">No saved quote is linked to this job yet.</div>
              )}

              {visibleAttachments.length > 0 && (
                <div className="completion-dialog-existing">
                  {visibleAttachments.map(({ attachment, index }) => (
                    <div className="completion-dialog-existing-row" key={`${attachment?.url || attachment?.name || "attachment"}-${index}`}>
                      <a href={attachment?.url} target="_blank" rel="noreferrer">
                        <Paperclip size={13} /> {attachment?.name || `Attachment ${index + 1}`}
                      </a>
                      <button
                        type="button"
                        className="completion-dialog-remove"
                        onClick={() => setRemovedAttachmentIndexes((current) => [...current, index])}
                        disabled={saving}
                        aria-label={`Remove ${attachment?.name || `attachment ${index + 1}`}`}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {removedAttachmentIndexes.length > 0 && (
                <button
                  type="button"
                  className="completion-dialog-undo"
                  onClick={() => setRemovedAttachmentIndexes([])}
                  disabled={saving}
                >
                  <Undo2 size={13} /> Undo {removedAttachmentIndexes.length} removal{removedAttachmentIndexes.length === 1 ? "" : "s"}
                </button>
              )}

              <label className="completion-dialog-upload">
                <span>{file ? "Quote PDF ready to add" : "Attach quote / job PDF"}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  disabled={saving}
                />
                <small>{file ? file.name : "Optional · PDF only"}</small>
                {file && (
                  <button type="button" className="completion-dialog-remove" onClick={() => setFile(null)} disabled={saving}>
                    <X size={13} /> Clear
                  </button>
                )}
              </label>
              {saving && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="completion-dialog-progress" role="status">Uploading PDF… {uploadProgress}%</div>
              )}
              {error && <div className="completion-dialog-error" role="alert">{error}</div>}
            </div>
          </div>

          <footer className="completion-dialog-footer">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save & mark complete"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
