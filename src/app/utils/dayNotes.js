export const displayDayNote = (note = "") => {
  const text = String(note || "").trim();
  const compact = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (compact === "on set" || compact === "onset") return "Shoot Day";
  return text;
};
