# Worship Flow

Automated setlist validation and email reminder system for church worship teams. Reads a Google Doc containing worship setlists, validates that section leaders have submitted their songs and YouTube links, and sends email reminders when anything is missing.

## What it does

Each week, the app checks a shared Google Doc for the upcoming Sunday's worship setlist. It looks at three sections — **Call to Worship**, **Worship**, and **Praise** — and verifies:

- A leader has been assigned to each section
- Songs have been listed
- Every song has a YouTube link

Based on the results it either:
- Sends a reminder email to each section leader with a list of missing links
- Sends an alert to the admin if a section has no leader assigned at all
- Skips emails entirely if all sections are fully complete

The app also includes a dashboard for previewing the current setlist, manually triggering a validation run, and viewing the history of past runs.

## Schedule

The validator runs automatically **Monday through Saturday at 9:00 AM and 5:00 PM CT**, targeting the Sunday of the following week. If the server restarts and misses a scheduled run, it catches up automatically on the next startup.

## Tech stack

- **Frontend** — React, Vite, TanStack Query, Tailwind CSS v4, shadcn/ui
- **Backend** — Node.js, Express
- **Database** — PostgreSQL with Drizzle ORM (stores run history and scheduler state)
- **Integrations** — Google Docs API (read setlists), Gmail API (send reminders)
- **Scheduler** — node-cron with database-backed catch-up logic

## Project structure

```
client/           React frontend
server/
  googleDocs.ts   Parses the setlist Google Doc
  validator.ts    Validates sections and builds email content
  gmail.ts        Sends emails via Gmail API
  scheduler.ts    Cron scheduler with startup catch-up logic
  routes.ts       Express API routes
  storage.ts      Database access layer
  db.ts           PostgreSQL connection
shared/
  schema.ts       Shared types and database schema
```

## API

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/preview` | Preview the current target week's setlist |
| `GET` | `/api/history` | Recent validation run history |
| `GET` | `/api/schedule` | Next scheduled run time |
| `POST` | `/api/validate` | Manually trigger a validation run (requires `ADMIN_PIN`) |
| `GET` | `/api/sundays` | All Sunday dates found in the document |

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_PIN` | PIN required to trigger manual validation from the dashboard |

Google Docs and Gmail credentials are managed through Replit's integration connectors.

## Google Doc format

The app expects the setlist document to be structured like this:

```
Sunday 4/12/26

Call to Worship
leader@email.com
Song Title https://youtube.com/...
Another Song https://youtube.com/...

Worship
leader@email.com
Song Title https://youtube.com/...

Praise
leader@email.com
Song Title https://youtube.com/...
```

Each Sunday block is identified by a dated heading. Sections are identified by their exact names: `Call to Worship`, `Worship`, and `Praise`.
