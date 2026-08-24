const INTERNAL_ORIGIN = "https://bickers.internal";

export const isSafeInternalPath = (value = "") => {
  const path = String(value || "").trim();
  return path.startsWith("/") && !path.startsWith("//");
};

export const safeInternalPath = (value = "", fallback = "") =>
  isSafeInternalPath(value) ? String(value).trim() : fallback;

export const buildDiaryBookingReturnTo = ({
  pathname = "/dashboard",
  search = "",
  bookingId = "",
} = {}) => {
  const safePathname = safeInternalPath(pathname, "/dashboard");
  const base = new URL(safePathname, INTERNAL_ORIGIN);
  const incoming = new URLSearchParams(String(search || "").replace(/^\?/, ""));

  incoming.forEach((value, key) => base.searchParams.set(key, value));
  base.searchParams.delete("booking");
  if (String(bookingId || "").trim()) {
    base.searchParams.set("booking", String(bookingId).trim());
  }

  const query = base.searchParams.toString();
  return `${base.pathname}${query ? `?${query}` : ""}`;
};

export const buildQuoteHref = ({
  mode = "view",
  bookingId = "",
  quoteNumber = "",
  returnTo = "",
  embed = false,
  action = "",
} = {}) => {
  const route = mode === "edit" ? "quote" : "quote-view";
  const params = new URLSearchParams();
  if (String(quoteNumber || "").trim()) params.set("quote", String(quoteNumber).trim());
  const safeReturnTo = safeInternalPath(returnTo);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  if (embed) params.set("embed", "1");
  if (String(action || "").trim()) params.set("action", String(action).trim());
  const query = params.toString();
  return `/${route}/${encodeURIComponent(String(bookingId || ""))}${query ? `?${query}` : ""}`;
};

export const buildSavedQuoteUrl = ({ pathname = "/quote", search = "", quoteNumber = "" } = {}) => {
  const safePathname = safeInternalPath(pathname, "/quote");
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (String(quoteNumber || "").trim()) params.set("quote", String(quoteNumber).trim());
  params.delete("action");
  const query = params.toString();
  return `${safePathname}${query ? `?${query}` : ""}`;
};
