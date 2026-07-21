# Bickers Booking Page and Workflow Audit Tracker

Last inventory update: 20 July 2026  
Inventory scope: the complete primary Next.js application under `src/app`, its shared route infrastructure, route handlers under `src/app/api`, the legacy `src/pages/_document.js`, and the Firebase/Firestore/Storage touchpoints reachable from those pages.  
Change policy: preserve the approved inventory and record each bounded audit below. The authentication/private-access boundary audit began on 20 July 2026; no later audit item has started.

## How to use this tracker

Review the sections in numerical order. Keep a page or tightly connected workflow together where separating it would hide shared state, writes, or permissions. Update the status only after completing the corresponding stage.

Allowed statuses:

- **Not reviewed**
- **Under review**
- **Issues found**
- **Changes completed**
- **Testing completed**
- **Approved**
- **Blocked**

Authentication and permission shorthand used below:

- **Public**: intended to work without an authenticated application session.
- **Signed-in**: intended to require Clerk sign-in, the Clerk-to-Firebase custom-token bridge, an enabled `users/{uid}` record, and the appropriate workspace/module.
- **Admin**: intended to require `admin` or `platformAdmin`.
- **Platform Admin**: intended to require `platformAdmin`.
- **User workspace**: intended to require `appAccess.user`.
- **Service workspace**: intended to require `appAccess.service`.
- **Shared fleet**: intended to allow either user or service workspace access.

Important baseline caveat: these are the intended requirements. The current middleware, client route guards, feature flags, Firestore rules, and tenant helpers must be reviewed together before the requirements can be treated as enforced. In particular, the current Firestore helper functions reduce most business-data checks to “signed in”, and module-route helpers are defined but not applied as a route gate.

## Inventory totals

| Inventory item | Count | Notes |
|---|---:|---|
| User-facing App Router page routes | **128** | Includes dynamic routes, redirects, aliases, and two empty page files. |
| API route handlers | **35** | Includes public/auth bootstrap endpoints and authenticated admin/platform endpoints. |
| Routable pages and API endpoints | **163** | 128 pages + 35 APIs. |
| Root App Router layouts | **2** | `src/app/layout.js` and `src/app/login/layout.js`. |
| Legacy Pages Router files | **1** | `src/pages/_document.js`; not a user-facing page route. |
| Conventional Next.js Server Actions | **0** | Business mutations are predominantly direct client Firestore writes; sensitive admin mutations use API route handlers. |
| Page files importing the main shell | **92** | `HeaderSidebarLayout` is the largest shared user-interface dependency. |
| Client files using Firestore | **109** | From the repository access audit. |
| Client files performing Firestore writes | **67** | From the repository access audit. |

## Pages grouped by application area

| Recommended order | Area | Page routes |
|---:|---|---:|
| 1 | Authentication and user access | 9 |
| 2 | Shared layout and navigation | 0 dedicated pages; cross-cutting infrastructure |
| 3 | Dashboard | 4 |
| 4 | Clients | 4 |
| 5 | Jobs and enquiries | 6 |
| 6 | Bookings | 11 |
| 7 | Calendar, availability, and notes | 4 |
| 8 | Quotes | 4 |
| 9 | Job completion and preparation | 4 |
| 10 | Finance and invoicing | 8 |
| 11 | Employees, crew, HR, and permissions | 16 |
| 12 | Vehicles and equipment | 14 |
| 13 | Maintenance and service | 16 |
| 14 | H&S and compliance | 3 |
| 15 | Reports and assistant | 2 |
| 16 | Settings and application administration | 6 |
| 17 | Platform administration | 15 |
| 18 | Legacy or unclear utilities | 2 |
|  | **Total** | **128** |

## Complete page route index

This index accounts for every `src/app/**/page.js` route exactly once. Alias and placeholder status is descriptive only; every route remains **Not reviewed**.

| Area | Routes |
|---|---|
| Authentication and access | `/`, `/login`, `/auth/complete`, `/setup-mfa`, `/verify-mfa`, `/change-password`, `/edit-profile`, `/profile`, `/terms` |
| Dashboard | `/home`, `/dashboard`, `/screens/homescreen`, `/wall-view` |
| Clients | `/client-emails`, `/client-info`, `/contacts`, `/saved-contacts` |
| Jobs and enquiries | `/job-home`, `/job-sheet`, `/job-numbers/[id]`, `/job-summary/[id]`, `/create-enquiry`, `/enquiry` |
| Bookings | `/booking-page`, `/bookings`, `/create-booking`, `/edit-booking/[id]`, `/deleted-bookings`, `/booking-drafts`, `/u-crane`, `/u-crane-booking`, `/u-crane-crew`, `/u-crane-edit/[id]`, `/recce-form/[id]` |
| Calendar, availability, and notes | `/note-form`, `/note/[id]`, `/edit-note/[id]`, `/note-edit/[id]` |
| Quotes | `/quote/[id]`, `/quote-view/[id]`, `/completed-quotes`, `/quote-templates` |
| Job completion and preparation | `/review-queue`, `/preplist`, `/preplist-dashboard`, `/stunt-prep` |
| Finance and invoicing | `/finance-dashboard`, `/finance-home`, `/finance-queue`, `/ready-invoice`, `/invoice/[id]`, `/invoice-view/[id]`, `/invoiced`, `/paid` |
| Employees, crew, HR, and permissions | `/employee-home`, `/employee-home/[employeeKey]`, `/employees`, `/add-employee`, `/edit-employee/[id]`, `/hr`, `/hr-policies`, `/holiday-allowance`, `/holiday-form`, `/holiday-usage`, `/edit-holiday/[id]`, `/sick-leave`, `/timesheets`, `/timesheet-id/[id]`, `/shift-change`, `/upload-contract` |
| Vehicles and equipment | `/vehicle-home`, `/vehicles`, `/add-vehicle`, `/vehicle-edit/[id]`, `/vehicle-info/[id]`, `/vehicle-activity`, `/equipment`, `/add-equipment`, `/edit-equipment/[id]`, `/vehicle-checks`, `/vehicle-checkid/[id]`, `/usage-overview`, `/book-work/[id]`, `/lorry-home` |
| Maintenance and service | `/service-home`, `/service/home`, `/service-overview`, `/workshop`, `/maintenance-jobs`, `/maintenance/[id]`, `/mot-overview`, `/mot-history-sync`, `/defects/declined`, `/defects/general`, `/defects/immediate`, `/general`, `/immediate`, `/vehicle-edit/[id]/mot-history`, `/vehicle-edit/[id]/service-history`, `/vehicle-edit/[id]/service-history/[serviceId]` |
| H&S and compliance | `/h-and-s`, `/h-and-s/[id]`, `/h-and-s/training-policy` |
| Reports and assistant | `/statistics`, `/assistant` |
| Settings and application administration | `/settings`, `/settings/ai-business-rules`, `/admin`, `/admin/content-labels`, `/admin/global-styling`, `/admin/security-audit` |
| Platform administration | `/platform-admin`, `/platform-admin/audit-logs`, `/platform-admin/branding`, `/platform-admin/cleanup`, `/platform-admin/companies`, `/platform-admin/companies/[companyId]`, `/platform-admin/employee-linking`, `/platform-admin/feature-control`, `/platform-admin/feature-flags`, `/platform-admin/login-security`, `/platform-admin/mfa`, `/platform-admin/roles`, `/platform-admin/security`, `/platform-admin/settings`, `/platform-admin/users` |
| Legacy or unclear utilities | `/upload`, `/uploader` |

