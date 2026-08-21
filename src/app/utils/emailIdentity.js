const stripHeaderBreaks = (value) => String(value ?? "").replace(/[\r\n]+/g, "").trim();

export function formatEmailFrom(displayName, configuredFrom) {
  const name = stripHeaderBreaks(displayName);
  const source = stripHeaderBreaks(configuredFrom);
  const bracketed = source.match(/<([^<>]+)>\s*$/);
  const address = stripHeaderBreaks(bracketed ? bracketed[1] : source);
  if (!name) return address;
  if (!address) return name;
  return `${name} <${address}>`;
}
