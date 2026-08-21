# VPMS — Visitor Parking Validation Management System

Visitor log and daily parking-validation report for the **ETTP Unit**.

---

## 1. Context and constraints

The **MeeSoft** stamping device in the unit is **completely offline** — it is plugged
into power and nothing else. No network, no PC, no notebook. There is no way to read
data out of it, and there never will be.

How the process works today:

1. Power on the device, tap the authorised card
2. Press the validation code (1 = free 2 hrs, 2 = free 4 hrs; there may be more codes —
   **not yet confirmed**)
3. Tap the visitor's parking card to write the validation onto it
4. The visitor returns the card at the exit, where the building's own system charges them

**What follows from that:** VPMS is not connected to the stamping device and cannot be.
Every row comes from someone typing it in, so **this app is the only source of truth** —
and the first goal of the UI is that logging a visitor is **faster than writing it on
paper**. If it is slower, it stops being used.

---

## 2. Folder layout

```
vpms/
├─ README.md                ← this file (all design decisions)
├─ .gitignore
├─ supabase/
│  └─ migrations/
│     ├─ 0001_init.sql                             schema + RLS + triggers
│     ├─ 0002_seed_and_views.sql                   seed data + reporting view
│     ├─ 0003_username_lowercase_and_company_counter.sql
│     ├─ 0004_harden_functions_and_extensions.sql  security-advisor fixes
│     ├─ 0005_english_labels_and_comments.sql
│     ├─ 0006_simplify_roles_admin_user.sql
│     ├─ 0007_fix_duration_rounding.sql
│     ├─ 0008_custom_validation_hours.sql
│     ├─ 0009_close_open_visits_and_status.sql
│     ├─ 0010_close_open_visits_rpc_wrapper.sql
│     ├─ 0011_schedule_daily_report.sql
│     ├─ 0012_drop_final_report_recipients.sql
│     └─ 0013_vehicle_brand_and_approval.sql
└─ web/                     Next.js 16 + React 19 + Tailwind 4
   └─ .env.local.example
```

Supabase project: **VPMS** (`qanyeqnqujqowbvdjpon`), in the same organisation as
RoomFinder but a separate project with its own database and its own user accounts.

---

## 3. ⏰ Time zone policy — read before touching anything time related

This is what breaks most often in systems like this. The rule is: **convert in exactly
one place, never twice.**

| Layer | Rule |
|---|---|
| **Storage** | every time column is `timestamptz`, which Postgres stores as UTC. Never plain `timestamp`. |
| **Date of a visit** | `visits.visit_date` is a generated column holding the **Thailand-local** date, not the UTC one. With the UTC date, anything before 07:00 local lands on the previous day's report. |
| **Writing** | send `check_in_at` as an ISO string with an offset (`toISOString()`), never a bare `"YYYY-MM-DD HH:mm"` that could be read several ways. |
| **Manual time edits** | what the user types is Thailand time, so it must be assembled into an instant with an explicit `+07:00`. Never rely on `new Date("2026-08-06T09:15")`, which uses the device's zone. |
| **Display** | always format with `Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok' })`. Never trust the device zone — a phone set wrong, or a laptop taken abroad, must still show the same clock time. |
| **Reports / Excel** | read from the `public.visits_report` view, which has already converted to local time. Do not convert again. |
| **Cron** | schedules are UTC: 17:30 Thailand = **10:30 UTC**. |

**Why `visit_date` hardcodes `+07:00` instead of `'Asia/Bangkok'`:** generated columns
only accept `IMMUTABLE` expressions. Converting by *zone name* is `STABLE` (the tz
database can be updated) and is rejected; converting by *interval* is `IMMUTABLE` and is
accepted. Thailand is a fixed UTC+7 and has never observed DST, so this is safe. Views
have no such restriction and use the zone name for clarity.

This was verified against the live database across five boundary cases — a naive UTC
date got three of the five wrong.

---

## 4. Data model

| Table | Purpose |
|---|---|
| `profiles` | mirror of `auth.users` — `username`, `email`, `full_name`, `role` |
| `validation_types` | the codes on the MeeSoft device (id = the number actually pressed), editable from settings |
| `companies` | company lookup, created on the fly, drives autocomplete |
| `hosts` | ETTP staff who receive visitors |
| `visits` | **the main table** — in/out, validation, card no., host |
| `report_settings` | single row: recipients, send time, send days |
| `report_runs` | log of every report email sent |
| `visits_report` (view) | visits with local times — the single source for Excel and email |

**Roles:** `admin` (everything, incl. settings and user management) · `user` (logs, edits
and checks out visits). Both roles may write — the split is only about administration.