---

## 1. Authentication and user access

Review this entire section as one security boundary before approving any private business page.

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs or server actions | Firebase / Firestore / Storage | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Entry routing | `/` | Sends visitors to login. | Public entry; no role. | Root App Router redirect. | None. | None. | Login. | Not reviewed |
| Clerk login | `/login` | Clerk sign-in and authentication feedback. | Public; should redirect authenticated users appropriately. | Clerk UI, `GlobalThemeProvider`, `ContentLabelsProvider`, login layout. | Clerk-hosted authentication; login/security endpoints may be called by utilities. | Clerk session; no direct business collection. | `/auth/complete`, Firebase bridge, setup/verify MFA. | Blocked |
| Authentication completion | `/auth/complete` | Resolves the signed-in user’s landing workspace and sends login notification. | Signed-in Clerk user; enabled mapped account intended. | `AuthProvider`, access-control and login-notification utilities. | `/api/security/login-notification`; bootstrap occurs through context. | `users`, `employees`, `loginSecurityLogs`. | Home/service landing, MFA. | Blocked |
| Clerk-to-Firebase session bridge | All private routes | Exchanges Clerk session for Firebase custom token, loads the mirrored user access document, and exposes auth state. | Signed-in Clerk user mapped to an enabled company account. | `AuthProvider`, `ProtectedLayout`, `AccountGuard`. | `/api/auth/firebase-token`, `/api/security/bootstrap-access`. | Firebase Auth; `users`, `employees`, `settings`, `platformCompanies`, audit/security records. | Every Firestore-backed page. | Blocked |
| MFA enrolment | `/setup-mfa` | Enrol authenticator, verify setup, refresh access and security state. | Signed-in mapped user; MFA feature enabled. | auth-security, access-control and login-notification utilities. | `/api/mfa/setup`, `/api/mfa/verify`, `/api/security/bootstrap-access`. | `users`; server-only `mfaSecrets`; `adminAuditLogs`, `loginSecurityLogs`. | `/verify-mfa`, login completion. | Blocked |
| MFA challenge | `/verify-mfa` | Verify an existing authenticator challenge and continue to the appropriate workspace. | Signed-in mapped user requiring current MFA verification. | `AuthProvider`, auth-security and access-control utilities. | `/api/mfa/verify`, `/api/security/bootstrap-access`. | `users`; server-only `mfaSecrets`; security logs. | `/setup-mfa`, home/service landing. | Blocked |
| Account settings and profile | `/profile`, `/edit-profile`, `/change-password`, `/terms` | View profile, edit name/phone/photo, open Clerk password/security controls, and show terms. | Signed-in; own-account operations only. | `HeaderSidebarLayout` on profile/edit/security/terms; Firebase Storage profile upload. | Clerk account security; no dedicated profile API. | `users`; Storage profile image path. | `/settings`, login/logout. | Not reviewed |
| Legacy login and passkeys | No current page routes | User-code login, passkey login/register and device tokens remain as API capabilities but have no current page owner. | Login endpoints are necessarily public but must be rate-limited; registration/device endpoints require a verified Firebase token. | No active user-facing component found. | `/api/auth/user-code-login`, `/api/passkeys/login/options`, `/api/passkeys/login/verify`, `/api/passkeys/register/options`, `/api/passkeys/register/verify`, `/api/device-tokens`, `/api/security/login-attempt`. | `users`, `employees`, `passkeyCredentials`, `passkeyChallenges`, `setupCodeRateLimits`, `deviceTokens`, security/audit logs, `platformCompanies`. | Platform security and MFA administration. | Issues found |

### Authentication/private-access audit record — 20 July 2026

**Final status: Blocked.** The implemented controls materially improve the boundary, but this workflow is not approved until MFA is server-verifiable, legacy Storage ownership is migrated or otherwise made tenant-verifiable, production canonical links/data are validated, and blocked runtime tests are completed. Nothing was deployed.

Findings:

- **Critical:** Firestore rule helpers treated every Firebase token as an active, cross-tenant business user; Storage active/company helpers did the same.
- **High:** Clerk middleware did not protect private pages; the client guard rendered children while redirecting and did not enforce role, workspace, module or MFA routing.
- **High:** email allowlists could elevate API/bootstrap roles without a canonical user; the bridge accepted unverified Clerk email and could fall back to an employee document ID.
- **High:** MFA success exists only in mutable browser storage and is not enforceable by APIs, Firestore or Storage.
- **High:** DVLA/DVSA lookup routes were unauthenticated; `/api/chatgpt` trusted a client role and did not require active canonical/module access.
- **Medium:** explicit denial of both workspaces was silently changed to user access; disabled flags and missing company/user records were handled inconsistently; client tenant helpers disabled company filtering/stamping.

Changes made:

- Added Clerk server protection for non-public page routes and a fail-closed client layout gate for canonical readiness, disabled state, MFA routing, role, workspace and module access.
- Required verified Clerk email and an explicit canonical/employee Firebase UID link; removed employee-document-ID fallback.
- Made canonical `users/{uid}` role/company the server authority; removed email-only admin escalation and added a shared active-user API guard.
- Hardened bootstrap, MFA, DVLA/DVSA, manual MOT sync and Assistant API authorization.
- Preserved explicit no-workspace access; added canonical/company validation and tenant query/write helpers.
- Hardened Firestore and scoped Storage rules for active account, workspace and company checks; moved callers of `companyStoragePath` to `companies/{companyId}/...` automatically.
- Added focused access, bridge/account, Firestore-rule and Storage-rule tests.

Tests completed:

- **Passed:** access-control unit tests, 12/12.
- **Passed:** bridge/account-policy unit tests, 3/3.
- **Passed:** Firestore emulator authorization tests, 5/5 (anonymous, missing user, disabled user, workspace, same/cross-tenant reads/writes, Admin and Platform Admin). Expected deny operations produce emulator permission-denied diagnostics; two deny writes also hit the emulator's expression-limit diagnostic but remain denied.
- **Passed:** full ESLint, zero errors and one pre-existing generated Expo warning.
- **Passed:** targeted ESLint for every changed authentication file, zero findings.
- **Passed, read-only production readiness:** 7 canonical users all contain required fields and company IDs; no duplicate user/employee links or company mismatches were found. The report also confirmed 12 employees without an auth UID, 3 orphaned employee UID links, and 311 tenant records without `companyId` across the scanned collections.
- **Not available:** root TypeScript check; no root `tsconfig.json` is configured.
- **Failed twice, environment/pre-existing:** production build compiled and generated 137/137 static pages on both attempts, then final trace collection failed with OneDrive `ETIMEDOUT`; two unrelated pre-existing appearance import warnings were also reported.
- **Blocked:** Storage emulator execution because the pre-existing `firebase-tools` installation is incomplete and dependency repair timed out. The Storage test file was added but not executed.
- **Not run:** signed-in browser/Clerk dashboard testing, production identity testing, deployment and production rules testing.

Remaining risks and manual blockers:

- Replace the browser-only MFA trust marker with Clerk MFA or another server-verifiable factor state before approval.
- Manually determine which of the 12 employees without an auth UID should have application access and resolve the 3 orphaned employee UID links. Do not invent links or identities.
- Backfill the 311 confirmed tenant records without `companyId` and update the remaining direct writers before deploying the hardened Firestore rules. Current confirmed gaps include 107 bookings, 75 timesheets, 50 holidays, 19 notes, 18 deleted bookings and smaller fleet/maintenance collections.
- Migrate or explicitly retire legacy unscoped Storage objects/paths; scoped rules cannot prove ownership of paths that contain no company identifier.
- Repair dependencies, run Storage emulator tests, rerun the production build outside the OneDrive timeout condition, and manually verify Clerk redirect/logout/disabled/MFA flows.
- Review Firestore deny-path expression-limit diagnostics before rule deployment even though all deny assertions passed.

