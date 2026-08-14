export const contactIdFromEmail = (email) =>
  (email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_") || null;

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
