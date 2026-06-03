# Known Issues

Use this file during pilot. Keep entries short, factual, and tied to user impact.

## Open

- None recorded after the latest automated finish pass.

## Watch List

- Browser alerts still exist in several legacy workflows. Only replace alerts that block or confuse users during pilot.
- Firebase/OneDrive local build cache may report a webpack cache rename warning after a successful build on Windows. Treat this as local cache noise unless the build exits non-zero.
- Root backup/legacy files remain in `src/app`; do not refactor them during finalisation unless they affect a tested workflow.

## Resolved

- Lint command migrated to ESLint CLI and now exits cleanly.
- Access-control tests expanded and passing.
- Shared admin/platform admin allowlist added for app-side checks.
- Visible mojibake scan cleaned for app/docs/README surfaces.