**Sessions** last until the user presses Sign out. That needs two things to agree: the auth
cookie carries an explicit 400-day `maxAge` (see `lib/supabase/cookies.ts`), and the Supabase
project must leave *Authentication → Sessions → Time-box user sessions* and *Inactivity
timeout* empty. Without the cookie lifetime it would be a session cookie, which a phone
can drop whenever the OS reclaims the browser.

**Decisions worth knowing:**

- `visits.company_name` / `host_name` keep a snapshot next to the foreign key, so renaming
  a company later does not rewrite reports that were already sent
- `parking_card_no`, `license_plate` and `vehicle_brand` **have fields but are not
  required** — `parking_card_no` / `license_plate` are the only way to trace a charge back
  if the building's invoice ever needs reconciling; `vehicle_brand` + `license_plate`
  together are what actually identify one physical car in the lot
- `visitor_count` — one car, one stamp, several people
- `auto_closed` — visits nobody checked out get closed by the end-of-day job and
  **flagged**, rather than quietly disappearing

### Vehicle brand

Free text (`visits.vehicle_brand` — Toyota, Ford, Benz...), not a lookup table, because the
set is open-ended and there is no fixed list to validate against. The datalist suggests a
starting set of common brands (`lib/vehicle-brands.ts`) plus whatever has actually been
typed before (`distinctSorted()` over the historical values in `page.tsx`) — any text can
still be typed, the list only speeds up the common case.

### Approval

Each visit carries its own `approver_name` and `approved_on` (`visits.approved_on`), not a
per-day table — the head sometimes approves visits one at a time rather than the whole day
together. Status is derived, never stored:

| `approver_name` | `approved_on` | status |
|---|---|---|
| empty | empty | `no_approver` |
| set | empty | `awaiting` |
| set | set | `approved` |

`approver_name` is free text with the same autocomplete pattern as `vehicle_brand` — there
is no roster, because who is expected to approve can change at short notice. Two database
constraints keep it consistent: `approved_on` can never be before `visit_date`
(`visits_approved_after_visit`), and it can never be set without an approver on record
(`visits_approver_required_when_approved`). Both are mirrored in the app with a friendly
message before the row ever reaches Postgres.

Because the head usually approves a whole day's visits from one email reply, the Today
board supports **selecting several rows and applying an approver or an approval date to
all of them at once** (`app/actions/approvals.ts`) — "Select: all / awaiting approval"
above the list, then "Set approver…" / "Set approved date…" once something is selected.
Setting the approver never touches `approved_on` on rows that already had one, so swapping
in a stand-in head does not silently unapprove anything. A new entry also prefills
`approver_name` from whichever approver was most recently used that day, since most days
have exactly one.

### Validation types

Three codes are seeded — 1 = 2 hrs, 2 = 4 hrs, 3 = all day — where the id is the key
actually pressed on the MeeSoft device. They are marked `is_confirmed = false` because
nobody has verified them with building management yet; the flag is recorded but not
surfaced in the UI. Codes can be added, edited or removed from settings without a migration.

A fourth slot, **Custom** (`is_custom = true`, id 99), asks for the number of free hours on
each visit and stores it in `visits.custom_free_hours`. Use it for one-off arrangements, or
for a code the building introduces before anyone has added it properly. Its id is outside
the device-key range on purpose — it is not a key anyone presses, and the report leaves
`validation_code` null for those rows while showing "Custom 6.5 hrs" as the label.

### Extending a visit

A meeting overruns, the visitor comes back to the desk and gets re-stamped for longer.
Press **Edit** on the row and pick the new validation — the record always reflects the
final validation the visitor left with, which is what the cost is based on. The app keeps
no history of the earlier value; add one if it ever needs auditing.

### Backdated entries

The day board lives at `/day?date=YYYY-MM-DD` (`app/(main)/day/page.tsx`), which picks which
day is on screen, defaulting to and clamping at today (a future date, whether typed into the
URL or requested past the cron's own `todayKey()`, falls back rather than rendering an empty
"future" page). `date-nav.tsx` provides the prev/next arrows, a native date picker (`max` =
today), a "Today" shortcut, and a link back to the calendar dashboard — pushing
`/day?date=...` or the bare `/day` for the common case. See section 6 for how `/day` relates
to the calendar at `/`.

Two things change on a day that is not today:

- the **Add visitor** form leaves Time in blank instead of prefilling the current clock
  time — a past day has no "now" to default to, and silently prefilling today's clock time
  onto a backdated row would be a wrong answer nobody asked for
