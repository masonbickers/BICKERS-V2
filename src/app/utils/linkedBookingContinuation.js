const text = (value) => String(value || "").trim();

export const linkedEmployeeKey = (employee = {}) => {
  if (typeof employee === "string") return text(employee).toLowerCase();
  const name = text(employee?.name).toLowerCase();
  const role = text(employee?.role).toLowerCase();
  return name ? `${role}::${name}` : "";
};

export const linkedEmployeeName = (employee = {}) =>
  text(typeof employee === "string" ? employee : employee?.name).toLowerCase();

export const bookingDateKeys = (booking = {}) =>
  Array.from(
    new Set(
      (Array.isArray(booking?.bookingDates) ? booking.bookingDates : [])
        .map((date) => text(date).slice(0, 10))
        .filter(Boolean)
    )
  ).sort();

export const overlappingBookingDateKeys = (firstDates = [], secondDates = []) => {
  const first = new Set((firstDates || []).map((date) => text(date).slice(0, 10)).filter(Boolean));
  return Array.from(
    new Set(
      (secondDates || [])
        .map((date) => text(date).slice(0, 10))
        .filter((date) => date && first.has(date))
    )
  ).sort();
};

export const normaliseLinkedContinuation = (value) => {
  if (!value || typeof value !== "object") return null;
  const fromBookingId = text(value.fromBookingId);
  const fromJobNumber = text(value.fromJobNumber);
  const handoverDate = text(value.handoverDate).slice(0, 10);
  if (!fromBookingId && !fromJobNumber && value.enabled !== true) return null;

  return {
    enabled: true,
    fromBookingId,
    fromJobNumber,
    handoverDate,
    continueVehicles: value.continueVehicles !== false,
    continueCrew: value.continueCrew !== false,
    sharedVehicleIds: Array.from(
      new Set((value.sharedVehicleIds || []).map(text).filter(Boolean))
    ),
    sharedEmployeeKeys: Array.from(
      new Set((value.sharedEmployeeKeys || []).map(text).filter(Boolean))
    ),
    sharedEmployeeNames: Array.from(
      new Set((value.sharedEmployeeNames || []).map((name) => text(name).toLowerCase()).filter(Boolean))
    ),
  };
};

const uniqueText = (values = []) => Array.from(new Set(values.map(text).filter(Boolean)));

const linkedVehicleKeys = (vehicle) => {
  if (typeof vehicle === "string") return [text(vehicle)];
  if (!vehicle || typeof vehicle !== "object") return [];
  return uniqueText([
    vehicle.id,
    vehicle.vehicleId,
    vehicle.registration,
    vehicle.name,
  ]);
};

export const buildLinkedContinuationPayload = ({
  formValue,
  previousBooking,
  bookingDates,
  vehicles,
  employees,
}) => {
  const requested = normaliseLinkedContinuation(formValue);
  if (!requested) return { value: null, error: "" };
  if (!previousBooking?.id || previousBooking.id !== requested.fromBookingId) {
    return { value: null, error: "Select a valid previous job for this continuation." };
  }

  const previousDates = bookingDateKeys(previousBooking);
  const currentDates = uniqueText((bookingDates || []).map((date) => text(date).slice(0, 10))).sort();
  const overlapDates = overlappingBookingDateKeys(previousDates, currentDates);
  if (overlapDates.length !== 1) {
    return {
      value: null,
      error: "Linked jobs must share exactly one handover date. Any additional overlapping days remain blocked.",
    };
  }

  const handoverDate = requested.handoverDate || overlapDates[0];
  if (handoverDate !== overlapDates[0]) {
    return { value: null, error: "The handover date must be the date shared by both jobs." };
  }
  if (previousDates.at(-1) !== handoverDate || currentDates[0] !== handoverDate) {
    return {
      value: null,
      error: "The handover must be the last day of the previous job and the first day of this job.",
    };
  }

  const previousVehicleIds = new Set(uniqueText(previousBooking.vehicles || []));
  const sharedVehicleIds = requested.continueVehicles
    ? uniqueText(vehicles || []).filter((vehicleId) => previousVehicleIds.has(vehicleId))
    : [];

  const previousEmployeeKeys = new Set((previousBooking.employees || []).map(linkedEmployeeKey).filter(Boolean));
  const previousEmployeeNames = new Set((previousBooking.employees || []).map(linkedEmployeeName).filter(Boolean));
  const sharedEmployees = requested.continueCrew
    ? (employees || []).filter((employee) => {
        const key = linkedEmployeeKey(employee);
        const name = linkedEmployeeName(employee);
        return (key && previousEmployeeKeys.has(key)) || (name && previousEmployeeNames.has(name));
      })
    : [];

  const sharedEmployeeKeys = uniqueText(sharedEmployees.map(linkedEmployeeKey));
  const sharedEmployeeNames = uniqueText(sharedEmployees.map(linkedEmployeeName));
  if (!sharedVehicleIds.length && !sharedEmployeeNames.length) {
    return {
      value: null,
      error: "Select at least one vehicle or crew member that continues from the previous job.",
    };
  }

  return {
    value: {
      fromBookingId: previousBooking.id,
      fromJobNumber: text(previousBooking.jobNumber),
      handoverDate,
      continueVehicles: requested.continueVehicles,
      continueCrew: requested.continueCrew,
      sharedVehicleIds,
      sharedEmployeeKeys,
      sharedEmployeeNames,
    },
    error: "",
  };
};

