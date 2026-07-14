# Bickers UI style guide

The root `src/app` tree is the canonical application. New and migrated screens use the shared semantic tokens in `globals.css` and components exported from `@/app/components/ui`.

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

When touching a screen, replace general-purpose local `UI` or `styles` palettes, static `style={{...}}` declarations, embedded CSS strings, and duplicated controls. Business behaviour and Firestore/auth logic must remain unchanged. Run `npm run audit:styles` during migration and `npm run audit:styles:check` before handoff.

Approved inline-style exceptions are runtime-calculated dimensions, positions, transforms, progress values, and chart/library values that cannot consume a class safely.