- **Check out now** does not appear on open visits — that button stamps the real current
  time, which would record an exit on the wrong day. A muted "Edit to add a check-out time"
  takes its place; typing the exact time through Edit still works normally. The same rule
  is enforced again server-side in `checkOutVisit` (`app/actions/visits.ts`), which rejects
  the call outright if the visit's `visit_date` is not today — the UI omission is not the
  only thing standing in the way.

**Send now** on the report card sends whichever date is on screen, not necessarily today —
useful for resending a day after a correction, or producing a report for a day the schedule
never got to.

---

## 5. Reports and email

### Flow

```
every 15 min   pg_cron ──► /api/cron/daily-report
                           ├─ is it a send day, and has the send time passed?
                           ├─ has today's report already gone out?   → skip
                           ├─ close visits nobody checked out (flagged)
                           ├─ build the Excel file from visits_report
                           └─ email it to the reviewer, with the file attached
                                     │
                           she checks it, fixes anything in the app,
                           then writes to the manager from her own mailbox
```

**The system emails exactly one person: the reviewer.** It never writes to the manager —
a report landing in the manager's inbox straight from a personal Gmail account was never
going to look right, and the numbers deserve a human glance first either way. There is a
**Send now** button for sending it earlier, or again after a correction.

Every attempt is written to `report_runs` (when, who triggered it, to whom, sent / failed /
skipped and why), so "did today's report go out?" always has an answer.

### Why the schedule is every 15 minutes

The endpoint decides for itself whether the report is due, rather than trusting the clock
that woke it. That buys three things: the send time lives in `report_settings` and can be
changed from the Settings page without touching the cron entry; a run missed while the app
was down still goes out on the next tick; and calling the endpoint twice cannot send twice,
because a successful run for that date makes the next call skip.

`?force=1` bypasses the day, time and already-sent checks for testing.

### The Excel file

`GET /api/export/visits?from=YYYY-MM-DD&to=YYYY-MM-DD` (requires a signed-in session; both
default to today, `?date=` is accepted as a single-day shorthand). Ranges longer than 366
days are refused so one request cannot pull the whole table. The file is named
`VPMS-ETTP-visitors-<date>.xlsx` for a single day and
`VPMS-ETTP-visitors-<from>_to_<to>.xlsx` for a range.

The **Export Excel** button opens a panel with quick ranges — Today, Yesterday, This week,
This month, Last month, Last 30 days — plus From/To pickers for anything else. All the date
maths runs through `lib/tz.ts`, anchored at midday Thailand time so adding days can never
tip a value across a date boundary.

- sheet **`Details`** — no. / date / time in / time out / duration / visitor / people /
  company / host / validation / free hrs / card no. / plate / vehicle / purpose / status /
  approver / approved, with a frozen header and an autofilter. A row still awaiting
  approval is coloured the same way an unresolved status is, because this sheet doubles as
  the approval request the head reads.
- sheet **`Summary`** — totals, by day (ranges only), by validation, by host, by company,
  an **Approval** block (approved / awaiting / no approver counts), a **Needs attention**
  block counting anything still in, estimated, missing an exit, awaiting approval or with
  no approver set, and a **Logged by** breakdown at the end. This is the sheet the manager
  actually reads; `Logged by` sits here rather than in Details because it is for internal
  reference, not something the head needs per row to approve the day.

Times are written as `HH:mm` **text**, already converted to Thailand time by the view.
Writing them as real Excel times would make the file render differently depending on the
reader's machine, which is the one thing this report cannot afford.

`npx tsx scripts/preview-report.ts [out.xlsx]` renders a sample workbook covering every
status, so the layout can be checked without signing in or seeding data. Set
`PREVIEW_FROM` / `PREVIEW_TO` to preview the multi-day layout.

### Visits nobody checked out

At the end of the day `private.close_open_visits(date)` closes whatever is still open:

- the exit time becomes **check-in + the free hours that were stamped** — a rule that can
  be explained, rather than an arbitrary cutoff
- `auto_closed` stays true, so the row reports as **estimated** rather than posing as a
  time somebody actually recorded
- **Free all day** has no hour count, so nothing can be derived: the exit stays empty and
  the row reports as **no check-out**

Either way the secretary can still Edit the row and enter the real time afterwards.
Four statuses come out of this: `in`, `out`, `estimated`, `no_checkout`.

### Sending via Gmail

**Gmail SMTP + nodemailer** from `roomfinder8888@gmail.com`.

The sender authenticates with a **16-character App Password**, not the normal Gmail password:

1. Turn on 2-Step Verification for `roomfinder8888@gmail.com`
2. Create an App Password at <https://myaccount.google.com/apppasswords>
3. Put it in `GMAIL_APP_PASSWORD` in `.env.local` and in the Vercel environment variables

