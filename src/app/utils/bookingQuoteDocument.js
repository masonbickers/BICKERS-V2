const text = (value) => String(value || "").trim();

const filenameFromUrl = (url = "") => {
  try {
    const parsed = new URL(url);
    const storagePath = parsed.pathname.split("/o/")[1] || parsed.pathname;
    return decodeURIComponent(storagePath).split("/").pop() || "";
  } catch {
    try {
      return decodeURIComponent(text(url)).split("/").pop() || "";
    } catch {
      return text(url).split("/").pop() || "";
    }
  }
};

const normalizeAttachment = (value, fallbackLabel = "") => {
  if (!value) return null;
  if (typeof value === "string") {
    return { url: value, label: fallbackLabel || filenameFromUrl(value), contentType: "" };
  }
  if (typeof value !== "object") return null;
  const url = text(value.url || value.href || value.link || value.downloadURL || value.downloadUrl);
  if (!url) return null;
  return {
    url,
    label: text(value.name || value.label || fallbackLabel) || filenameFromUrl(url),
    contentType: text(value.contentType || value.type),
  };
};

const quoteDocumentCandidates = (booking = {}) => {
  const candidates = [];
  const add = (value, label = "") => {
    const attachment = normalizeAttachment(value, label);
    if (attachment) candidates.push(attachment);
  };

  (Array.isArray(booking.attachments) ? booking.attachments : []).forEach((value) => add(value));
  (Array.isArray(booking.files) ? booking.files : []).forEach((value) => add(value));
  add(booking.quoteUrl, "Quote");
  add(booking.pdfURL, "Quote");
  add(booking.pdfUrl, "Quote");

  const seen = new Set();
  return candidates.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

const isPdf = (attachment) =>
  /pdf/i.test(attachment.contentType) || /\.pdf(?:$|[?#])/i.test(attachment.url) || /\.pdf$/i.test(attachment.label);

const containsQuoteNumber = (attachment, quoteNumber) => {
  const needle = text(quoteNumber).toUpperCase();
  if (!needle) return false;
  let haystack = `${attachment.label} ${filenameFromUrl(attachment.url)} ${attachment.url}`.toUpperCase();
  try {
    haystack = decodeURIComponent(haystack);
  } catch {
    // Keep the original text when a legacy URL contains malformed escapes.
  }
  const start = haystack.indexOf(needle);
  if (start < 0) return false;
  const before = haystack[start - 1] || "";
  const after = haystack[start + needle.length] || "";
  return !/[A-Z0-9]/.test(before) && !/[A-Z0-9]/.test(after);
};

/** Returns the uploaded PDF for a quote number, if this booking has one. */
export const findBookingQuoteDocument = (booking = {}, quoteNumber = "") => {
  const candidates = quoteDocumentCandidates(booking);
  const matchingPdf = candidates.find(
    (attachment) => isPdf(attachment) && containsQuoteNumber(attachment, quoteNumber)
  );
  if (matchingPdf) return matchingPdf;

  // quoteUrl is an explicit legacy quote link and remains a safe fallback.
  const explicitQuoteUrl = text(booking.quoteUrl);
  if (explicitQuoteUrl) {
    return candidates.find((attachment) => attachment.url === explicitQuoteUrl) || null;
  }
  return null;
};