Recommended next audit item after this blocker is cleared: shared root layout/navigation, workspace switching, module flags and global feedback states. Do not start it while this item remains blocked.

## 2. Shared layout and navigation

These components affect most pages and must be reviewed before page-level visual or permission findings are trusted.

| Shared workflow | Route coverage | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Root application shell | All page routes except behavior overridden inside pages | Provides Clerk, Firebase auth context, appearance/content providers, cache refresh and the global client protection wrapper. | Public routes must remain available; private routes should be protected before render. | `src/app/layout.js`, `ClerkProvider`, `AuthProvider`, `ProtectedLayout`, `GlobalThemeProvider`, `ContentLabelsProvider`. | `/api/appearance`, `/api/auth/firebase-token`, `/api/security/bootstrap-access`. | `users`, `employees`, appearance/settings records. | Every page. | Not reviewed |
| Request middleware | All matched application and API paths | Runs Clerk middleware and protects non-public page routes with `auth.protect()`. | Public login/root remain available; private pages require Clerk. APIs retain endpoint-specific authorization. | `src/middleware.js`. | All API handlers are matched and still authorize themselves. | None directly. | Authentication boundary. | Testing completed |
| Main header/sidebar shell | 92 importing page files | Navigation, workspace switch, account state, HR badges, admin view-as, responsive shell, back navigation, unsaved-change prompts and permission feedback. | Signed-in; intended workspace, role and module filtering. Admin/platform links conditional in the client. | `HeaderSidebarLayout`, UI primitives, unsaved-change and access helpers. | `/api/admin/overview` for admin view-as. | `holidays`; auth/access state. | Nearly all business workflows. | Not reviewed |
| Access and tenant helpers | All Firestore business workflows | Maps route prefixes to workspaces/modules and creates collection queries/payloads. | Now fails closed on canonical readiness/disabled/company and adds tenant query/payload/path scope; direct legacy writers remain a deployment blocker. | `accessControl.js`, `firestoreAccess.js`, `storageAccess.js`. | None directly. | All tenant collections and Storage paths. | Firestore/Storage rules; all pages. | Blocked |
| Appearance and wording providers | All rendered routes | Loads published theme and content labels, applies light/dark presentation. | Signed-in appearance API where available; safe defaults otherwise. | `GlobalThemeProvider`, `ContentLabelsProvider`, global UI primitives. | `/api/appearance`, `/api/theme`. | Appearance/settings documents. | Admin appearance editors. | Not reviewed |

## 3. Dashboard

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Operational home | `/home`, alias `/screens/homescreen` | Live overview of bookings, follow-ups, schedule conflicts, preparation, maintenance attention, fleet compliance and quick links. | Signed-in user workspace; administrators also allowed. | `ProtectedRoute`, `HeaderSidebarLayout`, `ViewBookingModal`, `DashboardMaintenanceModal`, UI empty/loading states, `homeDashboard`. | None directly. | Reads bookings, vehicles, equipment and maintenance data through shared helpers/components. | Dashboard diary, bookings, prep, fleet and workshop. | Not reviewed |
| Main diary/dashboard | `/dashboard`, aliases `/bookings`, `/wall-view` | Calendar/diary for bookings, enquiries, holidays, notes, recces and maintenance; create/edit modal actions and drag/drop maintenance updates. | Signed-in; calendar is currently treated as shared between workspaces. Admin-only dashboard data is separately fetched. | `DashboardClientWrapper`, `DashboardPageImpl`, booking/maintenance/note modals, FullCalendar, shared shell. | `/api/admin/dashboard-data` for admin-only summary data; GOV.UK bank-holiday feed. | `bookings`, `holidays`, `notes`, `recces`, `maintenanceBookings`, `maintenanceJobs`, `vehicles`, `equipment`, `deletedBookings`. | Create/edit booking, enquiry, notes, holidays, maintenance, drafts. | Not reviewed |

## 4. Clients

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Client information summary | `/client-info` | Aggregates client/job history and links to statistics and email views. | Signed-in user workspace; bookings module intended. | `HeaderSidebarLayout`, tenant access helpers. | None. | Primarily `bookings`. | Client emails, statistics, jobs. | Not reviewed |
| Client email summary | `/client-emails` | Lists client email/contact information derived from operational data. | Signed-in user workspace; bookings module intended. | `HeaderSidebarLayout`, tenant access helpers. | None. | Primarily `bookings`. | Client info, saved contacts, booking forms. | Not reviewed |
| Contact directories | `/saved-contacts`, `/contacts` | Manage saved booking contacts; separately show a hard-coded internal company contact directory. | Signed-in user workspace. Saved contacts require booking access; `/contacts` has no main shell. | `HeaderSidebarLayout` on saved contacts; standalone contacts page. | None. | `contacts` for saved contacts; none for static directory. | Create/edit booking, client info. | Not reviewed |

## 5. Jobs and enquiries

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Jobs hub | `/job-home` | Job KPIs and links/previews for upcoming work, review queue, finance queue, completed quotes, invoiced and paid jobs. | Signed-in user workspace; job-sheets module intended. | `HeaderSidebarLayout`, completed-quote helpers, session filters, status colours. | None. | `bookings` real-time listener. | Enquiries, job overview, completion, quotes, finance. | Not reviewed |
| Jobs overview | `/job-sheet` | Search/group jobs, change status, mark complete, send jobs to Ready to Invoice, and open detailed records. | Signed-in user workspace; job-sheets module intended; status mutations need stronger action authorization. | `HeaderSidebarLayout`, status helpers. | None. | Reads/writes `bookings`. | Job detail, review queue, finance queue. | Not reviewed |
| Job-number detail | `/job-numbers/[id]` | Detailed job record, notes, linked dates/timesheets, attachments, status/invoice fields and quote links; edits/deletes/uploads. | Signed-in user workspace; job-sheets module intended. | `HeaderSidebarLayout`, session state, status colours, Storage upload. | None. | `bookings`, `timesheets`; job attachments in Storage. | Quote viewer, job overview, timesheets, finance. | Not reviewed |
| Job summary | `/job-summary/[id]` | Concise job review and direct status actions including Action Required and Invoiced. | Signed-in user workspace; job-sheets/finance permission intended. | `HeaderSidebarLayout`, tenant helpers. | None. | Reads/writes `bookings`. | Job detail, review queue, invoice workflow. | Not reviewed |
| Enquiry creation and list | `/create-enquiry`, `/enquiry` | Create enquiry records and contacts; browse enquiries and open booking modal/quote attachments. | Signed-in user workspace; bookings module intended. | `HeaderSidebarLayout`, shared booking reference/lifecycle helpers, `ViewBookingModal`. | None. | `bookings`, `contacts`. | Jobs hub, booking conversion/edit, quotes. | Not reviewed |

