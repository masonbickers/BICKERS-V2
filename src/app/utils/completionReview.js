const text = (value) => String(value ?? "").trim();

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

export const COMPLETION_REVIEW_DESTINATION_STATUS = "Ready to Invoice";

export const crewKey = (person, index = 0) =>
  text(
    typeof person === "string"
      ? person
      : person?.id || person?.employeeId || person?.uid || person?.email || person?.name || person?.displayName
  ) || `crew-${index}`;

export const crewLabel = (person) =>
  text(
    typeof person === "string"
      ? person
      : person?.name || person?.displayName || person?.employeeName || person?.email
  ) || "Unknown crew member";

export const vehicleKey = (vehicle, index = 0) =>
  text(
    typeof vehicle === "string"
      ? vehicle
      : vehicle?.id || vehicle?.vehicleId || vehicle?.registration || vehicle?.reg || vehicle?.name
  ) || `vehicle-${index}`;

export const vehicleLabel = (vehicle) => {
  if (typeof vehicle === "string") return text(vehicle) || "Unknown vehicle";
  const name = text(vehicle?.name || vehicle?.vehicleName || vehicle?.label);
  const registration = text(vehicle?.registration || vehicle?.reg).toUpperCase();
  return name && registration ? `${name} (${registration})` : name || registration || "Unknown vehicle";
};

export const resolveAcceptedQuoteNumber = (job = {}) => {
  job = job && typeof job === "object" ? job : {};
  const direct = text(job.acceptedQuoteNumber || job.quoteNumber);
  if (direct) return direct;
  const versions = Array.isArray(job.quoteVersions) ? job.quoteVersions : [];
  const accepted = versions.find((quote) =>
    ["accepted", "approved"].includes(text(quote?.status).toLowerCase())
  );
  return text(accepted?.quoteNumber || accepted?.number);
};

const normaliseCrew = (job = {}) => {
  job = job && typeof job === "object" ? job : {};
  const booked = Array.isArray(job.employees) ? job.employees : [];
  return booked.map((source, index) => ({
    key: crewKey(source, index),
    label: crewLabel(source),
    source,
  }));
};

const resolveVehicle = (source, lookup = {}) => {
  const key = vehicleKey(source);
  const registration = text(typeof source === "object" ? source?.registration || source?.reg : source).toUpperCase();
  const name = text(typeof source === "object" ? source?.name || source?.vehicleName || source?.label : source).toLowerCase();
  return (
    lookup.byId?.[key] ||
    lookup.byReg?.[registration] ||
    lookup.byName?.[name] ||
    source
  );
};

const normaliseVehicles = (job = {}, vehicleLookup = {}) => {
  job = job && typeof job === "object" ? job : {};
  const booked = Array.isArray(job.vehicles) ? job.vehicles : [];
  return booked.map((source, index) => ({
    key: vehicleKey(source, index),
    label: vehicleLabel(resolveVehicle(source, vehicleLookup)),
    source,
  }));
};

export function buildCompletionReviewModel(job = {}, vehicleLookup = {}) {
  job = job && typeof job === "object" ? job : {};
  const crew = normaliseCrew(job);
  const vehicles = normaliseVehicles(job, vehicleLookup);
  const actualCrew = Array.isArray(job.actualCrew) && job.actualCrew.length ? job.actualCrew : null;
  const actualVehicles = Array.isArray(job.actualVehicles) && job.actualVehicles.length ? job.actualVehicles : null;
  const selectedCrewKeys = unique(
    (actualCrew || crew.map((item) => item.source)).map((person, index) => crewKey(person, index))
  );
  const selectedVehicleKeys = unique(
    (actualVehicles || vehicles.map((item) => item.source)).map((vehicle, index) => vehicleKey(vehicle, index))
  );
  const storedAssignments = Array.isArray(job.vehicleCrewAssignments) ? job.vehicleCrewAssignments : [];
  const vehicleCrewAssignments = {};
  for (const assignment of storedAssignments) {
    const vehicle = text(assignment?.vehicleKey || assignment?.vehicleId);
    const crewMember = text(assignment?.crewKey || assignment?.employeeId || assignment?.crewName);
    if (!vehicle || !crewMember) continue;
    if (vehicleCrewAssignments[vehicle] && vehicleCrewAssignments[vehicle] !== crewMember) {
      vehicleCrewAssignments[vehicle] = "";
    } else if (!(vehicle in vehicleCrewAssignments)) {
      vehicleCrewAssignments[vehicle] = crewMember;
    }
  }
  if (!storedAssignments.length && selectedCrewKeys.length === 1) {
    selectedVehicleKeys.forEach((key) => {
      vehicleCrewAssignments[key] = selectedCrewKeys[0];
    });
  }

  const quoteNumber = resolveAcceptedQuoteNumber(job);
  const quoteNotRequired = Boolean(
    job.quoteNotRequired === true || job.quoteRequirement?.notRequired === true
  );
  const coveredVehicleKeys = unique(
    Array.isArray(job.quoteVehicleCoverage?.vehicleKeys)
      ? job.quoteVehicleCoverage.vehicleKeys.map(text)
      : Array.isArray(job.quoteVehicleIds)
        ? job.quoteVehicleIds.map(text)
        : []
  );
  const quoteCoverageConfirmed = Boolean(
    job.quoteVehicleCoverage?.confirmed === true &&
      quoteNumber &&
      text(job.quoteVehicleCoverage?.quoteNumber) === quoteNumber &&
      selectedVehicleKeys.length > 0 &&
      selectedVehicleKeys.every((key) => coveredVehicleKeys.includes(key))
  );

  return {
    crew,
    vehicles,
    quoteNumber,
    selectedCrewKeys,
    selectedVehicleKeys,
    vehicleCrewAssignments,
    quoteCoverageConfirmed,
    quoteNotRequired,
  };
}

