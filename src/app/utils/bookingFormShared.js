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

  const normaliseVehicleRegistrationForLookup = (value) =>
    String(value || "")
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase();

  const collectVehicleTextVariants = (rawValue) => {
    const text = String(rawValue || "").trim();
    if (!text) return [];

    const out = [];
    const push = (value) => {
      const token = String(value || "").trim();
      if (!token) return;
      if (!out.includes(token)) out.push(token);
    };

    push(text);
    push(text.toUpperCase());
    push(text.toLowerCase());

    const compact = text.replace(/[^a-z0-9]/gi, "");
    if (compact) {
      push(compact);
      push(compact.toUpperCase());
      push(compact.toLowerCase());
    }

    const dashedParts = text
      .split("-")
      .map((part) => part.trim())
      .filter(Boolean);
    dashedParts.forEach((part) => push(part));
    if (dashedParts.length >= 2) {
      push(dashedParts[0]);
      push(dashedParts[dashedParts.length - 1]);
    }

    const slashParts = text
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    slashParts.forEach((part) => push(part));
    if (slashParts.length >= 2) {
      push(slashParts[0]);
      push(slashParts[slashParts.length - 1]);
    }

    const compactMatches = text.match(/[A-Za-z]{1,3}\s*\d{1,4}\s*[A-Za-z]{2,6}/g) || [];
    compactMatches.forEach((match) => {
        const compactMatch = String(match || "").replace(/\s+/g, "").trim();
        if (compactMatch) {
          push(compactMatch);
          push(compactMatch.toUpperCase());
          push(compactMatch.toLowerCase());
        }
      });

    return out;
  };

  const candidateStrings = (raw) => {
    const values = [];
    if (raw && typeof raw === "object") {
      const id = raw.id || raw.vehicleId;
      const reg = raw.registration || raw.reg;
      const name = raw.name || raw.vehicleName;
      if (id) values.push(id);
      if (reg) values.push(reg);
      if (name) values.push(name);
      return values;
    }
    collectVehicleTextVariants(raw).forEach((candidate) => values.push(candidate));
    return values;
  };

  const toId = (value) => {
    if (!value) return "";
    const text = String(value).trim();
    if (!text) return "";

    if (byId[text]) return byId[text].id;

    const upper = text.toUpperCase();
    if (byReg[upper]) return byReg[upper].id;
    const compactUpper = normaliseVehicleRegistrationForLookup(upper);
    if (compactUpper !== upper && byReg[compactUpper]) return byReg[compactUpper].id;

    const lower = text.toLowerCase();
    if (byName[lower]) return byName[lower].id;

    const compactLower = normaliseVehicleRegistrationForLookup(lower);
    if (compactLower !== lower && byReg[compactLower]) return byReg[compactLower].id;

    const dashedParts = text
      .split("-")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of dashedParts) {
      const candidate = String(part).trim();
      if (!candidate) continue;

      const candidateLower = candidate.toLowerCase();
      if (byName[candidateLower]) return byName[candidateLower].id;

      const candidateUpper = candidate.toUpperCase();
      if (byReg[candidateUpper]) return byReg[candidateUpper].id;
      const candidateCompact = normaliseVehicleRegistrationForLookup(candidateUpper);
      if (candidateCompact !== candidateUpper && byReg[candidateCompact]) return byReg[candidateCompact].id;
    }

    if (dashedParts.length >= 2) {
      const lastPart = dashedParts[dashedParts.length - 1];
      const lastUpper = String(lastPart || "").trim().toUpperCase();
      if (lastUpper && byReg[lastUpper]) return byReg[lastUpper].id;
      const lastCompact = normaliseVehicleRegistrationForLookup(lastUpper);
      if (lastCompact !== lastUpper && byReg[lastCompact]) return byReg[lastCompact].id;

      const firstPart = dashedParts[0];
      const firstLower = String(firstPart || "").trim().toLowerCase();
      if (firstLower && byName[firstLower]) return byName[firstLower].id;
    }

    return "";
  };

  const out = [];

  list.forEach((raw) => {
    let match = null;
    for (const candidate of candidateStrings(raw)) {
      const id = toId(candidate);
      if (!id) continue;
      match = byId[id] || null;
      if (match) break;
    }

    if (match?.id) out.push(match.id);
  });

  return Array.from(new Set(out));
};

