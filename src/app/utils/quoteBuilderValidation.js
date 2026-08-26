export const getQuoteBuilderValidation = (quote = {}) => {
  const hasName = Boolean(String(quote?.quoteName || "").trim());
  const hasLines = Array.isArray(quote?.lineItems) && quote.lineItems.length > 0;

  let message = "";
  if (!hasName && !hasLines) message = "Add a quote name and choose a template or start from scratch.";
  else if (!hasName) message = "Add a quote name before saving.";
  else if (!hasLines) message = "Choose a template or start from scratch before saving.";

  return {
    hasName,
    hasLines,
    canPrint: hasLines,
    canSave: hasName && hasLines,
    message,
  };
};
