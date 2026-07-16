export const CONTENT_LABEL_SCHEMA_VERSION = 1;

export const CONTENT_LABEL_DEFINITIONS = [
  ["app.name", "Application name", "Bickers Booking", "Branding", []],
  ["login.title", "Login title", "Bickers Booking", "Branding", []],
  ["login.subtitle", "Login subtitle", "Secure company access", "Branding", []],
  ["navigation.home", "Home navigation", "Home", "Navigation", []],
  ["navigation.bookings", "Bookings navigation", "Bookings", "Navigation", []],
  ["navigation.vehicles", "Vehicles navigation", "Vehicles", "Navigation", []],
  ["navigation.employees", "Employees navigation", "Employees", "Navigation", []],
  ["navigation.equipment", "Equipment navigation", "Equipment", "Navigation", []],
  ["navigation.admin", "Admin navigation", "Admin", "Navigation", []],
  ["actions.save", "Save action", "Save", "Common actions", []],
  ["actions.cancel", "Cancel action", "Cancel", "Common actions", []],
  ["actions.search", "Search action", "Search", "Common actions", []],
  ["actions.add", "Add action", "Add", "Common actions", []],
  ["actions.edit", "Edit action", "Edit", "Common actions", []],
  ["actions.delete", "Delete action", "Delete", "Common actions", []],
  ["actions.refresh", "Refresh action", "Refresh", "Common actions", []],
  ["terms.booking.one", "Booking singular", "Booking", "Terminology", []],
  ["terms.booking.other", "Booking plural", "Bookings", "Terminology", []],
  ["terms.job.one", "Job singular", "Job", "Terminology", []],
  ["terms.job.other", "Job plural", "Jobs", "Terminology", []],
  ["terms.vehicle.one", "Vehicle singular", "Vehicle", "Terminology", []],
  ["terms.vehicle.other", "Vehicle plural", "Vehicles", "Terminology", []],
  ["terms.employee.one", "Employee singular", "Employee", "Terminology", []],
  ["terms.employee.other", "Employee plural", "Employees", "Terminology", []],
  ["terms.equipment.one", "Equipment singular", "Equipment", "Terminology", []],
  ["terms.equipment.other", "Equipment plural", "Equipment", "Terminology", []],
  ["terms.customer.one", "Customer singular", "Customer", "Terminology", []],
  ["terms.customer.other", "Customer plural", "Customers", "Terminology", []],
  ["dashboard.title", "Dashboard title", "Dashboard overview", "Help and empty states", []],
  ["dashboard.introduction", "Dashboard introduction", "Your operational overview and upcoming work.", "Help and empty states", []],
  ["empty.noResults", "No results message", "No matching results were found.", "Help and empty states", []],
  ["empty.noBookings", "No bookings message", "No bookings are available.", "Help and empty states", []],
];

export const DEFAULT_CONTENT_LABELS = Object.freeze(
  Object.fromEntries(CONTENT_LABEL_DEFINITIONS.map(([key, , fallback]) => [key, fallback]))
);

const definitionMap = new Map(CONTENT_LABEL_DEFINITIONS.map((definition) => [definition[0], definition]));

function cleanLabel(value, fallback) {
  const text = String(value ?? "").replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240);
  return text || fallback;
}

export function normalizeContentLabels(value = {}) {
  const source = value?.labels && typeof value.labels === "object" ? value.labels : value;
  return Object.fromEntries(
    CONTENT_LABEL_DEFINITIONS.map(([key, , fallback]) => [key, cleanLabel(source?.[key], fallback)])
  );
}

export function validateContentLabels(value = {}) {
  const source = value?.labels && typeof value.labels === "object" ? value.labels : value;
  const errors = [];
  Object.entries(source || {}).forEach(([key, raw]) => {
    const definition = definitionMap.get(key);
    if (!definition) return errors.push({ key, message: "This label is not editable." });
    const text = String(raw ?? "");
    if (/<[^>]*>/.test(text)) errors.push({ key, message: "HTML is not allowed." });
    if (text.trim().length > 240) errors.push({ key, message: "Labels must be 240 characters or fewer." });
    const allowed = new Set(definition[4] || []);
    const placeholders = [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]);
    placeholders.filter((placeholder) => !allowed.has(placeholder)).forEach((placeholder) => errors.push({ key, message: `Placeholder {${placeholder}} is not allowed.` }));
  });
  return { valid: errors.length === 0, errors };
}

export function formatContentLabel(labels, key, values = {}) {
  const normalized = normalizeContentLabels(labels);
  const fallback = DEFAULT_CONTENT_LABELS[key] || key;
  return String(normalized[key] || fallback).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
}

export function contentLabelGroups() {
  return CONTENT_LABEL_DEFINITIONS.reduce((groups, [key, label, fallback, group]) => {
    groups[group] ||= [];
    groups[group].push({ key, label, fallback });
    return groups;
  }, {});
}
