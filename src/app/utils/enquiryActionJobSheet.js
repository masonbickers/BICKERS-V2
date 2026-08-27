const text = (value) => String(value ?? "").trim();

const asDate = (value) => {
  if (!value) return null;
  const date = value?.toDate
    ? value.toDate()
    : typeof value?.seconds === "number"
      ? new Date(value.seconds * 1000)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatActionSheetDate = (value) => {
  const date = asDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/London",
  });
};

const contactFromLegacyFields = (enquiry) => ({
  name: text(enquiry.contactName || enquiry.invoiceContactName),
  department: text(enquiry.contactDepartment || enquiry.invoiceContactDepartment),
  phone: text(enquiry.contactNumber || enquiry.contactPhone || enquiry.invoiceContactPhone),
  mobile: text(enquiry.contactMobile || enquiry.mobile),
  email: text(enquiry.contactEmail || enquiry.invoiceContactEmail),
});

const normalizeContact = (contact = {}) => ({
  name: text(contact.name),
  department: text(contact.department === "Other" ? contact.departmentOther : contact.department),
  phone: text(contact.phone || contact.number || contact.telephone),
  mobile: text(contact.mobile),
  email: text(contact.email),
});

const hasContactValue = (contact) => Object.values(contact).some(Boolean);

const vehicleLabel = (vehicle) => {
  if (typeof vehicle === "string") return text(vehicle);
  if (!vehicle || typeof vehicle !== "object") return "";
  const name = text(vehicle.name || vehicle.vehicleName || [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" "));
  const registration = text(vehicle.registration || vehicle.reg).toUpperCase();
  return [name, registration].filter(Boolean).join(" - ");
};

const unique = (values) => Array.from(new Set(values.map(text).filter(Boolean)));

const collectReferenceNumbers = (enquiry, singularKey, collectionKey) => {
  const values = [enquiry[singularKey]];
  if (Array.isArray(enquiry[collectionKey])) {
    values.push(...enquiry[collectionKey].map((entry) => entry?.quoteNumber || entry?.invoiceNumber || entry));
  }
  return unique(values).join(", ");
};

const collectDates = (enquiry) => {
  if (Array.isArray(enquiry.bookingDates) && enquiry.bookingDates.length) {
    return unique(enquiry.bookingDates.map(formatActionSheetDate)).join(", ");
  }
  const start = formatActionSheetDate(enquiry.startDateISO || enquiry.startDate || enquiry.dateISO || enquiry.date);
  const end = formatActionSheetDate(enquiry.endDateISO || enquiry.endDate);
  return start && end && start !== end ? `${start} to ${end}` : start;
};

export const buildEnquiryActionJobSheetData = (enquiry = {}, printedAt = new Date()) => {
  const contacts = (Array.isArray(enquiry.additionalContacts) ? enquiry.additionalContacts : [])
    .map(normalizeContact)
    .filter(hasContactValue);
  const legacyContact = contactFromLegacyFields(enquiry);
  if (!contacts.length && hasContactValue(legacyContact)) contacts.push(legacyContact);
  if (!contacts.length) contacts.push(normalizeContact());

  const explicitVehicleNames = Array.isArray(enquiry.vehicleNames)
    ? enquiry.vehicleNames
    : text(enquiry.vehicleNames) && text(enquiry.vehicleNames) !== "-"
      ? text(enquiry.vehicleNames).split(/\s*,\s*/)
      : [];
  const vehicles = unique([
    ...explicitVehicleNames,
    ...(Array.isArray(enquiry.selectedVehicles) ? enquiry.selectedVehicles.map(vehicleLabel) : []),
  ]);
  const equipment = unique(Array.isArray(enquiry.equipment) ? enquiry.equipment : []);

  return {
    jobNumber: text(enquiry.jobNumber),
    productionType: text(enquiry.productionType || enquiry.typeOfProduction),
    quoteNumbers: collectReferenceNumbers(enquiry, "quoteNumber", "savedQuotes"),
    poNumbers: unique([enquiry.po, ...(Array.isArray(enquiry.poNumbers) ? enquiry.poNumbers : [])]).join(", "),
    invoiceNumbers: collectReferenceNumbers(enquiry, "invoiceNumber", "invoices"),
    client: text(enquiry.client || enquiry.productionCompany),
    production: text(enquiry.production || enquiry.productionName),
    shootType: text(enquiry.shootType),
    location: text(enquiry.location),
    dates: collectDates(enquiry),
    contacts,
    vehicles,
    equipment,
    notes: text(enquiry.notes || enquiry.description || enquiry.jobDescription),
    hasHS: Boolean(enquiry.hasHS),
    hasClientInsurance: Boolean(enquiry.hasClientInsurance || enquiry.clientInsurance),
    hasHotel: Boolean(enquiry.hasHotel || Number(enquiry.hotelNights) > 0),
    enquiryDate: formatActionSheetDate(enquiry.createdAt || enquiry.addedAt || enquiry.updatedAt || printedAt),
    printedDate: formatActionSheetDate(printedAt),
  };
};
