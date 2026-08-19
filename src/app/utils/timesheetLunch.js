export function shouldDeductYardLunch(entry, day) {
  // Saturday yard work is paid in full, regardless of legacy/default lunch flags.
  if (String(day || "").trim().toLowerCase() === "saturday") return false;

  if (!entry) return true;
  if (entry.managerLunchDeduct === true) return true;
  if (entry.managerLunchDeduct === false) return false;
  if (entry.yardLunchDeduct === false) return false;
  if (entry.yardLunchSup === true || entry.lunchSup === true) return false;
  if (entry.noLunch === true || entry.skipLunch === true) return false;
  if (entry.lunchTaken === false || entry.lunch === false) return false;
  if (entry.lunchTaken === true || entry.lunch === true) return true;
  return true;
}
