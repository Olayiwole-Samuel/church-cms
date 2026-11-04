# The Triumphant Family: Church CMS

For The Gleam of Salvation Apostolic Ministry. A custom church management system for one central admin: attendance per program, engagement
tracking, an Altar Call track, Discipleship Academy eligibility, departments with a reversible
Waiting Corner, mandatory service reviews, QR self-check-in, follow-ups, absence alerts, reports,
exports and an audit log.

Built with Next.js (App Router, TypeScript), PostgreSQL 15 or newer, and plain SQL migrations.
It is mobile-first and installable as a PWA.

The interface follows the current iOS design language (Liquid Glass): a floating glass tab bar, large
titles that collapse into a glass navigation bar, inset grouped lists, switches, segmented controls,
and iOS alerts and sheets. Light and dark mode follow the device by default, and More > Appearance (the
sidebar on wider screens) sets Automatic, Light or Dark for that device. Phones get the tab bar and lists,
tablets a floating icon rail with aligned tables, and desktops a sectioned sidebar, a fuller dashboard and
two-column detail pages. It is a website, so a few things differ from a native
app. San Francisco, the iOS font, appears on Apple devices, and other devices use their own system font.
Icons are original, because SF Symbols are licensed for Apple-platform apps. Glass uses a browser blur
rather than Apple's light refraction. Add it to the iPhone home screen for a full-screen experience.

To change the logo, replace `assets/logo-original.png` and run `node scripts/make-icons.mjs`. The app's
tint colour is `--accent` in `src/app/globals.css`, set separately for light and dark mode.

## Run it locally

You need Node 20 or newer. You do not need Docker or a Postgres install.

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`, then fill in `AUTH_SECRET`, `CRON_SECRET` and `ADMIN_PASSWORD`
   (at least 10 characters). This generates a secret:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

3. In its own terminal, start the bundled local Postgres. Leave it running.

   ```bash
   npm run db:local
   ```

4. Create the tables, the admin login, and the sample programs and departments.

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run db:seed
   ```

   To also add 12 sample people with attendance history, use `node scripts/seed.mjs --demo` instead.
   Then run the daily job (see below) so statuses are computed.

5. Start the app and open http://localhost:3000.

   ```bash
   npm run dev
   ```

To test QR check-in from a phone, set `APP_URL` to your computer's network address, or use the
deployed site.

## Tests

```bash
npm test
```

This runs the rule unit tests and the integration tests. The integration tests start their own
throwaway Postgres and apply the real migrations, so they need no setup.

## Deploy (Vercel with Supabase or Neon)

1. Create a Postgres database on Supabase or Neon (version 15 or newer). Note two connection
   strings: the pooled one for the app, and the direct one for migrations and backups.
2. `vercel.json` applies migrations and the seed on every production deploy, so nothing needs running by
   hand. To change the admin password, change `ADMIN_PASSWORD` in Vercel and redeploy. The seed adds sample
   programs and departments only when those tables are empty.
3. Import this GitHub repository into Vercel. The repository is public, so keep every secret in Vercel
   and GitHub settings, and never in the code.
4. In Vercel, set these environment variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The pooled connection string |
   | `ADMIN_EMAIL` | The admin's sign-in email |
   | `ADMIN_PASSWORD` | At least 10 characters |
   | `AUTH_SECRET` | A long random string |
   | `CRON_SECRET` | A long random string |
   | `APP_URL` | Your final public address, such as `https://cms.yourchurch.org` |
   | `CHURCH_TIMEZONE` | Your IANA timezone, such as `Africa/Lagos` |
   | `NEXT_PUBLIC_CHURCH_NAME` | `The Triumphant Family` |

5. Deploy. `vercel.json` schedules the daily job for 01:00 UTC. Pick a time after your last service
   of the day has ended in your timezone, and change the schedule if needed.

**Set `APP_URL` to the final address before printing any QR code.** The codes are permanent and
contain this address, so moving to another domain later means reprinting them.

## Backups

`.github/workflows/backup.yml` runs `pg_dump` every day at 02:00 UTC, encrypts the dump with AES-256,
uploads it to private S3-compatible storage such as Cloudflare R2 or Backblaze B2, and deletes backups
older than 35 days. This repository is public, so never store backups as workflow artifacts or commit
them: anyone on GitHub could download them.

To turn it on:

1. Create a **private** bucket, and an access key limited to that bucket.
2. Add these repository secrets in GitHub: `DATABASE_URL` (the **direct** connection string),
   `BACKUP_PASSPHRASE`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID` and
   `BACKUP_S3_SECRET_ACCESS_KEY`.
3. Use a long random passphrase, and keep a copy somewhere safe outside GitHub, because a backup cannot
   be read without it.
4. Trigger the workflow once by hand from the Actions tab, and confirm the file appears in the bucket.

Until the secrets are set, the daily run fails and GitHub emails you, because no backup is being taken.
GitHub pauses scheduled workflows on repositories with 60 days of no activity, and will email you first.

To restore, download the file from your bucket, then:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -in church-cms-YYYY-MM-DD.dump.enc -out restore.dump
```

```bash
pg_restore --clean --if-exists --no-owner --disable-triggers -d "$DATABASE_URL" restore.dump
```

