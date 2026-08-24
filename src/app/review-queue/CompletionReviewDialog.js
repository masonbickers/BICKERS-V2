"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FilePlus2, FileText, Paperclip, Trash2, Undo2, X } from "lucide-react";
import { Button, Input, Select } from "@/app/components/ui";
import {
  buildCompletionReviewModel,
  validateCompletionReview,
  validateOperationalCompletionReview,
} from "@/app/utils/completionReview";

const initialForm = (job, model = buildCompletionReviewModel(job)) => ({
  generalNotes: job?.generalNotes || "",
  po: job?.po || "",
  invoiceContactName: job?.invoiceContactName || "",
  invoiceContactEmail: job?.invoiceContactEmail || "",
  invoiceContactPhone: job?.invoiceContactPhone || "",
  selectedCrewKeys: model.selectedCrewKeys,
  selectedVehicleKeys: model.selectedVehicleKeys,
  vehicleCrewAssignments: model.vehicleCrewAssignments,
  quoteCoverageConfirmed: model.quoteCoverageConfirmed,
  quoteNotRequired: model.quoteNotRequired,
});

export default function CompletionReviewDialog({ job, vehicleLookup, open, saving, uploadProgress, error, onClose, onConfirm }) {
  const model = useMemo(() => buildCompletionReviewModel(job, vehicleLookup), [job, vehicleLookup]);
  const [form, setForm] = useState(() => initialForm(job, model));
  const [file, setFile] = useState(null);
  const [removedAttachmentIndexes, setRemovedAttachmentIndexes] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const fileInputRef = useRef(null);
  const initialisedJobRef = useRef("");

  useEffect(() => {
    if (!open) {
      initialisedJobRef.current = "";
      return undefined;
    }
    const jobKey = String(job?.id || "");
    if (initialisedJobRef.current === jobKey) return undefined;
    initialisedJobRef.current = jobKey;
    setForm(initialForm(job, model));
    setFile(null);
    setRemovedAttachmentIndexes([]);
    setValidationErrors([]);

    return undefined;
  }, [job, model, open]);

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

  const quoteNumber = model.quoteNumber;
  const quoteHref = useMemo(
    () => (job?.id && quoteNumber ? `/quote-view/${job.id}?quote=${encodeURIComponent(quoteNumber)}` : ""),
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

  const submit = (action) => {
    const validator = action === "complete"
      ? validateOperationalCompletionReview
      : validateCompletionReview;
    const errors = validator({ fields: form, model, form });
    setValidationErrors(errors);
    if (errors.length) return;
    onConfirm({ action, fields: form, reviewForm: form, file, removedAttachmentIndexes });
  };

  const toggleCrew = (key) => {
    setForm((current) => {
      const selected = current.selectedCrewKeys.includes(key);
      const selectedCrewKeys = selected
        ? current.selectedCrewKeys.filter((item) => item !== key)
        : [...current.selectedCrewKeys, key];
      const vehicleCrewAssignments = { ...current.vehicleCrewAssignments };
      if (selected) {
        Object.keys(vehicleCrewAssignments).forEach((vehicle) => {
          if (vehicleCrewAssignments[vehicle] === key) delete vehicleCrewAssignments[vehicle];
        });
      }
      return { ...current, selectedCrewKeys, vehicleCrewAssignments };
    });
  };

  const toggleVehicle = (key) => {
    setForm((current) => {
      const selected = current.selectedVehicleKeys.includes(key);
      const selectedVehicleKeys = selected
        ? current.selectedVehicleKeys.filter((item) => item !== key)
        : [...current.selectedVehicleKeys, key];
      const vehicleCrewAssignments = { ...current.vehicleCrewAssignments };
      if (selected) delete vehicleCrewAssignments[key];
      else if (current.selectedCrewKeys.length === 1) vehicleCrewAssignments[key] = current.selectedCrewKeys[0];
      return {
        ...current,
        selectedVehicleKeys,
        vehicleCrewAssignments,
        quoteCoverageConfirmed: false,
      };
    });
  };

  return (
    <div className="completion-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section
        className="completion-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-dialog-title"
      >
        <form onSubmit={(event) => { event.preventDefault(); submit("ready_to_invoice"); }}>
          <header className="completion-dialog-header">
            <div>
              <div className="completion-dialog-kicker">Complete job</div>
              <h2 id="completion-dialog-title">
                #{job.jobNumber || job.id} · {job.production || job.client || "Job review"}
              </h2>
              <p>Record the completed job, then send it to Finance when the invoicing details are ready.</p>
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

            <div className="completion-dialog-resources completion-dialog-full">
              <div className="completion-dialog-section-title">Crew & vehicles used (if applicable)</div>
              <p>Confirm any booked resources used. Jobs without crew or vehicles can continue without them.</p>

              <div className="completion-dialog-resource-grid">
                <div>
                  <strong className="completion-dialog-resource-label">Actual crew</strong>
                  <div className="completion-dialog-check-list">
                    {model.crew.map((person) => (
                      <label key={person.key} className="completion-dialog-check-row">
                        <input
                          type="checkbox"
                          checked={form.selectedCrewKeys.includes(person.key)}
                          onChange={() => toggleCrew(person.key)}
                          disabled={saving}
                        />
                        <span>{person.label}</span>
                      </label>
                    ))}
                    {!model.crew.length && <div className="completion-dialog-empty">No crew is booked on this job.</div>}
                  </div>
                </div>

                <div>
                  <strong className="completion-dialog-resource-label">Actual vehicles</strong>
                  <div className="completion-dialog-check-list">
                    {model.vehicles.map((vehicle) => (
                      <label key={vehicle.key} className="completion-dialog-check-row">
                        <input
                          type="checkbox"
                          checked={form.selectedVehicleKeys.includes(vehicle.key)}
                          onChange={() => toggleVehicle(vehicle.key)}
                          disabled={saving}
                        />
                        <span>{vehicle.label}</span>
                      </label>
                    ))}
                    {!model.vehicles.length && <div className="completion-dialog-empty">No vehicles are booked on this job.</div>}
                  </div>
                </div>
              </div>

              {form.selectedCrewKeys.length > 0 && form.selectedVehicleKeys.length > 0 && (
                <div className="completion-dialog-assignments">
                  {model.vehicles
                    .filter((vehicle) => form.selectedVehicleKeys.includes(vehicle.key))
                    .map((vehicle) => (
                      <label key={vehicle.key} className="completion-dialog-assignment-row">
                        <span>{vehicle.label}</span>
                        <Select
                          value={form.vehicleCrewAssignments[vehicle.key] || ""}
                          onChange={(event) => setForm((current) => ({
                            ...current,
                            vehicleCrewAssignments: {
                              ...current.vehicleCrewAssignments,
                              [vehicle.key]: event.target.value,
                            },
                          }))}
                          disabled={saving}
                          aria-label={`Crew member responsible for ${vehicle.label}`}
                        >
                          <option value="">All selected crew (default)</option>
                          {model.crew
                            .filter((person) => form.selectedCrewKeys.includes(person.key))
                            .map((person) => <option key={person.key} value={person.key}>{person.label}</option>)}
                        </Select>
                      </label>
                    ))}
                </div>
              )}
            </div>

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
                <div className="completion-dialog-quote-actions">
                  <Link
                    href={`/quote/${job.id}?returnTo=${encodeURIComponent("/review-queue")}`}
                    target="_blank"
                    className="completion-dialog-create-quote"
                  >
                    <FilePlus2 size={14} /> Create quote
                  </Link>
                  <button
                    type="button"
                    className="completion-dialog-add-quote"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                  >
                    <Paperclip size={14} /> Add quote PDF
                  </button>
                </div>
              </div>
              {quoteHref ? (
                <>
                  <Link href={quoteHref} target="_blank" className="completion-dialog-document-link">
                    <FileText size={15} /> Open quote {quoteNumber}
                  </Link>
                  {form.selectedVehicleKeys.length > 0 && (
                    <label className="completion-dialog-quote-confirmation">
                      <input
                        type="checkbox"
                        checked={form.quoteCoverageConfirmed}
                        onChange={(event) => setForm((current) => ({ ...current, quoteCoverageConfirmed: event.target.checked }))}
                        disabled={saving}
                      />
                      <span>
                        Quote {quoteNumber} covers {form.selectedVehicleKeys.length} selected vehicle{form.selectedVehicleKeys.length === 1 ? "" : "s"}
                      </span>
                    </label>
                  )}
                </>
              ) : (
                <>
                  <div className="completion-dialog-empty">No saved quote is linked to this job yet.</div>
                  <label className="completion-dialog-quote-confirmation completion-dialog-no-quote-confirmation">
                    <input
                      type="checkbox"
                      checked={Boolean(form.quoteNotRequired)}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        quoteNotRequired: event.target.checked,
                        quoteCoverageConfirmed: false,
                      }))}
                      disabled={saving}
                    />
                    <span>No quote required</span>
                  </label>
                </>
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
              {(validationErrors.length > 0 || error) && (
                <div className="completion-dialog-error" role="alert">
                  {error || validationErrors.join(" · ")}
                </div>
              )}
            </div>
          </div>

          <footer className="completion-dialog-footer">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="button" variant="secondary" onClick={() => submit("complete")} disabled={saving}>
              {saving ? "Saving…" : "Complete"}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Sending…" : "Ready to Invoice"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
