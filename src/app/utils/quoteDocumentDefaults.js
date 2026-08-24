export const LEGACY_QUOTE_DOCUMENT_DEFAULTS = Object.freeze({
  defaultBickersContact: "",
  footerApprovalText: "ALL TRACKING ACTIVITY ON A PUBLIC HIGHWAY MUST HAVE THE APPROVAL OF THE POLICE & LOCAL AUTHORITY",
  footerInfoText: "For more information,\nplease contact us",
  vatText: "Excludes VAT",
});

export const normalizeQuoteDocumentDefaults = (value = {}) => ({
  defaultBickersContact: String(value.defaultBickersContact || ""),
  footerApprovalText: String(value.footerApprovalText || LEGACY_QUOTE_DOCUMENT_DEFAULTS.footerApprovalText),
  footerInfoText: String(value.footerInfoText || LEGACY_QUOTE_DOCUMENT_DEFAULTS.footerInfoText),
  vatText: String(value.vatText || LEGACY_QUOTE_DOCUMENT_DEFAULTS.vatText),
});

export const createQuoteDocumentSnapshot = (defaults = {}) => {
  const normalized = normalizeQuoteDocumentDefaults(defaults);
  return {
    footerApprovalText: normalized.footerApprovalText,
    footerInfoText: normalized.footerInfoText,
    vatText: normalized.vatText,
  };
};

export const resolveNewQuoteBickersContact = (template = {}, defaults = {}) =>
  String(template.defaultBickersContact || defaults.defaultBickersContact || "Adam Eastall").trim() || "Adam Eastall";

export const resolveQuoteDocumentSnapshot = (quote = {}) => ({
  footerApprovalText: String(quote.documentDefaults?.footerApprovalText || LEGACY_QUOTE_DOCUMENT_DEFAULTS.footerApprovalText),
  footerInfoText: String(quote.documentDefaults?.footerInfoText || LEGACY_QUOTE_DOCUMENT_DEFAULTS.footerInfoText),
  vatText: String(quote.documentDefaults?.vatText || LEGACY_QUOTE_DOCUMENT_DEFAULTS.vatText),
});