const addVehicleTokenVariant = (out, raw) => {
  const text = String(raw || "").trim();
  if (!text) return;
  out.add(text);
  out.add(text.toLowerCase());
  out.add(text.toUpperCase());
  const compact = text.replace(/[^a-z0-9]/gi, "");
  if (compact) {
    out.add(compact);
    out.add(compact.toLowerCase());
    out.add(compact.toUpperCase());
  }
};

const collectVehicleIdentityCandidates = (raw) => {
  const values = [];

  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      collectVehicleIdentityCandidates(item).forEach((value) => values.push(value));
    });
    return values;
  }

  if (raw && typeof raw === "object") {
    const id = raw.id || raw.vehicleId;
    const reg = raw.registration || raw.reg;
    const name = raw.name || raw.vehicleName;
    const rawLabel = raw.label;
    if (id) values.push(id);
    if (reg) values.push(reg);
    if (name) values.push(name);
    if (rawLabel) values.push(rawLabel);
  } else {
    const rawText = String(raw || "").trim();
    if (rawText) values.push(rawText);

    const compactMatches = rawText.match(/[A-Za-z]{1,3}\s*\d{1,4}\s*[A-Za-z]{2,6}/g) || [];
    compactMatches.forEach((match) => {
        const compactMatch = String(match || "").replace(/\s+/g, "").trim();
        if (compactMatch) values.push(compactMatch);
      });

    const dashedParts = rawText
      .split("-")
      .map((part) => part.trim())
      .filter(Boolean);
    if (dashedParts.length > 1) {
      values.push(dashedParts[0]);
      values.push(dashedParts[dashedParts.length - 1]);
    }
  }

  return values;
};

export const collectVehicleIdentityKeys = (rawValue, lookup = {}) => {
  const seen = new Set();
  const { byId = {}, byReg = {}, byName = {} } = lookup || {};

  const addFromVehicle = (vehicle) => {
    if (!vehicle || typeof vehicle !== "object") return;
    addVehicleTokenVariant(seen, vehicle.id);
    addVehicleTokenVariant(seen, vehicle.vehicleId);
    addVehicleTokenVariant(seen, vehicle.registration);
    addVehicleTokenVariant(seen, vehicle.reg);
    addVehicleTokenVariant(seen, vehicle.name);
    addVehicleTokenVariant(seen, vehicle.vehicleName);
    addVehicleTokenVariant(seen, vehicle.label);
  };

  const resolved = collectVehicleIdentityCandidates(rawValue);
  for (const value of resolved) {
    addVehicleTokenVariant(seen, value);
    const text = String(value || "").trim();
    if (!text) continue;

    if (byId[text]) addFromVehicle(byId[text]);
    if (byReg[text.toUpperCase()]) addFromVehicle(byReg[text.toUpperCase()]);

    const compact = text.replace(/[^a-z0-9]/gi, "");
    if (compact && byReg[compact.toUpperCase()]) {
      addFromVehicle(byReg[compact.toUpperCase()]);
    }

    const lower = text.toLowerCase();
    if (byName[lower]) addFromVehicle(byName[lower]);
  }

  return Array.from(seen).filter(Boolean);
};

export const collectVehicleIdentityKeySet = (rawList, lookup = {}) => {
  const out = new Set();
  (Array.isArray(rawList) ? rawList : []).forEach((value) => {
    collectVehicleIdentityKeys(value, lookup).forEach((key) => out.add(key));
  });
  return out;
};
