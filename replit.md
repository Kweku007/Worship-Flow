# Worship Flow

Setlist automation tool for church music directors. Reads song setlists from Google Docs, processes them through Vocal Extractor Pro, and emails the resulting MP3 files.

## Architecture

- **Frontend**: React + Vite + TanStack Query + Tailwind v4 + shadcn/ui
- **Backend**: Express.js API server
- **Integrations**: Google Docs (read setlists), Gmail (send MP3s)
- **External API**: Vocal Extractor Pro (https://vocal-extractor-pro.replit.app/)

## Key Files

- `server/googleDocs.ts` - Google Docs API client (Replit connector)
- `server/gmail.ts` - Gmail API client (Replit connector)
- `server/vocalExtractor.ts` - Vocal Extractor Pro API client
- `server/routes.ts` - API routes for parsing docs, processing songs, emailing
- `client/src/pages/dashboard.tsx` - Main dashboard UI
- `shared/schema.ts` - Zod validation schemas

## API Routes

- `POST /api/parse-doc` - Parse a Google Doc for song titles and YouTube links
- `GET /api/health/vocal-extractor` - Check if Vocal Extractor Pro is reachable
- `POST /api/process` - Start processing songs (background job)
- `GET /api/jobs/:jobId` - Get job status
- `GET /api/jobs` - List recent jobs

## Workflow

1. User pastes Google Doc URL → app parses it for songs + YouTube links
2. User sets target keys for each song
3. User enters email and clicks Process
4. Backend processes each song through Vocal Extractor Pro
5. Results are emailed via Gmail as MP3 attachments