**Recipients are not hardcoded** — they live in `report_settings.draft_recipients` and are
edited from the Settings page (admin only).

Worth knowing: Gmail allows roughly 500 messages a day, far more than needed, and mail from
a `@gmail.com` address can land in a corporate spam folder — the first one may need to be
marked "not spam" once.

`npx tsx scripts/preview-email.ts [out.html]` renders the message to a file so the layout
can be checked without sending anything to anybody.

### Turning the schedule on

`pg_cron` and `pg_net` are installed, but nothing is scheduled until the app has a public
URL. After deploying, run this once with the real values:

```sql
select private.schedule_daily_report('https://your-app.vercel.app', '<CRON_SECRET>');
```

and `select private.unschedule_daily_report();` to stop it. Default schedule is
**Mon–Fri, 17:30 Thailand time**, both changeable from Settings.

---

## 6. Dashboard and day view

The app is split across two routes under `(main)/`:

- **`/` — the dashboard** (`page.tsx` + `calendar-view.tsx`) — a week or month calendar,
  `?view=week|month&date=YYYY-MM-DD`. Each day cell/card shows a visit count and, in week
  view, a short preview of who visited; a day with anything not fully approved gets an
  amber tint (month) or a dot (week) so it stands out while paging through past weeks.
  Tapping a date goes to that day's detail. Entirely server-rendered `<Link>` navigation —
  no client JS is needed for paging or switching views, which keeps it as simple as the
  rest of the app.
- **`/day?date=YYYY-MM-DD` — the day board** (`day/page.tsx`, unchanged from when this was
  the app's only view) — add / edit / check out / bulk-approve, the report card, the export
  panel. `DateNav` here still steps a single day at a time and links back to the dashboard
  with a small calendar icon.

This split exists because daily volume is genuinely small (a handful of visits a day, most
days fewer) — a bare list of every day back to the start would be mostly empty rows to
scroll past. A calendar answers "was anything logged this week" at a glance and only opens
the detail for a day that actually has something to look at.

Report emails link to the specific date's `/day` page (`lib/report/email.ts`'s `dayUrl()`),
not to the dashboard — the reviewer clicking "Open in the app" wants that day's rows to fix,
not a calendar to page through first.

---

## 7. Multi-device support

The secretary works at a desk but walks over to the stamping device, so logging from a
phone has to work properly.

- **Phone (< 640px)** — visits render as cards, a floating "＋ Add" button sits bottom
  right, tap targets are ≥ 44px, the form is a full-height bottom sheet
- **Tablet / desktop** — wider rows, the form is a centred modal, widened to `max-w-2xl` so
  filling it in needs less scrolling
- Validation is picked with **three large buttons**, not a dropdown — one tap on any device
- Numeric fields use `inputMode="numeric"` so phones show the number pad
- The Add/Edit sheet's header and Cancel/Save footer are fixed flex children, not
  `sticky`-within-scroll elements — only the fields in between scroll, so Save is never a
  scroll away no matter how long the form gets (verified: scrolling the field area all the
  way down leaves the Save button at the exact same screen position)
- Native `<input type="date">` / `type="time">` icons get `color-scheme: light dark` in
  `globals.css`, or the browser draws them in a fixed dark colour that disappears against
  this app's dark theme

The UI is English, but visitor and company names are frequently typed in Thai, so the font
(Noto Sans Thai) deliberately covers both scripts.

### Dark / light toggle

