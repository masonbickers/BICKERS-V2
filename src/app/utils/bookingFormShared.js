export const contactIdFromEmail = (email) =>
  (email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_") || null;

export const employeesKey = (employee) =>
  `${employee?.role || ""}::${employee?.name || ""}`;

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
