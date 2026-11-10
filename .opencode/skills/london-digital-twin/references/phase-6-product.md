# Phase 6 — Product layer

Delivered: Supabase Auth, profiles, favorites, per-line alert subscriptions,
browser notifications, read-only admin, printable/PDF report and ONS boroughs.
PTAL is intentionally not included (no validated layer).

## Migrations

- `20261110001100_phase6_users.sql` — `profiles`, `user_favorites`,
  `user_alert_subscriptions`, RLS, grants and the `on_auth_user_created` trigger.
- `20261110001200_phase6_boroughs.sql` — `ons-london-boroughs` row in
  `public.data_sources`.

## Auth

- Email/password via Supabase Auth. Local `supabase/config.toml` sets
  `site_url = http://localhost:5173`, `enable_signup = true` and
  `enable_confirmations = false` (no inbox needed).
- Production must set `site_url` and `additional_redirect_urls` to the deployed
  origin; configure SMTP if confirmations are enabled.
- `apps/web/src/lib/supabase.ts` uses `persistSession: true`,
  `autoRefreshToken: true`, `detectSessionInUrl: true`; it is `null` when
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are missing.
- `hooks/useAuthSync.ts` is mounted once in `AppShell`; it hydrates
  `store/authStore.ts` and listens to `onAuthStateChange`.
- `lib/auth.ts` wraps sign-in/sign-up/sign-out and translates common errors.
- `profiles` is created by the `on_auth_user_created` trigger. The trigger is
  security definer and revoked from public/anon/authenticated.
- `is_admin` is not writable by the public API. Promote with service_role:

```sql
update public.profiles set is_admin = true where email = 'user@example.com';
```

## User data and RLS

- `profiles`: `id` (= `auth.users.id`), `email`, `display_name`, `is_admin`,
  timestamps.
- `user_favorites`: `(user_id, entity_type in line|station, entity_id)`, PK on
  all three. RLS select/insert/delete use `auth.uid() = user_id`.
- `user_alert_subscriptions`: `(user_id, line_id)`, `min_band` in
  `attention|severe|closure`, `browser_notifications`. RLS select/insert/update/
  delete use `auth.uid() = user_id`.
- `profiles` RLS only exposes the current user's row.
- Probe semantics: with the anon key, `select` returns `200 []` because RLS
  filters every row; unauthenticated writes are rejected. An authenticated user
  sees only their own rows.
- Never query these tables with the service role from the browser.

## Frontend

- `/account`: login/register, favorites, line subscriptions, browser permission,
  sign out, admin link when `is_admin`. It shows a configuration empty state when
  Supabase env is missing.
- `FavoriteButton` in `LinePanel`/`StationPanel`; anonymous click goes to
  `/account`.
- `useBrowserAlerts` compares new disruption ids with subscriptions and calls the
  Notification API when permission is granted. No service worker/push.
- `/admin`: read-only sources/jobs/retention; requires `profiles.is_admin`.
  Non-admins see “Sem permissão”.
- `/report`: printable operational report (summary, line status, alerts, hourly
  history, health); the browser handles PDF. Print CSS is in `index.css`
  (`@media print` hides chrome and switches to a light palette; `.print-report`
  forces dark text).
- `/analytics` remains public; auth is required only for account features.

### File map

- `lib/supabase.ts`, `lib/auth.ts`
- `store/authStore.ts`, `hooks/useAuthSync.ts`, `hooks/useAuth.ts`
- `hooks/useAccount.ts`, `hooks/useBrowserAlerts.ts`
- `components/ui/FavoriteButton.tsx`
- `features/account/AccountPage.tsx`, `features/admin/AdminPage.tsx`,
  `features/report/ReportPage.tsx`
- `App.tsx` lazy routes, `components/layout/navigation.ts` nav/title entries,
  `components/layout/SideNav.tsx` badge.

## GIS boroughs

- `apps/web/public/london-boroughs.geojson`: 33 ONS Local Authority Districts
  (DEC 2025, generalised, `E09*`), OGL v3.0, ~257 KB.
- MapLibre source `boroughs`, layers `borough-fill`/`borough-line`, added before
  the network layers and hidden by default. Toggle “Boroughs (ONS)” in the CCO
  filter panel; `showBoroughs` lives in `uiStore`.
- Attribution is added via `AttributionControl.customAttribution`
  (“Boundaries © ONS, OGL v3.0”).
- PTAL is not present; do not add a placeholder or infer it.

## Global type scale

- `index.css` sets `html { font-size: 18px }`.
- Arbitrary text sizes are rem-based (`text-[0.625rem]`, etc.); do not reintroduce
  `text-[10px]`.
- Recharts tick font sizes were increased by 1px; MapLibre attribution is 11px.

## Validation

1. Sign up/sign in at `/account`; the profile row exists.
2. Favorites: insert/remove a line and a station; they persist after reload.
3. Subscriptions: add a line, change threshold, toggle browser notifications.
4. Admin: promote a profile with service_role; `/admin` shows sources/jobs;
   a non-admin sees “Sem permissão”.
5. Report: `/report` renders; `Page.printToPDF` produces a non-empty PDF
   (~158 KB in the local run).
6. Boroughs: toggle “Boroughs (ONS)” in the CCO; source has 33 features,
   `queryRenderedFeatures` returns boundary features and attribution includes
   ONS/OGL.
7. RLS probes with the anon key: `profiles`, `user_favorites` and
   `user_alert_subscriptions` return `200 []`; authenticated user sees only own.
8. Quality gate: `format:check`, `typecheck`, `lint`, `test` (59), `build`,
   `edge:build`.