## 6. Bookings

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore / Storage | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Booking entry options | `/booking-page` | Presents create, recce and stunt booking choices; all currently open the same create-booking route. | Signed-in; calendar/bookings access intended. | `HeaderSidebarLayout`. | None. | None. | Create booking. | Not reviewed |
| Create booking | `/create-booking` | Create a booking with client/contact, dates, location, crew, vehicles, equipment, notes, statuses, availability checks, quote/attachment uploads and draft handling. | Signed-in user workspace; bookings module intended; write permission required. | `HeaderSidebarLayout`, booking form/reference/availability/lifecycle helpers, unsaved-changes guard. | None. | Writes `bookings`, `contacts`; reads employee/vehicle/equipment/reference data; uploads booking/quote attachments. | Dashboard, saved contacts, quotes, prep, job workflows. | Not reviewed |
| Edit booking | `/edit-booking/[id]` | Load and edit the full booking, contacts, dates/resources, quote revisions and attachments; lifecycle updates. | Signed-in user workspace; bookings module intended; record/company/action permission required. | Same shared booking helpers as create, edit cache, unsaved-changes and Storage helpers. | None. | Reads/writes `bookings`, `contacts`; Storage attachments/quotes. | Dashboard, completed quotes, job and finance workflows. | Not reviewed |
| Booking drafts | `/booking-drafts` | Reads browser-saved booking drafts and resumes or discards them. | Signed-in bookings user; browser-local data ownership. | `HeaderSidebarLayout`, local/session storage. | None. | No Firestore collection in page. | Create booking, dashboard. | Not reviewed |
| Deleted booking archive | `/deleted-bookings` | Browse deleted bookings and restore or permanently delete records. | Intended Admin; currently under bookings route mapping and page-level admin checks. | `HeaderSidebarLayout`, `ViewBookingModal`, status helpers. | None. | `bookings`, `deletedBookings`, `users`. | Dashboard, Admin, booking detail. | Not reviewed |
| U-Crane booking workflow | `/u-crane`, `/u-crane-booking`, `/u-crane-edit/[id]`, `/u-crane-crew` | Calendar/list for U-Crane bookings; create/edit bookings and quote uploads; manage freelancer crew. | Signed-in user workspace; U-Crane module intended. Crew/delete actions may need elevated ownership rules. | `HeaderSidebarLayout`, `ViewUCraneBooking`, FullCalendar, route loading overlay. | None. | `bookings`, `deletedBookings`, `vehicles`, `uCraneFreelancers`; quote Storage paths. | Main diary, jobs, recce, vehicles. | Not reviewed |
| Recce viewer/form | `/recce-form/[id]` | View recce details and evidence images associated with a booking. | Signed-in; bookings/recce access intended. Page has no main shell. | Standalone recce page. | None. | `recces`; attachment URLs. | U-Crane/main booking workflows. | Not reviewed |

## 7. Calendar, availability, and notes

Calendar data and booking resource availability are also embedded in `/dashboard`, `/create-booking`, `/edit-booking/[id]`, and holiday workflows; review them together.

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Availability engine | No dedicated route | Detects employee/vehicle/equipment clashes across booking dates and maintenance commitments. | Signed-in booking editors; same-company reads intended. | `bookingAvailability`, booking form/reference helpers, dashboard calendar. | None. | `bookings`, `employees`, `vehicles`, `equipment`, maintenance data. | Create/edit booking, dashboard. | Not reviewed |
| Add note | `/note-form` | Create calendar notes, including employee/reference lookup and date placement. | Signed-in; calendar path intentionally shared. | Standalone page using tenant helper; related `create-note` component is used by dashboard. | None. | `notes`, `employees`. | Dashboard/calendar. | Not reviewed |
| Edit note variants | `/note/[id]`, `/note-edit/[id]`, `/edit-note/[id]` | Three overlapping note edit/delete routes; `/note/[id]` and `/note-edit/[id]` are near-duplicates while `/edit-note/[id]` is a larger variant. | Signed-in; calendar path intentionally shared; record ownership rules needed. | Standalone pages; dashboard also uses `EditNoteModal`. | None. | `notes`, `employees`. | Dashboard, add note. | Not reviewed |

## 8. Quotes

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Quote editor/viewer | `/quote/[id]`, alias `/quote-view/[id]` | Build quote revisions and sections/lines, discounts and totals; save quote data to booking and print/view the same implementation. | Signed-in user workspace; bookings/job access intended; quote-setting writes need explicit authority. | `HeaderSidebarLayout`, quote-template and booking reference helpers. | None. | `bookings`, `settings`. | Booking edit, job detail, completed quotes, finance review. | Not reviewed |
| Completed quotes | `/completed-quotes` | Lists saved quote revisions across bookings and opens the relevant quote. | Signed-in user workspace; job/quote access intended. | `HeaderSidebarLayout`, completed-quote/session helpers. | None. | `bookings`. | Jobs hub, quote editor/templates. | Not reviewed |
| Quote templates | `/quote-templates` | Create/edit reusable quote sections, lines, rates and discounts. | Intended Admin/finance owner; currently signed-in route with client context and settings writes. | `HeaderSidebarLayout`, quote-template helpers. | None. | `settings`. | Quote editor, completed quotes. | Not reviewed |

## 9. Job completion and preparation

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Operational review queue | `/review-queue` | Lists completed/attention jobs and changes status to Ready to Invoice, Needs Action or Complete. | Signed-in user workspace; operational reviewer permission intended. | `HeaderSidebarLayout`, session filters, status colours. | None. | Reads/writes `bookings`. | Job sheet/summary, finance queue. | Not reviewed |
| Preparation dashboard | `/preplist-dashboard` | Summarises preparation requirements from bookings/resources and links to prep work. | Signed-in shared fleet/job access intended. | `HeaderSidebarLayout`, auth/tenant helpers. | None. | Reads bookings, vehicles and equipment-related data. | Dashboard, preplist, stunt prep. | Not reviewed |
| Preparation editors | `/preplist`, `/stunt-prep` | Maintain prep selections/checklists and inspect booking/resource requirements. | Signed-in shared fleet/job access intended; write ownership required for shared state. | `HeaderSidebarLayout`, `PrepItemPicker`. | None. | `appState` plus bookings/vehicles/equipment reads. | Preparation dashboard, bookings, jobs. | Not reviewed |

## 10. Finance and invoicing

Review this section as one lifecycle. Operational completion status and invoice/payment status are currently mixed across booking and invoice records.

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Finance landing | `/finance-dashboard` | Shortcut dashboard for ready-to-invoice, tracker, create, export and settings. Three advertised destinations do not exist. | Signed-in user workspace; finance module intended. | `HeaderSidebarLayout`. | None. | None. | Finance queue/tracker. | Not reviewed |
| Finance review queue | `/finance-queue`, overlapping `/ready-invoice` | Lists four-digit jobs ready to invoice, with search/filter and invoice links. `/ready-invoice` is a simpler duplicate view. | Intended finance/invoices module; currently signed-in user workspace. | `HeaderSidebarLayout`, status/session helpers. | None. | Reads `bookings`. | Review queue, invoice detail, jobs hub. | Not reviewed |
| Invoice preparation/issue | `/invoice/[id]` | Displays booking, quote/supporting documents, resources and timesheets; marks booking and invoice queue record invoiced. | Intended finance/invoice approver; record/company and transition authorization required. | `HeaderSidebarLayout`, tenant helpers. | None. | Reads `bookings`, `timesheets`; writes `bookings`, `invoiceQueue`. | Finance queue, finance tracker, job summary. | Not reviewed |
| Invoice tracker and payment update | `/finance-home` | Lists/deduplicates invoice queue records; manually marks invoiced or paid and mirrors paid state back to booking. Row navigation currently targets incomplete/missing routes. | Intended finance role; issue/payment actions require backend authorization and audit. | `HeaderSidebarLayout`. | None. | Reads/writes `invoiceQueue`; writes `bookings` on payment. | Invoice detail, invoiced/paid lists, future Sage sync. | Not reviewed |
| Invoiced and paid lists | `/invoiced`, `/paid` | Read-only job lists derived from booking/invoice status with search/grouping. | Signed-in finance/job access intended. | `HeaderSidebarLayout`, status helpers. | None. | Reads `bookings`. | Jobs hub, finance tracker. | Not reviewed |
| Empty invoice view | `/invoice-view/[id]` | Route file is empty and cannot provide the destination expected by finance tracker. | Intended finance role. | None. | None. | None. | `/finance-home`, `/invoice/[id]`. | Not reviewed |

