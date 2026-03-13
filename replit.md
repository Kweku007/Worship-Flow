# Worship Flow

Automated setlist validation and email reminder system for church worship teams. Reads a Google Doc containing worship setlists, validates that section leaders have submitted their songs and YouTube links, and sends email reminders when things are missing.

## Architecture

- **Frontend**: React + Vite + TanStack Query + Tailwind v4 + shadcn/ui
- **Backend**: Express.js API server
- **Integrations**: Google Docs (read setlists), Gmail (send reminders)
- **Scheduler**: node-cron for automated Tuesday checks (9 AM & 5 PM)

## Key Files

- `server/googleDocs.ts` - Google Docs API client; parses setlist document by Sunday date, extracting sections, leader emails, and songs with YouTube links
- `server/gmail.ts` - Gmail API client (Replit connector); sends plain HTML emails
- `server/validator.ts` - Validation engine; checks sections for missing leaders, songs, or YouTube links; sends appropriate notification emails
- `server/scheduler.ts` - Cron scheduler; runs validation every Tuesday at 9 AM and 5 PM targeting the Sunday ~12 days out; stores run history in memory
- `server/routes.ts` - API routes for manual validation, history, schedule info, and setlist preview
- `client/src/pages/dashboard.tsx` - Main dashboard UI showing schedule, preview, validation results, and run history
- `shared/schema.ts` - TypeScript types and constants (doc ID, admin email, section names)

## API Routes

- `POST /api/validate` - Manually trigger a validation run
- `GET /api/history` - Get validation run history
- `GET /api/schedule` - Get next scheduled run info
- `GET /api/preview` - Preview the current target Sunday's setlist data
- `GET /api/sundays` - List all Sunday dates found in the document

## Configuration

- **Google Doc ID**: `1SD2t9J7jYZUnN9QDOr2TWgtfkEkOfe4yuxYYb1_WwLY` (hardcoded in `shared/schema.ts`)
- **Admin Email**: `hello@kwekuaboagye.me` (receives alerts when leaders are missing)
- **Schedule**: Every Tuesday at 9:00 AM and 5:00 PM
- **Target Sunday**: The Sunday ~12 days out from the Tuesday check (skips the immediately upcoming Sunday)

## Document Structure Expected

The Google Doc should be organized as:
1. **Sunday date headers** (e.g., "March 29, 2026") — identified as headings or date-containing text
2. **Section labels** under each date: "Call to Worship", "Worship", "Praise"
3. **Leader email** — first line after each section label
4. **Songs** — subsequent lines, optionally with YouTube links (inline or hyperlinked)
