# Paintball team app

A team app for paintball squads, built to replace PlayerPlus (attendance) and later Tricount (event cost splitting), with point logging and stats after that.

It is an installable web app (PWA): players open a link and choose "Add to Home Screen". It runs on [Supabase](https://supabase.com) (database, sign-in) and works in English and German.

## What's in step 1: attendance

- Sign in with an email link or the 6-digit code from the email (no passwords).
- Create a team or join one with an invite code or link.
- Events: practices, tournaments, meetings. Recurring practices (e.g. every Sunday, or every 2nd Tue + Thu) are generated 12 weeks ahead and extended nightly.
- One-tap answers: Going, Late, Maybe, Out, plus a comment. Optional lock time ("answers close 24 h before").
- Line counting per event: "7 confirmed with 5 per side = 1 line + 2 subs". Players per side, league (ICS, NXL, ALPS…), format and roster limit are set per event.
- Absences (holiday, injury, sick, work): automatically answer "Out" for every event in that period.
- Roles: owner, coach, player. Coaches and owners create events and can answer for anyone.
- Every table is protected by row-level security: people only see teams they belong to.

Push reminders come in the next step.

## Setting it up

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run the files in `supabase/migrations/` in order (or use `supabase db push` with the Supabase CLI).
3. In **Authentication → Email Templates → Magic Link**, add `{{ .Token }}` to the email so it also contains the 6-digit code. Players who installed the app type the code, because tapping a link on iPhone opens Safari instead of the app.
4. In **Authentication → URL Configuration**, set the Site URL to where the app is hosted.
5. Copy `.env.example` to `.env` and fill in the project URL and anon key from **Project Settings → API**.
6. `npm install`, then `npm run dev` to try it locally, or `npm run build` and host the `dist` folder (Netlify, Vercel and Cloudflare Pages all work for free).

## Development

- `npm run dev` starts the app.
- `npm test` runs the unit tests (line counting, time zones, translations).
- `npm run test:db` runs the database and security tests against a local Postgres (set `PGHOST`, `PGPORT`, `PGUSER`).

### Adding a language

Copy `src/i18n/locales/en.json` to e.g. `pl.json`, translate the values and add it to `LANGUAGES` in `src/i18n/index.ts`. A test checks every language has the same keys as English.
