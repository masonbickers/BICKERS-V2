const safeArr = (value) => (Array.isArray(value) ? value : []);

const dateOnly = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed =
    typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(parsed?.getTime?.())
    ? ""
    : parsed.toISOString().slice(0, 10);
};

const displayDate = (value) => {
  const iso = dateOnly(value);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Date not recorded";
};

const calculateDuration = (startValue, endValue = new Date()) => {
  const start = new Date(`${dateOnly(startValue)}T00:00:00`);
  const end = new Date(`${dateOnly(endValue)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
};

export const buildVorTimelineEvents = (vehicle = {}, now = new Date()) =>
  safeArr(vehicle.vorHistory).flatMap((record, index) => {
    const startDate = dateOnly(record.offRoadDate || record.startedAt);
    if (!startDate) return [];
    const endDate = dateOnly(record.returnedDate || record.completedAt);
    const days =
      Number.isFinite(Number(record.durationDays)) && Number(record.durationDays) >= 0
        ? Number(record.durationDays)
        : calculateDuration(startDate, endDate || now);
    const durationLabel =
      days === null ? "" : `${days} ${days === 1 ? "day" : "days"}`;
    const events = [
      {
        id: `vor-start-${record.id || index}`,
        type: "status",
        date: startDate,
        title: "Status changed: Active → VOR",
        description: record.reason || "Vehicle taken off the fleet.",
        details: [
          endDate
            ? `VOR period began ${displayDate(startDate)}`
            : `VOR since ${displayDate(startDate)}${
                durationLabel ? ` · ${durationLabel}` : ""
              }`,
          record.approvedBy ? `Approved by ${record.approvedBy}` : "",
          record.approvedPosition || "",
          record.offRoadOdometer ? `${record.offRoadOdometer} mi` : "",
        ].filter(Boolean),
        tone: "danger",
      },
    ];

    if (endDate) {
      events.push({
        id: `vor-return-${record.id || index}`,
        type: "status",
        date: endDate,
        title: "Status changed: VOR → Active",
        description: `Vehicle was VOR from ${displayDate(startDate)} to ${displayDate(
          endDate
        )}${durationLabel ? ` (${durationLabel})` : ""}.`,
        details: [
          record.firstUseInspectionDate
            ? `First-use PMI: ${displayDate(record.firstUseInspectionDate)}`
            : "",
          record.removedBy ? `Authorised by ${record.removedBy}` : "",
          record.removedPosition || "",
          record.returnOdometer ? `${record.returnOdometer} mi` : "",
        ].filter(Boolean),
        tone: "success",
      });
    }

    return events;
  });
