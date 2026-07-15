# Bickers UI style guide

The canonical `src/app` application uses `theme.css` for all editable design decisions, `globals.css` for reset and document behaviour, and `@/app/components/ui` for shared controls and surfaces.

- Change brand, surface, text, status, spacing, radius, shadow, control-height and shell values in `theme.css`; do not edit routes for a rebrand.
- Use semantic tokens for new work. `--legacy-color-*` tokens preserve exact historical colours while screens migrate and must not be introduced manually.
- Put unique layout in a CSS Module. Static React `style` props and embedded `<style>` blocks are prohibited.
- Runtime geometry or data-driven colours must be passed through CSS custom properties and documented with `style-audit-allow runtime`.
- Use shared buttons, inputs, selects, cards, badges, tables and modals. Specialised navigation controls may use `bare` shared primitives with module styling.
- Keep third-party overrides in a dedicated integration stylesheet.

Run `npm run audit:styles:check` and `npm run build` before handoff.
