import {
  buildBookingDerivedFields,
  buildNextLifecycle,
  buildNextStatusHistory,
  buildSynchronizedVehicleStatus,
  canonicalBookingStatus,
  isInactiveBookingStatus,
} from "./bookingLifecycle.js";

export const REOPENED_BOOKING_STATUS = "Enquiry";

const cleanText = (value) => String(value || "").trim();
const normaliseKey = (value) => cleanText(value).toLowerCase().replace(/\s+/g, " ");
const normalisePhoneKey = (value) => cleanText(value).replace(/\D/g, "");

const normaliseContact = (contact = {}) => ({
  department: cleanText(contact.department || contact.contactDepartment),
  name: cleanText(contact.name || contact.contactName || contact.fullName),
  email: cleanText(contact.email || contact.contactEmail),
  phone: cleanText(contact.phone || contact.number || contact.contactPhone || contact.contactNumber),
});

const contactsMatch = (left, right) => {
  const leftEmail = normaliseKey(left.email);
  const rightEmail = normaliseKey(right.email);
  if (leftEmail && rightEmail && leftEmail === rightEmail) return true;

  const leftName = normaliseKey(left.name);
  const rightName = normaliseKey(right.name);
  const leftPhone = normalisePhoneKey(left.phone);
  const rightPhone = normalisePhoneKey(right.phone);
  if (
    leftPhone &&
    leftPhone === rightPhone &&
    (!leftName || !rightName || leftName === rightName)
  ) {
    return true;
  }

  const leftDepartment = normaliseKey(left.department);
  const rightDepartment = normaliseKey(right.department);
  return Boolean(
    leftName &&
      rightName &&
      leftName === rightName &&
      leftDepartment &&
      leftDepartment === rightDepartment
  );
};

const mergeMissingContactFields = (preferred, duplicate) => ({
  department: preferred.department || duplicate.department,
  name: preferred.name || duplicate.name,
  email: preferred.email || duplicate.email,
  phone: preferred.phone || duplicate.phone,
});

export function deduplicateJobContacts(contacts = []) {
  return (Array.isArray(contacts) ? contacts : []).reduce((result, rawContact) => {
    const contact = normaliseContact(rawContact);
    if (!contact.department && !contact.name && !contact.email && !contact.phone) return result;

    const matchIndex = result.findIndex((candidate) => contactsMatch(candidate, contact));
    if (matchIndex === -1) return [...result, contact];

    const next = [...result];
    next[matchIndex] = mergeMissingContactFields(next[matchIndex], contact);
    return next;
  }, []);
}

export function normalizeJobContacts(job = {}) {
  const primaryContact = normaliseContact({
    department: job.contactDepartment || job.department,
    name: job.contactName,
    email: job.contactEmail,
    phone: job.contactPhone || job.contactNumber,
  });
  const contacts = [];
  if (primaryContact.department || primaryContact.name || primaryContact.email || primaryContact.phone) {
    contacts.push(primaryContact);
  }
  if (Array.isArray(job.additionalContacts)) contacts.push(...job.additionalContacts);
  return deduplicateJobContacts(contacts);
}

export function formatJobContacts(job = {}, separator = "\n") {
  const rows = normalizeJobContacts(job)
    .map((contact) => {
      const identity = [contact.department, contact.name].filter(Boolean).join(" · ");
      const details = [contact.email, contact.phone].filter(Boolean).join(" · ");
      return [identity, details].filter(Boolean).join(separator);
    })
    .filter(Boolean);
  return rows.length ? rows.join(separator) : null;
}

export function formatJobLocation(value) {
  const location = cleanText(value);
  if (!location || location !== location.toLowerCase()) return location;
  return location.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function getJobNumberBackLabel(returnHref = "") {
  const href = cleanText(returnHref);
  return href === "/enquiry" || href.startsWith("/enquiry?")
    ? "Back to Enquiries"
    : "Back to Jobs Sheets";
}

export function getStatusTransitionWarnings({
  targetStatus = "",
  bookingBlockers = [],
  invoiceBlockers = [],
} = {}) {
  const status = normaliseKey(targetStatus);
  const blockers = status === "complete"
    ? bookingBlockers
    : status === "ready to invoice"
    ? invoiceBlockers
    : [];

  return (Array.isArray(blockers) ? blockers : [])
    .filter((blocker) => blocker && blocker.key !== "status")
    .map((blocker) => cleanText(blocker.actionLabel || blocker.label || blocker.key))
    .filter(Boolean);
}

export function buildJobFileRows({ attachments = [], currentPdfUrl = "" } = {}) {
  const currentUrl = cleanText(currentPdfUrl);
  const rows = (Array.isArray(attachments) ? attachments : []).map((attachment, index) => ({
    ...attachment,
    name: cleanText(attachment?.name) || `Attachment ${index + 1}`,
    url: cleanText(attachment?.url),
    isCurrentPdf: Boolean(currentUrl && cleanText(attachment?.url) === currentUrl),
    isSynthetic: false,
  }));

  if (currentUrl && !rows.some((row) => row.isCurrentPdf)) {
    rows.unshift({
      name: "Current PDF",
      url: currentUrl,
      isCurrentPdf: true,
      isSynthetic: true,
    });
  }
  return rows;
}

export function formatProductionIdentity(job = {}, fallback = "Booking") {
  const values = [job.client, job.production]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const uniqueValues = values.filter(
    (value, index) =>
      values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index
  );
  return uniqueValues.join(" · ") || fallback;
}

export function isLockedJobStatus(status = "") {
  return isInactiveBookingStatus(status) && canonicalBookingStatus(status) !== "Deleted";
}

export function lockedBookingMessage(status = "") {
  const label = canonicalBookingStatus(status);
  return `This booking is marked ${label} and is view-only. Invoicing and timesheets are not required.`;
}

export function buildReopenBookingPayload(job = {}, { timestamp, actor = {} } = {}) {
  const changedAt = timestamp || new Date().toISOString();
  const previousStatus = canonicalBookingStatus(job.status);
  const actorEmail = String(actor.email || "Unknown").trim() || "Unknown";
  const actorUid = String(actor.uid || "").trim();
  const statusHistory = buildNextStatusHistory(
    job.statusHistory,
    previousStatus,
    REOPENED_BOOKING_STATUS,
    changedAt,
    { email: actorEmail, uid: actorUid }
  );
  const lifecycle = buildNextLifecycle(
    job.lifecycle,
    previousStatus,
    REOPENED_BOOKING_STATUS,
    changedAt
  );
  const derivedFields = buildBookingDerivedFields({
    ...job,
    status: REOPENED_BOOKING_STATUS,
  });

  return {
    status: REOPENED_BOOKING_STATUS,
    vehicleStatus: buildSynchronizedVehicleStatus(job, REOPENED_BOOKING_STATUS),
    statusChangedAt: changedAt,
    lastEditedBy: actorEmail,
    lastEditedByUid: actorUid,
    updatedAt: changedAt,
    statusHistory,
    lifecycle,
    ...derivedFields,
    history: [
      ...(Array.isArray(job.history) ? job.history : []),
      {
        action: "Reopened",
        user: actorEmail,
        timestamp: changedAt,
        changes: [`Status: ${previousStatus} to ${REOPENED_BOOKING_STATUS}`],
        details: `Reopened from ${previousStatus}. Allocations require review.`,
      },
    ],
  };
}
