# Bickers UI style guide

The root `src/app` tree is the canonical application. Theme decisions live in `theme.css`; global resets live in `globals.css`; new and migrated screens use components exported from `@/app/components/ui`.

## Changing the application theme

Edit semantic custom properties in `src/app/theme.css`. Do not change route files to rebrand the application. The primary theme controls are `--color-brand`, the surface/text/border groups, the shell group, the type scale, the spacing scale, the radius scale, shadows and control heights. Compatibility aliases exist only to keep routes stable during migration and must not be used for new work.

Exact legacy accent colours are also registered in `theme.css` so active route source contains no hardcoded colour literals. These `--legacy-color-*` properties preserve the current appearance; consolidate them into semantic tokens when migrating the owning component. Run `npm run styles:centralize-colours` only when importing an old active screen, then replace the generated compatibility token with a semantic token during review.

Common legacy spacing, radius, font-size and control-height literals have been mapped to the same global scales. `npm run styles:centralize-values` applies that compatibility mapping to an imported legacy screen without changing its default rendered measurements.

## Principles

- Preserve the black navigation shell and light blue/slate operational workspace.
- Use semantic tokens such as `--color-text`, `--color-brand`, and `--color-danger`; do not introduce page-local colour palettes.
- Use the four-pixel spacing scale and the shared 8px default radius.
- Put unique static layout rules in a page CSS Module. Inline styles are reserved for runtime-calculated values such as chart geometry.
- Content is always light mode. Status must use text or an icon as well as colour.
- Use `!important` only in documented third-party integration stylesheets.

## Page composition

```jsx
import { Button, Card, Grid, Page, PageHeader, Section } from "@/app/components/ui";

<Page width="fluid">
  <PageHeader
    title="Bookings"
    subtitle="Review and manage upcoming work."
    actions={<Button>New booking</Button>}
  />
  <Section title="Upcoming">
    <Grid columns={3}>
      <Card>...</Card>
    </Grid>
  </Section>
</Page>
```

Use `width="readable"` for forms and prose, the default for ordinary pages, and `width="fluid"` for dashboards, calendars, and wide tables.

## Components

- Layout: `Page`, `PageHeader`, `Section`, `Stack`, `Grid`, `Toolbar`.
- Surfaces: `Card`, `Panel`, `Divider`.
- Actions: `Button`, `IconButton`; variants are `primary`, `secondary`, `danger`, and `ghost`; sizes are `sm`, `md`, and `lg`.
- Forms: `FormField`, `Input`, `Textarea`, `Select`, `Checkbox`.
- Feedback: `Badge`, `Alert`, `Spinner`, `Skeleton`, `EmptyState`; semantic variants are `success`, `warning`, `danger`, and `info`.
- Overlays: `Modal`, which supplies Escape handling, focus restoration, backdrop dismissal, and scroll locking.
- Data: `TableContainer`, `Table`, and `Pagination`.

Controls must have an accessible name. Use `FormField` for labels, help text, and errors. Use `IconButton label="..."` whenever a button has no visible text.

## Responsive behaviour

- Desktop: above 900px. The sidebar may be expanded or collapsed.
- Compact: 600–900px. The sidebar collapses automatically and grids reduce to two columns.
- Mobile: below 600px. Grids and form rows become one column, actions wrap, controls have touch-friendly heights, and tables scroll inside `TableContainer`.

## Migration rules

When touching a screen, replace general-purpose local `UI` or `styles` palettes, static `style={{...}}` declarations, embedded CSS strings, and duplicated controls. Business behaviour and Firestore/auth logic must remain unchanged. Run `npm run audit:styles` during migration and `npm run audit:styles:check` before handoff. `npm run audit:styles:strict` is the final zero-debt migration gate.

Approved inline-style exceptions are runtime-calculated dimensions, positions, transforms, progress values, and chart/library values that cannot consume a class safely. Put `/* style-audit-allow runtime */` immediately before such a JSX element and prefer passing the value as a CSS custom property.
