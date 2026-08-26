"use client";

import { Link2, Route, X } from "lucide-react";
import {
  bookingDateKeys,
  normaliseLinkedContinuation,
  overlappingBookingDateKeys,
} from "@/app/utils/linkedBookingContinuation";
import styles from "./LinkedBookingContinuationFields.module.css";

const formatDate = (value) => {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value || "");
};

const candidateLabel = (booking = {}) => {
  const detail = [booking.client, booking.production, booking.location]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
  return `Job ${booking.jobNumber || "Unnumbered"}${detail ? ` · ${detail}` : ""}`;
};

export default function LinkedBookingContinuationFields({
  value,
  onChange,
  candidates = [],
  selectedDates = [],
  currentBookingId = "",
}) {
  const normalised = normaliseLinkedContinuation(value);
  const eligibleCandidates = (candidates || [])
    .filter((booking) => booking?.id && booking.id !== currentBookingId)
    .filter((booking) => overlappingBookingDateKeys(bookingDateKeys(booking), selectedDates).length > 0)
    .sort((a, b) => String(b.jobNumber || "").localeCompare(String(a.jobNumber || "")));
  const selectedBooking = eligibleCandidates.find((booking) => booking.id === normalised?.fromBookingId) || null;
  const overlapDates = selectedBooking
    ? overlappingBookingDateKeys(bookingDateKeys(selectedBooking), selectedDates)
    : normalised?.handoverDate
      ? [normalised.handoverDate]
      : [];

  if (!normalised) {
    return (
      <div className={styles.closedPanel}>
        <div>
          <strong><Route size={15} /> Vehicle or crew continuing from another job?</strong>
          <span>Link the jobs so one controlled handover can share the same resources.</span>
        </div>
        <button
          type="button"
          onClick={() => onChange({
            enabled: true,
            fromBookingId: "",
            fromJobNumber: "",
            handoverDate: "",
            continueVehicles: true,
            continueCrew: true,
          })}
        >
          <Link2 size={14} /> Link job
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <strong><Link2 size={15} /> Linked job continuation</strong>
          <span>Only the selected handover date can overlap.</span>
        </div>
        <button type="button" className={styles.removeButton} onClick={() => onChange(null)} aria-label="Remove linked job">
          <X size={14} /> Remove
        </button>
      </div>

      <label className={styles.field}>
        <span>Previous job</span>
        <select
          value={normalised.fromBookingId}
          onChange={(event) => {
            const booking = eligibleCandidates.find((candidate) => candidate.id === event.target.value);
            const dates = booking
              ? overlappingBookingDateKeys(bookingDateKeys(booking), selectedDates)
              : [];
            onChange({
              ...normalised,
              fromBookingId: booking?.id || "",
              fromJobNumber: String(booking?.jobNumber || ""),
              handoverDate: dates.length === 1 ? dates[0] : "",
            });
          }}
        >
          <option value="">Select an overlapping job</option>
          {eligibleCandidates.map((booking) => (
            <option key={booking.id} value={booking.id}>{candidateLabel(booking)}</option>
          ))}
          {!selectedBooking && normalised.fromBookingId && (
            <option value={normalised.fromBookingId}>Job {normalised.fromJobNumber || "Linked job"}</option>
          )}
        </select>
        {!eligibleCandidates.length && (
          <small>Select dates that overlap the previous job, then return here to link it.</small>
        )}
      </label>

      <label className={styles.field}>
        <span>Handover date</span>
        <select
          value={normalised.handoverDate}
          disabled={!normalised.fromBookingId}
          onChange={(event) => onChange({ ...normalised, handoverDate: event.target.value })}
        >
          <option value="">Select date</option>
          {overlapDates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
        </select>
      </label>

      <div className={styles.resourceChoices}>
        <label>
          <input
            type="checkbox"
            checked={normalised.continueVehicles}
            onChange={(event) => onChange({ ...normalised, continueVehicles: event.target.checked })}
          />
          Same vehicle continues
        </label>
        <label>
          <input
            type="checkbox"
            checked={normalised.continueCrew}
            onChange={(event) => onChange({ ...normalised, continueCrew: event.target.checked })}
          />
          Same driver/crew continues
        </label>
      </div>

      {selectedBooking && normalised.handoverDate && (
        <div className={styles.confirmation}>
          Job {selectedBooking.jobNumber || "previous"} → this job on {formatDate(normalised.handoverDate)}
        </div>
      )}
    </div>
  );
}