## 11. Employees, crew, HR, and permissions

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore / Storage | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Employee hub and detail | `/employee-home`, `/employee-home/[employeeKey]` | Employee directory and individual operational history including bookings and holidays. | Signed-in user workspace; employees module intended; personal data scope required. | `HeaderSidebarLayout`, auth/tenant helpers. | None. | `employees`, `bookings`, `holidays`. | Personnel files, timesheets, HR. | Not reviewed |
| Personnel file list/create | `/employees`, `/add-employee` | List personnel files and create employee/access records. | Intended Admin/HR; pages currently rely on client context and Firestore rules. | `HeaderSidebarLayout`, app-access record helper. | None. | `employees`. | Edit employee, employee hub, Admin. | Not reviewed |
| Personnel file and access editor | `/edit-employee/[id]` | Edit personal/employment data, archive employee, upload contract/profile files, and mirror role/workspace fields to user records/settings. | Intended Admin/HR; user/access/settings changes are security-sensitive. | `HeaderSidebarLayout`, access-control/app-access helpers. | None. | `employees`, `users`, `settings`; employee document Storage. | Admin users, platform linking, employee hub. | Not reviewed |
| HR hub and policies | `/hr`, `/hr-policies` | Review holiday requests/deletions, update approvals, and read HR policy content. | Intended Admin/HR for approval actions; signed-in users may read appropriate policy/self-service content. | `HeaderSidebarLayout`, `holidayform`. | None. | `holidays`. | Holiday usage/allowance, sick leave. | Not reviewed |
| Holiday self-service and editing | `/holiday-form`, `/holiday-usage`, `/edit-holiday/[id]` | Submit leave, inspect usage, edit/delete requests and use admin approval utilities. | Signed-in; self-only for normal users, Admin/HR for wider reads and approvals. | `holidayform`, `EditHolidayForm`, `HeaderSidebarLayout` on usage. | None. | `holidays`, `employees`, `bookings`, `users`. | HR hub, dashboard/calendar, timesheets. | Not reviewed |
| Holiday allowances and sickness | `/holiday-allowance`, `/sick-leave` | Manage employee allowances and sickness records. | Intended Admin/HR; highly sensitive employee data. | `HeaderSidebarLayout`. | None. | `employees`, `sickLeave`. | HR hub, Admin. | Not reviewed |
| Timesheet workflow | `/timesheets`, `/timesheet-id/[id]` | List submissions, create/update timesheets, review per-job days/costs, queries/messages and approvals. | Signed-in employees for own records; manager/Admin for wider review and approval; finance reads during invoice review. | `HeaderSidebarLayout`, auth context, holiday-match helper. | None. | `timesheets`, `timesheetQueries` and messages, `bookings`, `settings`, `holidays`. | Employee detail, job detail, finance invoice review. | Not reviewed |
| Shift change | `/shift-change` | Submit and update quick shift-change requests. | Signed-in; self-service create/cancel and manager review ownership intended. | `HeaderSidebarLayout`. | None. | `shiftChangeRequests`. | Dashboard/calendar, HR. | Not reviewed |
| HR document upload | `/upload-contract` | Upload and list employee/HR documents. | Intended Admin/HR only. | `HeaderSidebarLayout`, Storage upload. | None. | `hrDocuments`; HR document Storage. | Personnel files, HR. | Not reviewed |

## 12. Vehicles and equipment

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore / Storage | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Fleet hub | `/vehicle-home` | Fleet KPIs, compliance calendars, defects, maintenance bookings, usage and direct workflow updates. | Signed-in shared fleet; service actions should require service/admin authority. | `HeaderSidebarLayout`, `DashboardMaintenanceModal`, maintenance/date helpers. | None. | `vehicles`, `maintenanceBookings`, `vehicleIssues`, `vehicleChecks`. | Vehicles, maintenance, checks, service/MOT/usage. | Not reviewed |
| Vehicle list and DVSA sync | `/vehicles` | List/filter vehicles, manage categories, add vehicle and trigger fleet MOT refresh. | Signed-in shared fleet; category/settings and bulk sync actions may require Admin/service authority. | `HeaderSidebarLayout`, `VehicleCategorySettingsModal`, vehicle/maintenance helpers. | `/api/dvla/mot-history/sync`. | `vehicles`, `settings`. | Add/edit vehicle, MOT sync, vehicle hub. | Not reviewed |
| Add vehicle or retention plate | `/add-vehicle` | Create vehicle/plate records with compliance and maintenance fields. | Signed-in shared fleet; create permission intended. | `HeaderSidebarLayout`, maintenance/category/unsaved-change helpers. | May use DVLA lookup through shared code. | Writes `vehicles`. | Vehicle list/edit. | Not reviewed |
| Vehicle editor | `/vehicle-edit/[id]` | Edit vehicle identity, compliance, bookings, service/inspection history, images/documents; delete/archive and fetch MOT history. | Signed-in shared fleet; destructive and compliance mutations need service/Admin authority. | `HeaderSidebarLayout`, maintenance booking forms/services, vehicle/service compatibility, unsaved changes. | `/api/dvla/mot-history`. | `vehicles`, `maintenanceBookings`, `maintenanceJobs`, `serviceRecords`; vehicle Storage paths. | MOT/service history, vehicle checks, fleet hub. | Not reviewed |
| Legacy vehicle details | `/vehicle-info/[id]` | Simpler vehicle detail/edit/delete and related record creation. | Signed-in shared fleet; potentially obsolete beside vehicle editor. | Standalone page without main shell. | None. | `vehicles`. | `/vehicles`, `/vehicle-edit/[id]`. | Not reviewed |
| Vehicle activity | `/vehicle-activity` | Historical fleet activity and maintenance/booking events. | Signed-in shared fleet. | `HeaderSidebarLayout`, maintenance helpers. | None. | Reads vehicles, bookings and maintenance-related collections. | Fleet hub, vehicle editor. | Not reviewed |
| Equipment workflow | `/equipment`, `/add-equipment`, `/edit-equipment/[id]` | List, create, edit and delete equipment records. | Signed-in shared fleet; equipment module intended; delete requires authority. | `HeaderSidebarLayout`, unsaved-change and tenant helpers. | None. | `equipment`. | Booking forms, prep, fleet hub. | Not reviewed |
| Vehicle checks and defect report | `/vehicle-checks`, `/vehicle-checkid/[id]` | Browse checks and open a detailed defect report with evidence. Hub advertises three missing child routes. | Signed-in service/shared fleet; check visibility and defect actions require service permission. | `HeaderSidebarLayout`. | None. | `vehicleChecks`, `bookings`. | Defect queues, fleet hub. | Not reviewed |
| Usage overview | `/usage-overview` | Vehicle usage matrix, missing coverage, summaries and daily notes. | Signed-in service/shared fleet. | `HeaderSidebarLayout`, vehicle compatibility helpers. | None. | Reads vehicles/bookings and writes a dynamic usage/note collection. | Fleet hub, bookings. | Not reviewed |
| Book vehicle work | `/book-work/[id]` | Create a work/repair booking for a selected vehicle. | Signed-in service workspace. | `HeaderSidebarLayout`. | None. | `vehicles`, `workBookings`. | Maintenance jobs, fleet hub. | Not reviewed |
| Lorry overview | `/lorry-home` | List/filter lorries and link to view/add lorry routes that do not exist. | Signed-in service access intended; page has no main shell. | Standalone page. | None. | `lorries`. | Fleet and maintenance. | Not reviewed |

