# UI migration ledger

| Phase | Route families | Status |
| --- | --- | --- |
| Foundation | Dedicated theme, global typography, calendar integration, shared components, shell tokens, colour enforcement | Complete |
| Pilot | Home, dashboard, booking list, create booking, edit booking | In progress — home foundation and booking chooser migrated |
| Operations | Enquiries, jobs, prep lists, drafts, deleted bookings | Semantic tokens applied; component migration pending |
| Fleet and service | Vehicles, equipment, maintenance, checks, MOT, workshop, U-Crane | Semantic tokens applied; component migration pending |
| People | Employees, HR, holidays, sickness, timesheets, profiles, policies | Semantic tokens applied; component migration pending |
| Commercial and administration | Finance, invoices, quotes, contacts, statistics, settings, admin, authentication | Semantic tokens applied; component migration pending |
| Final sweep | Specialised routes, dead CSS, strict zero-debt audit, visual regression | Pending |

All active-source colour literals were centralised in `theme.css`. Route-family work now focuses on replacing local `UI` objects, static inline layout and duplicated native controls with shared components and CSS Modules. The frozen audit baseline prevents this remaining debt from increasing; `npm run audit:styles:strict` remains the completion gate.

The baseline audit intentionally records existing styling debt. A phase is complete only when its standard routes use shared components/tokens and its remaining inline styles are documented runtime-calculated exceptions.