Follows `prefers-color-scheme` by default; `theme-toggle.tsx` (header, next to Sign out)
lets a visitor override it explicitly. Three CSS layers in `globals.css`, later wins:
`:root` (light, the default) → `@media (prefers-color-scheme: dark)` scoped with
`:not([data-theme="light"])` → `:root[data-theme="dark" | "light"]`, which the toggle sets
and always wins once pressed. The choice is written to `localStorage` and re-applied by a
blocking inline script (`lib/theme-script.ts`, injected in the root `layout.tsx`'s `<head>`)
that runs before hydration, so there is no flash of the wrong theme on reload — verified by
toggling, reloading, and reading `data-theme` straight back off `<html>`. The native
date/time icon `color-scheme` (above) is pinned the same way, so the toggle flips those too
rather than leaving them following the OS while the rest of the page follows the override.

### Why date navigation doesn't refetch everything

`(main)/layout.tsx` fetches everything that does **not** depend on which day is on screen —
validation types, hosts, companies, vehicle brands, approver names, report settings — once,
and hands it down through `board-data-context.tsx` (`useBoardData()`). `(main)/day/page.tsx`
only fetches the two queries that actually vary with the date: `visits` and `report_runs`.

This matters because Next.js does not re-render a layout just because the page's
`searchParams` changed — confirmed by instrumenting the layout with a one-off log line and
watching it print exactly once while navigating across four different `?date=` values.
Before this split, every arrow click on `DateNav` re-ran all eight queries; now it only
waits on two. `(main)/loading.tsx` and a `useTransition` pending state in `date-nav.tsx`
cover the remaining round trip with immediate visual feedback (dimmed controls, a small
spinner) rather than the page appearing to freeze.

The proxy/middleware auth check (`supabase.auth.getUser()` in `src/proxy.ts`) still runs on
every navigation and was observed taking anywhere from ~150ms to ~750ms in local testing —
often more than the page's own queries. That's a separate cost from what this section
fixes; left alone because `getUser()` is what makes the session check trustworthy rather
than just trusting a cookie (see the comment in `proxy.ts`).

---

## 8. Running it

```bash
cd web && npm install && npm run dev
```

Before the first run:

1. copy `web/.env.local.example` to `web/.env.local` and fill in the values
2. apply the migrations in `supabase/migrations/` in order (already applied to the VPMS project)
3. create accounts — there is no public signup. Add the user in the Supabase dashboard
   (Authentication → Add user), then insert the matching `public.profiles` row with a
   **lowercase** username and a role.

> If you ever create a user by writing to `auth.users` directly instead of using the
> dashboard, set `confirmation_token`, `recovery_token`, `email_change` and
> `email_change_token_new` to `''` rather than leaving them NULL. GoTrue reads them into
> Go strings and a NULL makes every sign-in attempt fail with HTTP 500 — which looks
> exactly like a broken password, not a broken row.

---

## 9. Status

Done:

- database schema, RLS, triggers, reporting view — applied to the VPMS project,
  security advisor clean (0 warnings)
- login (username → email → Supabase auth), route protection, sign-out
- the Today board: add / edit / check out / undo / delete, autocomplete, per-day summary
- the three ways a visit actually gets logged, all verified end to end:
  1. **all at once** when the visitor leaves — fill in both Time in and Time out
  2. **before the meeting** — Time in only, then **Check out now** stamps the current
     time in one tap (**Undo check-out** clears it again if the wrong row was tapped)
  3. **extended** — Edit and pick a longer validation, including Custom hours

- Excel export — `/api/export/visits`, single day or any range, with quick-range presets
- `private.close_open_visits(date)` for visits nobody checked out

- the daily report email — Gmail SMTP, Excel attached, **Send now** button, every attempt
  logged in `report_runs`
- the schedule — `pg_cron` every 15 min into `/api/cron/daily-report`, which closes open
  visits and then sends if the report is due
- Settings page (admin) — recipient, send time, send days, and the two toggles
- date navigation (`/day?date=...`) — the board can be walked back to any past day to log a
  backdated visit, with Check out now and the empty-Time-in prefill both gated to today
- per-visit approval (`approver_name`, `approved_on`) with multi-select bulk actions to set
  an approver or an approval date across several rows at once, and vehicle brand as a
  free-text field alongside the licence plate — the Approval fields are always visible on
  the form (no collapse/expand to fight with), and the autocomplete list is seeded from
  whatever has actually been typed before
- the calendar dashboard (`/`, week or month, `calendar-view.tsx`) — tap a date to open its
  `/day` detail; days with anything unapproved are flagged directly on the grid
- dark/light toggle in the header, persisted and flash-free on reload (`theme-toggle.tsx`,
  `lib/theme-script.ts`)
- the layout/page data split (`board-data-context.tsx`) so paging between days only re-runs
  the two queries that actually depend on the date

Verified end to end against the live database and the running app: creating a visit with a
vehicle brand and an approver, the "awaiting → approved" bulk flow (including the server
rejecting a bulk approval date for a row with no approver set), the approver-swap bulk
action leaving an existing `approved_on` untouched, backdated entry with no quick
check-out button, the Excel/email output for all of it, the calendar's counts and
needs-attention flags against real inserted rows, and the theme toggle surviving a reload.

Not built yet:

- Search/filter within a day or across days by name, company or plate — the calendar covers
  "what happened when", not "find this specific visitor"
- Settings for validation types and hosts (still SQL-only)
- user management (accounts are created in the Supabase dashboard)

## 10. Open questions

- [ ] how many validation codes the MeeSoft device really has, and the value of each —
      needs building management
- [ ] the list of ETTP staff for the host dropdown
- [ ] the manager's email address (can be added from settings later)
- [ ] after the first month of real use, get the building's parking invoice and compare it
      against the report to see whether the numbers line up
