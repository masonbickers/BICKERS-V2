const isPdfAttachment = (attachment) =>
  String(attachment?.type || attachment?.contentType || "").toLowerCase().includes("pdf") ||
  String(attachment?.name || "").toLowerCase().endsWith(".pdf");

export function buildCompletionAttachmentPatch(
  existingAttachments = [],
  removedAttachmentIndexes = [],
  addedAttachment = null
) {
  const existing = Array.isArray(existingAttachments) ? existingAttachments : [];
  const removedIndexes = new Set(
    (Array.isArray(removedAttachmentIndexes) ? removedAttachmentIndexes : [])
      .map(Number)
      .filter((index) => Number.isInteger(index) && index >= 0)
  );
  const kept = existing.filter((_, index) => !removedIndexes.has(index));
  const attachments = addedAttachment ? [...kept, addedAttachment] : kept;
  const latestPdf = [...attachments].reverse().find(isPdfAttachment);

  return {
    changed: Boolean(addedAttachment || removedIndexes.size),
    attachments,
    pdfUrl: latestPdf?.url || null,
  };
}