## 13. Maintenance and service

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Service landing | `/service-home`, alias `/service/home` | Service-management tile menu. All nine advertised child routes are absent. | Signed-in service workspace. | `HeaderSidebarLayout`. | None. | None. | Service overview, workshop, vehicle checks. | Not reviewed |
| Workshop | `/workshop` | Calendar/list of maintenance activity and modal actions. | Signed-in service workspace. | `DashboardMaintenanceModal`, auth/maintenance helpers; page does not use main shell. | None. | Maintenance booking/job and vehicle data. | Fleet hub, maintenance jobs. | Not reviewed |
| Service overview | `/service-overview` | Priority service queue, booked pipeline, recent activity and fleet service register. | Signed-in service/shared fleet. | `HeaderSidebarLayout`, `MaintenanceBookingForm`, vehicle/maintenance helpers. | None. | `vehicles`, `maintenanceBookings`, `maintenanceJobs`, `serviceRecords`. | Vehicle editor/history, maintenance jobs. | Not reviewed |
| Maintenance jobs | `/maintenance-jobs` | Create/update maintenance jobs and move them through maintenance workflow states. | Signed-in service workspace; state transitions require service/Admin authority. | `HeaderSidebarLayout`, maintenance calendar/schema/workflow specification. | None. | `maintenanceJobs`, related vehicles/bookings. | Workshop, fleet hub, finance-ready maintenance state. | Not reviewed |
| Maintenance record | `/maintenance/[id]` | View/edit a selected maintenance booking through shared forms. | Signed-in service workspace. | `HeaderSidebarLayout`, `MaintenanceBookingForm`, `EditMaintenanceBookingForm`. | None. | `maintenanceBookings`, `vehicles`, `equipment`. | Dashboard/workshop, service overview. | Not reviewed |
| MOT workflow | `/mot-overview`, `/mot-history-sync`, `/vehicle-edit/[id]/mot-history` | Fleet MOT due view, bulk-fetch results/errors and per-vehicle DVSA history. | Signed-in shared fleet; bulk/manual sync should require service/Admin authority. | `HeaderSidebarLayout`, maintenance/vehicle compatibility helpers. | `/api/dvla/mot-history`, `/api/dvla/mot-history/sync`. | `vehicles`, `settings`. | Vehicles, vehicle editor, fleet hub. | Not reviewed |
| Service history | `/vehicle-edit/[id]/service-history`, `/vehicle-edit/[id]/service-history/[serviceId]` | List service records and inspect an individual service entry. | Signed-in shared fleet/service access. | `HeaderSidebarLayout`, service-record compatibility helpers. | None. | `vehicles`, `serviceRecords`. | Vehicle editor, service overview. | Not reviewed |
| Current defect queues | `/defects/general`, `/defects/immediate`, `/defects/declined` | Review reported defects; schedule, progress, resolve, move between queues or return declined items. | Signed-in service workspace; transition authorization required. | `HeaderSidebarLayout`, tenant/status helpers. | None. | `vehicleChecks`, `vehicleIssues`, `defectReports`. | Vehicle check detail, fleet hub. | Not reviewed |
| Legacy defect queues | `/general`, `/immediate` | Older general/immediate check queues with similar actions to `/defects/*`. | Signed-in service workspace; likely duplicate/legacy ownership. | `HeaderSidebarLayout`. | None. | `vehicleChecks`. | Current defect queues. | Not reviewed |

## 14. H&S and compliance

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore / Storage | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| H&S register | `/h-and-s` | H&S dashboard/register, certificates, due items and creation of register records. | Signed-in user workspace; H&S module intended; create/manage authority required. | `HeaderSidebarLayout`, tenant helpers. | None. | `hsRegister`. | H&S record, training/policy, defect workflows. | Not reviewed |
| H&S record and PPE register | `/h-and-s/[id]` including `/h-and-s/ppe-issue-register` | View/edit register item, checks, certificate evidence and PPE issue records. | Signed-in H&S users; record updates/deletes and PPE access need explicit roles. | `HeaderSidebarLayout`, H&S register helper. | None. | `hsRegister`, `hsCheckRecords`, `ppeIssueRecords`; evidence Storage. | H&S hub. | Not reviewed |
| Training and policy records | `/h-and-s/training-policy` | Add employee training/policy records and upload evidence. | Intended H&S/HR/Admin. | `HeaderSidebarLayout`. | None. | `employeeTrainingRecords`; evidence Storage. | H&S hub, employee records. | Not reviewed |

## 15. Reports and assistant

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Statistics and daily briefing | `/statistics` | Filtered booking/business reporting, pipeline, resources, finance readiness, data quality, hotel costs and AI daily briefing feedback. | Signed-in statistics module; management/finance sections should be role-gated. | `HeaderSidebarLayout`, dashboard/chart components, `DailyBriefingPanel`, analytics/snapshot/filter helpers. | `/api/statistics/daily-briefing`, `/api/statistics/daily-briefing/generate`, `/api/statistics/daily-briefing/feedback`. | `bookings`, `deletedBookings`, `vehicles`; server-only `aiBusinessRules`, `aiStatisticsBriefings`, `aiInsightFeedback`. | Jobs, clients, finance queue, AI rules. | Not reviewed |
| Operations assistant | `/assistant` | Ask natural-language questions over selected operational datasets. | Signed-in assistant module; response scope should match caller permissions and company. | `HeaderSidebarLayout`. | `/api/chatgpt`. | Server reads selected bookings, vehicles, timesheets, maintenance/jobs/check data. | Dashboard, statistics. | Not reviewed |

## 16. Settings and application administration

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| User/application settings | `/settings` | Account details, profile/password links and application settings presentation. | Route is classified as Admin in access helpers, though it also contains personal account actions; ownership is unclear. | `HeaderSidebarLayout`, theme provider. | None. | `users`. | Profile/security, AI rules. | Not reviewed |
| AI business rules | `/settings/ai-business-rules` | Review, edit, publish and regenerate the operating rules used by statistics briefing. | Intended Admin; statistics access may vary. | `HeaderSidebarLayout`, business-rule model. | `/api/statistics/business-rules`, `/api/statistics/daily-briefing/generate`. | Server-only `aiBusinessRules`, briefing/audit records. | Statistics. | Not reviewed |
| Application Admin hub | `/admin` | User/access overview, employee/holiday/sickness administration, MFA migration, activity and audit summaries, and links to appearance/security/deleted bookings. | Admin or Platform Admin; page has client guard and admin APIs, but also direct sensitive Firestore writes. | `HeaderSidebarLayout`, auth/admin/access helpers. | `/api/admin/overview`, `/api/admin/migrate-mfa-secrets`, `/api/security/bootstrap-access`. | `employees`, `users`, `holidayAllowances`, `sickLeave`, audit/security collections. | Employee permissions, security audit, platform admin. | Not reviewed |
| Company appearance and wording | `/admin/global-styling`, `/admin/content-labels` | Edit draft theme/labels, validate, publish, restore versions and preview platform/company appearance. | Admin for own company; Platform Admin for platform/all-company scope. | `AppearanceAdminEditor`, shared UI and appearance/content models. | `/api/admin/appearance`; migration API has no current page caller. | `platformCompanies`, appearance/settings documents, `adminAuditLogs`. | Global providers, platform branding redirect. | Not reviewed |
| Security audit page | `/admin/security-audit` | Display user/account/MFA readiness and access/security findings. | Admin or Platform Admin. | `HeaderSidebarLayout`. | `/api/admin/security-audit`. | Server reads `users`, `employees`, `mfaSecrets`, `passkeyCredentials` and related security state. | Admin hub, platform security/MFA/cleanup. | Not reviewed |