export function validateCompletionReview({ fields = {}, model = {}, form = {} } = {}) {
  const errors = [];
  const selectedCrewKeys = unique(form.selectedCrewKeys || []);
  const selectedVehicleKeys = unique(form.selectedVehicleKeys || []);
  const assignments = form.vehicleCrewAssignments || {};

  if (!text(fields.generalNotes)) errors.push("Add completion notes");
  if (!text(fields.po)) errors.push("Add the PO number");
  if (!text(fields.invoiceContactName)) errors.push("Add the finance contact name");
  const email = text(fields.invoiceContactEmail);
  if (!email) errors.push("Add the finance contact email");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid finance contact email");
  const quoteNotRequired = form.quoteNotRequired === true && !text(model.quoteNumber);
  if (!text(model.quoteNumber) && !quoteNotRequired) {
    errors.push("Link an accepted quote or confirm no quote is required");
  }
  if (selectedCrewKeys.length && selectedVehicleKeys.length) {
    for (const key of selectedVehicleKeys) {
      const assignedCrewKey = text(assignments[key]);
      if (assignedCrewKey && !selectedCrewKeys.includes(assignedCrewKey)) {
        const label = model.vehicles?.find((vehicle) => vehicle.key === key)?.label || "Each vehicle";
        errors.push(`Select a valid crew member for ${label}`);
      }
    }
  }
  if (selectedVehicleKeys.length && text(model.quoteNumber) && !form.quoteCoverageConfirmed) {
    errors.push("Confirm the accepted quote covers the selected vehicles");
  }
  return unique(errors);
}

export function validateOperationalCompletionReview({ fields = {}, model = {}, form = {} } = {}) {
  const errors = [];
  const selectedCrewKeys = unique(form.selectedCrewKeys || []);
  const selectedVehicleKeys = unique(form.selectedVehicleKeys || []);
  const assignments = form.vehicleCrewAssignments || {};

  if (selectedCrewKeys.length && selectedVehicleKeys.length) {
    for (const key of selectedVehicleKeys) {
      const assignedCrewKey = text(assignments[key]);
      if (assignedCrewKey && !selectedCrewKeys.includes(assignedCrewKey)) {
        const label = model.vehicles?.find((vehicle) => vehicle.key === key)?.label || "Each vehicle";
        errors.push(`Select a valid crew member for ${label}`);
      }
    }
  }
  return unique(errors);
}

export function buildCompletionReviewPatch({ job = {}, fields = {}, model = {}, form = {}, completedAt = "" } = {}) {
  const selectedCrew = (model.crew || []).filter((item) => form.selectedCrewKeys.includes(item.key));
  const selectedVehicles = (model.vehicles || []).filter((item) => form.selectedVehicleKeys.includes(item.key));
  const assignments = selectedVehicles.flatMap((vehicle) => {
    const assignedCrewKey = text(form.vehicleCrewAssignments?.[vehicle.key]);
    const assignedCrew = assignedCrewKey
      ? selectedCrew.filter((person) => person.key === assignedCrewKey)
      : selectedCrew;
    return assignedCrew.map((person) => ({
      vehicleKey: vehicle.key,
      vehicleName: vehicle.label,
      crewKey: person.key,
      crewName: person.label,
    }));
  });
  const vehicleKeys = selectedVehicles.map((vehicle) => vehicle.key);
  const confirmationTime = completedAt || new Date().toISOString();
  const quoteNotRequired = form.quoteNotRequired === true && !text(model.quoteNumber);

  return {
    generalNotes: text(fields.generalNotes),
    po: text(fields.po),
    invoiceContactName: text(fields.invoiceContactName),
    invoiceContactEmail: text(fields.invoiceContactEmail).toLowerCase(),
    invoiceContactPhone: text(fields.invoiceContactPhone),
    actualCrew: selectedCrew.map((item) => item.source),
    actualVehicles: selectedVehicles.map((item) => item.source),
    vehicleCrewAssignments: assignments,
    quoteNotRequired,
    quoteRequirement: {
      notRequired: quoteNotRequired,
      confirmedAt: quoteNotRequired ? confirmationTime : "",
    },
    quoteVehicleIds: quoteNotRequired ? [] : vehicleKeys,
    quoteVehicleCoverage: {
      quoteNumber: quoteNotRequired ? "" : model.quoteNumber,
      vehicleKeys: quoteNotRequired ? [] : vehicleKeys,
      confirmed: !quoteNotRequired && Boolean(text(model.quoteNumber)),
      confirmedAt: !quoteNotRequired && text(model.quoteNumber) ? confirmationTime : "",
    },
  };
}

export function timesheetLinksToJob(timesheet = {}, jobId = "") {
  const target = text(jobId);
  if (!target) return false;
  if (text(timesheet.jobId) === target) return true;
  if (Array.isArray(timesheet.jobSnapshot?.bookingIds) && timesheet.jobSnapshot.bookingIds.some((id) => text(id) === target)) {
    return true;
  }
  return Object.values(timesheet.days || {}).some((entry) => text(entry?.bookingId) === target);
}
