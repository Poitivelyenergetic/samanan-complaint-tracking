# Samnan — Complaint Tracking

An internal staff tool for logging, assigning, and resolving customer complaints. Bilingual
(Arabic/English, RTL/LTR), built with Next.js (App Router), Tailwind CSS, and Firebase
(Firestore + Authentication).

Not a public site — every page except the login screen requires a staff sign-in.

## Tech stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** for styling
- **Firebase**
  - **Firestore** — `complaints`, `users` (staff profile), and the `companies` / `administrations`
    / `positions` org-browsing hierarchy
  - **Firebase Authentication** (email/password) — staff sign in with a plain **username**,
    which is mapped internally to a synthetic email (`<username>@samnan.local`) so Firebase
    Auth's email/password provider can be used without exposing "email" anywhere in the UI
- **next-intl** for i18n, with `/ar` and `/en` locale-prefixed routes and automatic RTL/LTR

## 1. Install dependencies

```bash
npm install
```

## 2. Create a Firebase project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project
   (or use an existing one).
2. **Enable Authentication** → Build → Authentication → Sign-in method → enable **Email/Password**.
3. **Enable Firestore** → Build → Firestore Database → Create database (start in production mode;
   the rules in `firestore.rules` handle access control).
4. **Deploy the security rules** in `firestore.rules` — either paste the file's contents into
   Firestore Database → Rules in the console, or, if you have the Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore   # point it at this project, keep the existing firestore.rules
   firebase deploy --only firestore:rules
   ```

## 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

`.env.local` is git-ignored and must never be committed. Fill in two groups of values:

### Client config (`NEXT_PUBLIC_*`)

From Firebase Console → Project settings (gear icon) → General → "Your apps" → add a **Web app**
if you haven't already → SDK setup and configuration → **Config**:

| Env var | Firebase config field |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

These are used by `src/lib/firebase.ts` and are safe to expose to the browser.

### Admin config (server-only)

From Firebase Console → Project settings → **Service accounts** → **Generate new private key**.
This downloads a JSON file — copy three fields from it into `.env.local`:

| Env var | JSON field |
|---|---|
| `FIREBASE_PROJECT_ID` | `project_id` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_PRIVATE_KEY` | `private_key` (keep the quotes and the `\n` sequences as literal text — the app converts them to real newlines at runtime) |

