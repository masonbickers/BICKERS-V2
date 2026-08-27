export const contactIdFromEmail = (email) =>
  (email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_") || null;

export const hasBookingContactDetails = (contacts) =>
  (Array.isArray(contacts) ? contacts : []).some((contact) => {
    const hasName = Boolean(String(contact?.name || "").trim());
    const hasEmailOrPhone = [contact?.email, contact?.phone, contact?.number].some((value) =>
      String(value || "").trim()
    );
    return hasName && hasEmailOrPhone;
  });

export const hasBookingProductionIdentity = ({ client, production } = {}) =>
  [client, production].some((value) => Boolean(String(value || "").trim()));

export const canSaveEnquiryWithoutContact = ({ status, userEmail } = {}) =>
  String(status || "").trim().toLowerCase() === "enquiry" &&
  String(userEmail || "").trim().toLowerCase() === "mason@bickers.co.uk";

export const canSaveEnquiryWithoutProductionCompany = ({ status, userEmail } = {}) =>
  String(status || "").trim().toLowerCase() === "enquiry" &&
  String(userEmail || "").trim().toLowerCase() === "mason@bickers.co.uk";

const attachmentName = (attachment) => {
  if (attachment && typeof attachment === "object") {
    return String(attachment.name || attachment.label || "").trim();
  }
  if (typeof attachment !== "string") return "";

  try {
    const decoded = decodeURIComponent(attachment).split("?")[0];
    return decoded.split("/").pop() || decoded;
  } catch {
    return attachment.split("?")[0].split("/").pop() || attachment;
  }
};

export const findMismatchedQuoteAttachments = (jobNumber, attachments) => {
  const bookingJobNumbers = new Set(String(jobNumber || "").match(/\d{4,}/g) || []);
  if (!bookingJobNumbers.size) return [];

  return (Array.isArray(attachments) ? attachments : []).flatMap((attachment) => {
    const name = attachmentName(attachment);
    const quoteJobNumber = name.match(/(?:^|[^a-z0-9])Q(\d{4,})(?=[^0-9]|$)/i)?.[1] || "";
    return quoteJobNumber && !bookingJobNumbers.has(quoteJobNumber)
      ? [{ attachment, name, quoteJobNumber }]
      : [];
  });
};

export const employeesKey = (employee) =>
  `${employee?.role || ""}::${employee?.name || ""}`;

export const normalizeJobNumberForLookup = (jobNumber) =>
  String(jobNumber || "").trim().toLowerCase();

const bookingRecency = (booking) => {
  const raw = booking?.updatedAt || booking?.createdAt || booking?.date || 0;
  const value = typeof raw?.toDate === "function" ? raw.toDate() : raw;
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizeBookingContact = (contact) => ({
  department: String(contact?.department || "").trim(),
  departmentOther: String(contact?.departmentOther || "").trim(),
  name: String(contact?.name || "").trim(),
  email: String(contact?.email || "").trim(),
  phone: String(contact?.phone || contact?.number || "").trim(),
});

const bookingContactKey = (contact) => {
  const email = contact.email.toLowerCase();
  if (email) return `email:${email}`;
  const phone = contact.phone.replace(/\D/g, "");
  if (phone) return `phone:${phone}`;
  return `name:${contact.name.toLowerCase()}::${contact.department.toLowerCase()}`;
};

export const mergeBookingContacts = (...contactLists) => {
  const seen = new Set();
  const merged = [];

  contactLists.flat().forEach((rawContact) => {
    const contact = normalizeBookingContact(rawContact);
    if (!contact.department && !contact.name && !contact.email && !contact.phone) return;
    const key = bookingContactKey(contact);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(contact);
  });

  return merged;
};

const normalizedComparisonValue = (value) =>
  String(value || "").trim().toLowerCase();

const bookingContactsSignature = (contacts) =>
  mergeBookingContacts(contacts)
    .map((contact) =>
      [contact.department, contact.departmentOther, contact.name, contact.email, contact.phone]
        .map(normalizedComparisonValue)
        .join("::")
    )
    .sort()
    .join("||");

export const getExistingJobDetailMismatches = (currentDetails = {}, existingDetails = {}) => {
  const mismatches = [];
  const existingClient = String(existingDetails.client || "").trim();
  const existingProduction = String(existingDetails.production || "").trim();
  const existingContacts = mergeBookingContacts(existingDetails.additionalContacts || []);

  if (
    existingClient &&
    normalizedComparisonValue(currentDetails.client) !== normalizedComparisonValue(existingClient)
  ) {
    mismatches.push("client");
  }
  if (
    existingProduction &&
    normalizedComparisonValue(currentDetails.production) !== normalizedComparisonValue(existingProduction)
  ) {
    mismatches.push("production");
  }
  if (
    existingContacts.length &&
    bookingContactsSignature(currentDetails.additionalContacts) !==
      bookingContactsSignature(existingContacts)
  ) {
    mismatches.push("contacts");
  }

  return mismatches;
};

export const buildExistingJobDetailsLookup = (bookings) => {
  const grouped = new Map();

  (bookings || []).forEach((booking) => {
    const key = normalizeJobNumberForLookup(booking?.jobNumber);
    if (!key) return;
    const existing = grouped.get(key) || [];
    existing.push(booking || {});
    grouped.set(key, existing);
  });

  const lookup = {};
  grouped.forEach((matches, key) => {
    const newestFirst = [...matches].sort((a, b) => bookingRecency(b) - bookingRecency(a));
    const client = newestFirst.find((booking) => String(booking?.client || "").trim())?.client || "";
    const production = newestFirst.find((booking) => String(booking?.production || "").trim())?.production || "";
    const additionalContacts = mergeBookingContacts(
      newestFirst.find(
        (booking) =>
          Array.isArray(booking?.additionalContacts) && booking.additionalContacts.length
      )?.additionalContacts || []
    );

    if (!String(client).trim() && !String(production).trim() && !additionalContacts.length) return;
    lookup[key] = {
      client: String(client).trim(),
      production: String(production).trim(),
      additionalContacts,
      bookingCount: matches.length,
    };
  });

  return lookup;
};

export const uniqEmpObjects = (items) => {
  const seen = new Set();
  const out = [];

  (items || []).forEach((employee) => {
    if (!employee?.name || !employee?.role) return;
    const key = employeesKey(employee);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ role: employee.role, name: employee.name });
  });

  return out;
};

export const normalizeVehicleKeysListForLookup = (list, lookup) => {
  if (!Array.isArray(list) || !list.length) return [];
  const { byId = {}, byReg = {}, byName = {} } = lookup || {};
  const out = [];

  list.forEach((raw) => {
    let match = null;

    if (raw && typeof raw === "object") {
      const id = raw.id || raw.vehicleId;
      const reg = raw.registration;
      const name = raw.name;

      if (id && byId[id]) match = byId[id];
      else if (reg && byReg[String(reg).toUpperCase()]) match = byReg[String(reg).toUpperCase()];
      else if (name && byName[String(name).toLowerCase()]) match = byName[String(name).toLowerCase()];
    } else {
      const value = String(raw || "").trim();
      if (!value) return;
      if (byId[value]) match = byId[value];
      else if (byReg[value.toUpperCase()]) match = byReg[value.toUpperCase()];
      else if (byName[value.toLowerCase()]) match = byName[value.toLowerCase()];
    }

    if (match?.id) out.push(match.id);
  });

  return Array.from(new Set(out));
};