## 17. Platform administration

All wrapper routes below use `PlatformAdminSectionPage` and `PlatformAdminShell`, backed primarily by `/api/platform-admin` plus dedicated sensitive mutation APIs.

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Platform dashboard | `/platform-admin` | Cross-company metrics, warnings, security events and quick actions. | Platform Admin only; API must re-check role. | `PlatformAdminShell`, `PlatformAdminSectionPage`. | `/api/platform-admin`, `/api/admin/security-audit`. | `platformCompanies`, `users`, `employees`, audit/login logs and business summary collections. | All platform sections. | Not reviewed |
| Companies | `/platform-admin/companies`, `/platform-admin/companies/[companyId]` | Create/update/delete company records; edit modules, security, limits and metadata. | Platform Admin only. | Platform admin shell/section; dedicated company detail page. | `/api/platform-admin`, `/api/platform/companies/update`. | `platformCompanies`, `adminAuditLogs`. | Feature control, branding, users. | Not reviewed |
| Users | `/platform-admin/users` | Set company, role, workspace access, enabled state, password reset, MFA reset and session revocation. | Platform Admin only. | Platform admin section. | `/api/platform-admin`, `/api/platform/users/update`, `/api/platform/users/force-mfa-reset`. | `users`, `employees`, MFA/security/audit records. | Employee linking, security/MFA. | Not reviewed |
| Employee linking | `/platform-admin/employee-linking` | Link/unlink users and employee records and repair duplicate links. | Platform Admin only. | Platform admin section. | `/api/platform-admin`, `/api/platform/employee-linking/link`. | `users`, `employees`, `adminAuditLogs`. | Employee editor, users. | Not reviewed |
| Security and MFA | `/platform-admin/security`, `/platform-admin/mfa` | Review security readiness; force setup/reset and disable users; inspect legacy MFA issues. | Platform Admin only. | Platform admin section. | `/api/platform-admin`, `/api/admin/security-audit`, force-MFA/user APIs. | `users`, `mfaSecrets`, `passkeyCredentials`, security/audit logs. | Login security, cleanup, Admin security audit. | Not reviewed |
| Roles and permissions | `/platform-admin/roles` | Display canonical roles, access fields and permission matrix. | Platform Admin only. | Platform admin section, access-control definitions. | `/api/platform-admin`. | `users`, `platformCompanies`. | Users, feature flags, route access. | Not reviewed |
| Audit and login security | `/platform-admin/audit-logs`, `/platform-admin/login-security` | Browse admin audit entries and login/setup-code/lockout events. | Platform Admin only. | Platform admin section. | `/api/platform-admin`; `/api/platform/audit-log` has no current page caller. | `adminAuditLogs`, `loginSecurityLogs`. | Security/MFA, companies/users. | Not reviewed |
| Cleanup | `/platform-admin/cleanup` | Preview and run repair/backfill tasks, including company metadata. | Platform Admin only; destructive/data-wide tasks require explicit confirmation and audit. | Platform admin section. | `/api/platform-admin`. | Multiple business collections, `users`, `employees`, audit records. | Firestore tenant migration, security audit. | Not reviewed |
| Feature control aliases | `/platform-admin/feature-control`, `/platform-admin/feature-flags` | Both render the same feature-flag section for global/company module switches. | Platform Admin only. | Platform admin section. | `/api/platform-admin`. | `platformCompanies`, platform settings. | Route/module access, companies. | Not reviewed |
| Branding alias | `/platform-admin/branding` | Redirects to `/admin/global-styling?scope=platform`. | Platform Admin intended. | Redirect to appearance editor. | `/api/admin/appearance`. | Platform appearance documents. | Admin global styling. | Not reviewed |
| Platform settings | `/platform-admin/settings` | Displays current operating model and hardening checklist. | Platform Admin only. | Platform admin section. | `/api/platform-admin`. | Platform settings/company configuration. | Security, feature control. | Not reviewed |

## 18. Legacy or unclear utilities

| Page or workflow | Route(s) | Purpose and main actions | Primary roles; authentication and permission requirements | Connected components | APIs | Firebase / Firestore / Storage | Related workflows | Status |
|---|---|---|---|---|---|---|---|---|
| Generic image upload test | `/upload` | Uploads an arbitrary selected image and obtains its download URL; no business owner or surrounding shell. | Root client guard only; intended role unclear. | Standalone Firebase Storage test page. | None. | Storage `images/*`. | No confirmed workflow. | Not reviewed |
| Empty uploader | `/uploader` | Empty page file; adjacent `src/app/uploader/index.html` is not an App Router page implementation. | Unclear. | None. | None. | None. | Generic upload utility. | Not reviewed |

---

## API route inventory

API routes remain part of the workflow inventory even when no current page directly calls them.

| API family | Routes | Current purpose and caller | Intended authorization | Main data/services | Status |
|---|---|---|---|---|---|
| Admin | `/api/admin/appearance`, `/api/admin/appearance/migrate`, `/api/admin/dashboard-data`, `/api/admin/migrate-mfa-secrets`, `/api/admin/overview`, `/api/admin/security-audit`, `/api/admin/users/[userId]` | Appearance, dashboard summaries, admin overview/security and sensitive user maintenance. Some endpoints have no current page caller. | Admin; appearance migration is Platform Admin. | `users`, `employees`, `bookings`, maintenance/vehicle summaries, appearance/company records, MFA/passkey/audit records. | Not reviewed |
| Appearance | `/api/appearance`, `/api/theme` | Runtime published appearance/theme loading. `/api/theme` has no direct current caller. | Appearance endpoint verifies Firebase token when provided; public fallback behavior requires review. | Appearance/settings documents. | Not reviewed |
| Auth and security | `/api/auth/firebase-token`, `/api/auth/user-code-login`, `/api/security/bootstrap-access`, `/api/security/login-attempt`, `/api/security/login-notification`, `/api/device-tokens` | Clerk bridge, access bootstrap, legacy login, security telemetry/notifications and device registration. | Mixed: bridge uses Clerk; bootstrap/notification/device verify Firebase; login/attempt endpoints are public by design and need abuse controls. | Clerk, Firebase Auth, `users`, `employees`, company/security/audit/device collections, email service. | Not reviewed |
| MFA and passkeys | `/api/mfa/setup`, `/api/mfa/verify`, `/api/passkeys/login/options`, `/api/passkeys/login/verify`, `/api/passkeys/register/options`, `/api/passkeys/register/verify` | Authenticator and WebAuthn credential lifecycle. Passkey pages are not currently present. | MFA/register require Firebase token; passkey login is public challenge/verification with rate/replay controls required. | `mfaSecrets`, `passkeyCredentials`, `passkeyChallenges`, `users`, security/audit logs. | Not reviewed |
| DVLA/DVSA | `/api/dvla/vehicle`, `/api/dvla/mot-history`, `/api/dvla/mot-history/sync` | Vehicle/MOT lookup and fleet sync. Lookup GET routes have no application-token check; sync POST verifies user/admin logic. | Public lookup exposure and upstream key/cost controls require review; manual sync should be service/Admin. | DVLA/DVSA APIs, `vehicles`, employee/user access. | Not reviewed |
| Assistant | `/api/chatgpt` | Produces assistant answers from selected operational data. | Verified Firebase user; company/module/data minimisation required. | OpenAI API and business collections. | Not reviewed |
| Statistics | `/api/statistics/business-rules`, `/api/statistics/daily-briefing`, `/api/statistics/daily-briefing/generate`, `/api/statistics/daily-briefing/feedback` | Manage rules, read/generate briefings and store feedback. | Rules and generation Admin; read/feedback require audience and company checks. | AI rule/briefing/feedback and audit collections. | Not reviewed |
| Platform | `/api/platform-admin`, `/api/platform/audit-log`, `/api/platform/companies/update`, `/api/platform/employee-linking/link`, `/api/platform/users/force-mfa-reset`, `/api/platform/users/update` | Cross-company administration and audited sensitive mutations. | Platform Admin on every operation. | Companies, users, employees, business cleanup/summary collections, audit/security records. | Not reviewed |