These are used by `src/lib/firebaseAdmin.ts` and **must never** be exposed to the browser
(no `NEXT_PUBLIC_` prefix). They're required both by the seed script and, at runtime, by the
`/api/employees` routes that back the Employees module (see [Architecture notes](#architecture-notes)).

Never commit the downloaded service-account JSON file — it's covered by `.gitignore`
(`*firebase-adminsdk*.json`, `serviceAccountKey.json`, `*service-account*.json`), but double
check before committing if you save it into the project folder.

## 4. Seed demo data

```bash
npm run seed
```

This uses the Firebase Admin SDK to create:

- A demo org structure: one company ("Samnan"), two administrations ("Customer Support",
  "Quality Assurance"), and three positions under them.
- 4 staff accounts (Firebase Auth user + matching Firestore `users` profile), each placed in one
  of those positions with `permissions` filled in from their role's defaults:
  | Username | Password | Role | Position |
  |---|---|---|---|
  | `mhmd` | `123456` | admin | Support Team Lead |
  | `sara` | `123456` | employee | Customer Support Agent |
  | `ali` | `123456` | employee | Customer Support Agent |
  | `huda` | `123456` | admin | Quality Assurance Manager |

  (Firebase Auth requires passwords to be at least 6 characters, so the demo password is
  `123456` rather than the shorter `123` you might expect.)
- 5 sample complaints spread across every status (`Open`, `Assigned`, `Processing`, `Cancel`,
  `Closed`) and assigned across the staff above.

The script is safe to re-run — it upserts by fixed IDs instead of duplicating data.

## 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/ar/login`
(Arabic is the default locale). Sign in with `mhmd` / `123456`, or switch to English with the
language switcher in the top corner first.

## Project structure

```
src/
  app/
    [locale]/              # all routes are locale-prefixed (/ar/..., /en/...)
      login/                # public
      (app)/                # protected route group — redirects to /login if signed out
        dashboard/           # complaint list, filters, search
        complaints/new/      # create complaint
        complaints/[id]/     # view/edit/delete complaint
        companies/           # Companies -> Administrations -> Positions -> Employees browse tree
        employees/           # employee create/edit/delete forms + pending signup requests
        marketing/           # placeholder page
    api/
      employees/            # manageEmployees-gated REST endpoints backed by the Admin SDK
  components/               # ComplaintForm, EmployeeForm, Navbar, LanguageSwitcher, ...
  lib/
    firebase.ts              # client SDK init (Auth + Firestore)
    firebaseAdmin.ts          # lazy server-side Admin SDK init
    api-auth.ts                # verifies ID token + a required permission for API routes
    complaints.ts, users.ts, employees-api.ts   # Firestore/API data access
    companies.ts, administrations.ts, positions.ts   # org-hierarchy Firestore data access
    types.ts                  # shared TypeScript types
  i18n/                     # next-intl routing/navigation/request config
messages/
  ar.json, en.json          # all UI strings — keep both files in sync
scripts/
  seed.mts                  # demo data seed script (Admin SDK)
firestore.rules             # Firestore security rules
```

## Org structure: Companies → Administrations → Positions → Employees

Staff are organized in a four-level browse hierarchy, each level a Firestore collection:
`companies` → `administrations` (each has a `companyId`) → `positions` (each has an
`administrationId`) → employees in `users` (each has `companyId`/`administrationId`/
`positionId`). It's purely for browsing and organizing staff — not separate tenants of the app;
there's no cross-company data isolation.

The **Companies** nav entry (visible with `viewEmployees`) drills down through all four levels,
each screen showing a breadcrumb back to its parents. The employee search box on the Companies
list jumps straight to an employee's Edit form by name/username without drilling down manually.
Deleting a company/administration/position is blocked (with an explanatory message) while it
still has anything under it — administrations under a company, positions under an
administration, or employees in a position — so records are never silently orphaned.

The New/Edit Employee form has three cascading dropdowns (Company → Administration → Position,
each filtered to its parent) alongside Role and the permissions checklist described below.

## Roles & permissions

Each staff member has a `permissions` object on their Firestore `users/{uid}` document — eight
independent booleans (`viewAllComplaints`, `editAnyComplaint`, `viewEmployees`,
`manageEmployees`, `accessMarketing`, `manageCompanies`, `manageAdministrations`,
`managePositions`) alongside `name`, `username`, `number` (staff/ID number), and their
`companyId`/`administrationId`/`positionId`. **`permissions` is what every access check actually
reads** — both in the UI and in `firestore.rules`/`/api/employees`.

`role` (`admin`/`employee`/`user`) still exists on the same document, but it's now only a
preset: picking a role in the Employees form (`src/lib/types.ts` →
`ROLE_DEFAULT_PERMISSIONS`) fills in that role's default permissions, and the admin can then
hand-tune any individual box via "Manage permissions" on the New/Edit Employee form — e.g.
giving one employee read-only access to the org hierarchy without full `manageEmployees`.
Changing the role dropdown again resets permissions back to that role's defaults.

Defaults: **admin** gets all eight; **employee** gets `viewAllComplaints`/`editAnyComplaint`/
`accessMarketing`; **user** gets none (it only ever sees complaints assigned to or created by
itself, and can still create new ones — see `isOwnComplaint()`/`isSelfCreatedComplaint()` in
`firestore.rules`). `manageCompanies` is the broadest of the three org-management permissions —
it also grants what `manageAdministrations` and `managePositions` grant individually, mirroring
that a company's administrations and positions live underneath it.

Firestore rules (`firestore.rules`) are the source of truth for access control — the UI hides
what a permission doesn't allow, but data access is enforced independently at the database
level via a `hasPermission(perm)` rule helper, so an account can't read/write `complaints`,
`users`, `companies`, `administrations`, or `positions` beyond what its `permissions` map grants
by calling Firestore directly either.

**Future work:** permission changes aren't currently logged anywhere (who changed what, when) —
an audit trail would be a natural addition if this needs to be auditable later.

## Architecture notes

**Why employee creation goes through an API route instead of the client SDK.** Firebase's
client-side `createUserWithEmailAndPassword` signs in as the newly created user in the current
browser tab — which would kick the admin out of their own session the moment they created a new
employee. To avoid that, creating/editing/deleting a staff account calls a Next.js API route
(`src/app/api/employees/route.ts` and `.../[id]/route.ts`) that uses the **Admin SDK** to create
the Firebase Auth user and Firestore profile server-side, while the admin's browser session is
left untouched. Each request is verified server-side (`src/lib/api-auth.ts`): the caller's
Firebase ID token is checked, and their Firestore `permissions.manageEmployees` must be `true`.

**Practical implication:** the `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` /
`FIREBASE_PRIVATE_KEY` admin credentials aren't just for the one-off seed script — the Employees
module needs them configured at runtime too (in production, set them as server environment
variables on whatever host you deploy to).

**Complaint status suggestion, not enforcement.** Per the spec, moving `assigned_to` from empty
to a staff member shows an inline suggestion to also set status to `Assigned`, with a
one-click button — but it's never forced; the admin/employee can leave the status as-is or pick
something else entirely.

## Out of scope for v1

- Tasks and Sales modules
- Payment processing, a customer-facing portal, and email notifications — the `user` role and a
  notification pipeline are natural follow-ups once there's demand for a customer-facing
  complaint portal.
- The Marketing nav entry is a placeholder page only (`src/app/[locale]/(app)/marketing/`) —
  no functionality is built out yet, by design, so it's easy to extend later.

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run a production build |
| `npm run lint` | ESLint |
| `npm run seed` | Seed demo staff + complaints (requires Admin SDK env vars) |