Practise a restore on a spare database before you rely on it.

## The daily job

`GET /api/cron/daily` with the header `Authorization: Bearer <CRON_SECRET>`. Vercel Cron calls it
automatically. It:

- marks department members with no scan on past services as missed, and applies the Waiting Corner rule
- refreshes every streak and status, including those that change with time alone (Never Returned, Dropped Off)
- raises follow-ups and absence alerts
- creates any missing pending reviews

It is safe to run repeatedly. To run it locally:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/daily
```

## Running a service

1. Create the session for the day: on the program's page, or with **Start today's session** on Take
   Attendance. **QR check-in only works once today's session exists.** A scan never creates a session,
   so a code scanned at home on a Tuesday cannot create a false service.
2. People scan the program QR. New devices register once, and returning devices get one tap.
3. Mark altar call on Take Attendance. It is never self-selected.
4. Department members scan their department QR.
5. Submit a review for each department under Service Reviews.

## How rules were interpreted

Everything in the specification is implemented as written. Where it left a detail open, this is what
the system does. Each one is a place to check against what you intended.

| Topic | Behaviour |
|---|---|
| General streak | The specified per-program streak is kept. The locked "special programs count toward general streak" is a second streak over every counting program as one sequence. **Missing any counting session breaks it**, so someone who comes every Sunday but never midweek has a low general streak while being Consistent on Sunday Service. Engagement therefore opens on the Sunday program, with General one click away. Untick "counts toward streak" on a program to take it out of the general streak. |
| What counts as a miss | A past session with no record, or a recorded absence. Today's session with no record is not yet a miss. |
| Thresholds | First Timer window 30 days, first-timer follow-up after 7 days, Dropped Off after 4 straight misses (so that 2 to 3 is an absence). All are environment variables. |
| "Church service" for departments | **Every session of every program.** Each one needs a department scan and a review, including special programs. Archive a session to take it out. |
| Several services on one day | The department QR asks which service. For Academy, two Sunday programs on one date are one Sunday, and attending either counts. |
| Academy readiness | Once reached, it stays until Enroll, even if the person later misses. Sunday programs only accept sessions dated on a Sunday. Sundays with no session are skipped, not counted as missed. |
| Marking present after a miss | The counter resets, but someone already in the Waiting Corner stays there until you press Restore. |
| Moving departments | Admin only, and not while someone is in the Waiting Corner. The old membership is kept as history. After permanent removal, an admin can place the person in a different department but never back in the same one, and they cannot self-join. |
| Who needs a review note | Everyone who was a member on the date of that service and is not archived. Summary is required; challenges and highlights are optional. |
| Self-registration phone | Required, alongside name, because duplicate detection depends on it. Email is optional. |
| Duplicates | Same phone and same name links to the existing person. Same phone or same name alone creates a new person and flags the pair on the People page, since it may be a relative or a namesake. Merging is v1.5. |
| Rate limit | 300 requests a minute per IP address, set high because a whole congregation may share church Wi-Fi. Change with `CHECKIN_RATE_LIMIT_PER_MINUTE`. |

Additions to the listed data model, all needed to make a specified behaviour work: `admins`,
`device_tokens`, `possible_duplicates`, `rate_limits`, the three cache tables, and `archived_at`,
`removed_at`, `notes` and `created_at` columns for archiving and ordering.

## Monthly Report

Reports > Monthly report counts the people present at each service. Services are never added together: if
24 came to one service and 20 to the next, the report shows 24 and 20, not 44. To say whether a month went
up or down, it compares the average per service with the month before, so a month with more services does
not look bigger. It also lists every service, a 12-month trend, a filter for one program, and CSV or Excel
download. It opens on the last complete month, and the current month is labelled as still running.

## People who stop coming

Anyone who missed the latest service of every program they attend gets a card in Follow-Ups, after one
miss, and it stays open for as long as they are away. A Sunday regular is not flagged for skipping midweek.
The card closes by itself when they return, and returns if they stop again. The only action on it is Remove,
which archives the person after a confirmation. Their history is kept, and they can be restored from People.
A person keeps one card, relabelled Not coming, First timer or Dropped off. Altar-call follow-ups are separate
and are marked done by hand.

## Good to know

- **API paths** follow the outline in the specification with an `/api` prefix, because the screens use
  the same paths (`/people` is a page, `/api/people` its API). Public pages are `/checkin/:token` and
  `/checkin/dept/:token`. Additional routes cover things the screens need: `/api/sessions/:id`,
  `/api/departments/:id/close-out`, `/api/departments/:id/members`, `/api/auth/logout`,
  `/api/people/duplicates`.
- **Audit log:** a database trigger records every insert and update on the main tables, so no code path
  can skip it. The log itself is append-only, and hard deletes are refused by the database.
- **Caches:** `person_program_stats`, `person_department_stats` and `person_academy_stats` are always
  rebuilt from attendance and are never the source of truth.
- **Changing the admin password:** change `ADMIN_PASSWORD` and run `npm run db:seed` again.
- **Device tokens** are cookies on the phone. Clearing browser data means registering again. A phone
  belongs to one person until household check-in arrives in v1.5, and "Not you?" switches person.
