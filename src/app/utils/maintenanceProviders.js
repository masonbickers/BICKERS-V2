const text = (value) => String(value || "").trim();

export const buildCommonMaintenanceProviders = (
  records = [],
  { limit = 12, excludedProviders = [] } = {}
) => {
  const excluded = new Set(
    (Array.isArray(excludedProviders) ? excludedProviders : [])
      .map((provider) => text(provider).toLocaleLowerCase("en-GB"))
      .filter(Boolean)
  );
  const providers = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const provider = text(record?.provider);
    if (!provider) return;
    const key = provider.toLocaleLowerCase("en-GB");
    if (excluded.has(key)) return;
    const current = providers.get(key);
    if (current) {
      current.count += 1;
      if (provider.length > current.label.length) current.label = provider;
      return;
    }
    providers.set(key, { label: provider, count: 1 });
  });

  return [...providers.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "en-GB"))
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((entry) => entry.label);
};
