export function shouldShowShellBackButton({
  override,
  pathname,
  landingRoute,
  hasPrimaryNavigationMatch,
}) {
  if (typeof override === "boolean") return override;
  if (!pathname) return false;
  if (pathname === landingRoute) return false;
  return !hasPrimaryNavigationMatch;
}