## Preliminary structural findings from inventory

These findings identify review targets only. They do not mean the affected workflow has been audited.

### Duplicate and overlapping routes

- `/quote-view/[id]` re-exports `/quote/[id]` exactly.
- `/screens/homescreen` redirects to `/home`; `/service/home` redirects to `/service-home`.
- `/bookings` and `/wall-view` both redirect to `/dashboard`.
- `/platform-admin/feature-control` and `/platform-admin/feature-flags` render the same section.
- `/platform-admin/branding` redirects to the Admin global-styling editor.
- `/note/[id]`, `/note-edit/[id]`, `/edit-note/[id]`, and the dashboard `EditNoteModal` overlap; the first two are near-duplicates.
- `/finance-queue` and `/ready-invoice` represent the same ready-to-invoice queue with different implementations.
- `/finance-dashboard` and `/finance-home` are both labelled as finance dashboards but have different responsibilities.
- `/general` and `/immediate` overlap with the newer `/defects/general` and `/defects/immediate` routes.
- `/vehicle-info/[id]` overlaps with the much larger `/vehicle-edit/[id]` workflow.

### Empty, obsolete, unreachable, or unclear pages

- `/invoice-view/[id]` and `/uploader` have empty `page.js` files.
- `/upload` appears to be a generic Firebase Storage test utility with no identified business owner.
- `/contacts`, `/lorry-home`, `/terms`, `/uploader`, `/wall-view`, and `/platform-admin/feature-flags` have no confirmed inbound application link in the static reference scan; redirects or external bookmarks may still reach some of them.
- `/booking-page` advertises three booking types but all three options currently open `/create-booking` without a type distinction.
- `/settings` is classified as an Admin path even though it includes ordinary personal account actions.
- `/quote-templates` writes global/settings data, but its owning role is not explicit.

### Links to routes that do not exist

- Finance: `/finance/create`, `/finance/export`, `/finance/settings`, `/finance/job/[id]`; finance tracker also navigates to `/invoice-view` without an ID.
- Service landing: `/service/minor-service`, `/service/mot-precheck`, `/service/service-form`, `/service/service-history`, `/service/service-record`, `/service/vehicle-prep`, `/service/daily-check`, `/service/defects`, `/service/work`.
- Lorries: `/add-lorry`, `/lorry-info/[id]`.
- Vehicle checks: `/vehicle-checks/defects`, `/vehicle-checks/completion`, `/vehicle-checks/vehicles`.

### High-risk security and data areas

- Clerk middleware currently runs but does not explicitly protect private page route patterns; `ProtectedLayout` redirects in the browser.
- `isPathAllowedForAccess` and `isModuleEnabledForPath` are defined but not used as a global page gate.
- Current Firestore rule helpers treat an active user as any signed-in user and disable company/workspace distinctions for most business collections.
- Client tenant queries and payloads currently disable company filtering and company stamping.
- Firestore is written directly from 67 client files. Employee access, settings, HR, status transitions, invoice/payment transitions and destructive actions are the highest-risk direct writes.
- Storage paths are not consistently company-scoped; generic upload and HR/vehicle/quote evidence paths need ownership checks.
- Public/legacy authentication, passkey and DVLA endpoints require explicit rate-limit, replay, upstream-cost and exposure review.
- Platform Admin APIs are a strong server-side boundary but share a large multi-action route; every action and audit write must be tested separately.

### Business-critical workflows that must be reviewed together

1. Clerk login → Firebase token bridge → user/access bootstrap → MFA → workspace landing → Firestore/Storage rules.
2. Root layout → main navigation → workspace/module selection → page permission feedback → logout/disabled account.
3. Dashboard diary → create/edit/delete/restore booking → contacts → availability conflicts → attachments.
4. Enquiry → booking/job → quote revision → operational completion → review queue.
5. Review queue → finance queue → invoice preparation/approval → issued invoice → payment status. Operational job status and financial status must be separated during this review.
6. Employee/personnel file → mirrored user access → HR/holiday/timesheet permissions → Admin/Platform Admin repair tools.
7. Vehicle → check/defect → maintenance booking/job → service/MOT history → fleet readiness.
8. Statistics/assistant → audience/company filters → source collections → finance-sensitive outputs.

## Recommended audit order

1. Authentication, Clerk/Firebase bridge, route protection, access bootstrap, Firestore rules and Storage rules.
2. Shared root layout, header/sidebar, workspace switching, module flags, global loading/error/permission states and responsive shell.
3. Dashboard diary and operational home, including shared booking/maintenance/note modals.
4. Client data and saved contacts.
5. Jobs and enquiries.
6. Booking create/edit/delete/restore and availability handling.
7. Quotes and quote templates.
8. Job completion, review queue and preparation workflows.
9. Finance review, invoice issue and payment-state workflows.
10. Employees, mirrored access, HR, holidays, timesheets and sensitive documents.
11. Vehicles/equipment, checks, defects, maintenance, service and MOT.
12. H&S and compliance records.
13. Statistics and assistant data exposure.
14. Settings and company Admin.
15. Platform Admin, cleanup and cross-company controls.
16. Legacy aliases, duplicate routes, empty pages and unowned utilities after their replacement/ownership is confirmed.

## Recommended first review

The first tightly connected workflow should be:

**Clerk sign-in → Firebase custom-token bridge → access bootstrap → MFA/disabled-user handling → private-route protection → Firestore and Storage authorization.**

Start with these files and routes as one bounded security workflow:

- `/login`, `/auth/complete`, `/setup-mfa`, `/verify-mfa`
- `src/middleware.js`
- `src/app/layout.js`
- `src/app/context/authContext.js`
- `src/app/components/ProtectedLayout.js`
- `src/app/components/AccountGuard.jsx`
- `src/app/utils/accessControl.js`
- `src/app/utils/firestoreAccess.js`
- `/api/auth/firebase-token`
- `/api/security/bootstrap-access`
- `firestore.rules` and `storage.rules`

Do not review a business page until this boundary has a documented role matrix and automated tests proving anonymous, disabled, user-only, service-only, Admin and Platform Admin behavior.