const resolvedLinkForPair = ({ currentBookingId, currentContinuation, otherBooking }) => {
  const current = normaliseLinkedContinuation(currentContinuation);
  if (current?.fromBookingId && current.fromBookingId === otherBooking?.id) return current;

  const inverse = normaliseLinkedContinuation(otherBooking?.linkedContinuation);
  if (currentBookingId && inverse?.fromBookingId === currentBookingId) return inverse;
  return null;
};

export const linkedContinuationAllowsResourceOverlap = ({
  currentBookingId = "",
  currentContinuation,
  otherBooking,
  overlapDates,
  resourceType,
  resourceKey,
}) => {
  const link = resolvedLinkForPair({ currentBookingId, currentContinuation, otherBooking });
  const dates = uniqueText((overlapDates || []).map((date) => text(date).slice(0, 10))).sort();
  if (!link || dates.length !== 1 || dates[0] !== link.handoverDate) return false;

  const key = text(resourceKey);
  if (!key) return false;
  if (resourceType === "vehicle") {
    if (!link.continueVehicles) return false;
    if (link.sharedVehicleIds.length) return link.sharedVehicleIds.includes(key);
    return (otherBooking?.vehicles || []).flatMap(linkedVehicleKeys).includes(key);
  }

  if (resourceType === "employee") {
    if (!link.continueCrew) return false;
    const lower = key.toLowerCase();
    if (link.sharedEmployeeNames.length) return link.sharedEmployeeNames.includes(lower);
    return (otherBooking?.employees || []).map(linkedEmployeeName).includes(lower);
  }

  return false;
};

export const linkedJobNumberLabel = (booking = {}) => {
  const current = text(booking.jobNumber);
  const link = normaliseLinkedContinuation(booking.linkedContinuation);
  return link?.fromJobNumber && current ? `${link.fromJobNumber} → ${current}` : current;
};

const localDateFromYmd = (value) => {
  const [year, month, day] = text(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const eventBookingId = (event = {}) => text(event.__bookingId || event.id);

export const alignLinkedContinuationCalendarEvents = (events = []) => {
  const sourceEventsByBookingId = new Map();
  (events || []).forEach((event) => {
    const bookingId = eventBookingId(event);
    if (!bookingId) return;
    const list = sourceEventsByBookingId.get(bookingId) || [];
    list.push(event);
    sourceEventsByBookingId.set(bookingId, list);
  });

  const sourceUpdates = new Map();
  const targetUpdates = new Map();

  (events || []).forEach((targetEvent) => {
    const link = normaliseLinkedContinuation(targetEvent?.linkedContinuation);
    const handover = localDateFromYmd(link?.handoverDate);
    if (!link?.fromBookingId || !handover) return;

    const targetStart = targetEvent?.start instanceof Date ? targetEvent.start : new Date(targetEvent?.start);
    if (Number.isNaN(targetStart.getTime()) || targetStart.getTime() !== handover.getTime()) return;

    const sourceEvent = (sourceEventsByBookingId.get(link.fromBookingId) || []).find((event) => {
      const start = event?.start instanceof Date ? event.start : new Date(event?.start);
      const end = event?.end instanceof Date ? event.end : new Date(event?.end);
      return (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        start < handover &&
        end > handover
      );
    });
    if (!sourceEvent) return;

    const pairId = `${link.fromBookingId}:${eventBookingId(targetEvent)}:${link.handoverDate}`;
    sourceUpdates.set(sourceEvent, {
      end: handover,
      __linkedContinuationRole: "from",
      __linkedContinuationPairId: pairId,
      __linkedContinuationToJobNumber: text(targetEvent.jobNumber),
    });
    targetUpdates.set(targetEvent, {
      __linkedContinuationRole: "to",
      __linkedContinuationPairId: pairId,
    });
  });

  return (events || []).map((event) => {
    const update = sourceUpdates.get(event) || targetUpdates.get(event);
    return update ? { ...event, ...update } : event;
  });
};
