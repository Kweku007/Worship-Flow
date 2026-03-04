import type { Express } from "express";
import { createServer, type Server } from "http";
import { extractDocumentId, parseSetlistFromDoc } from "./googleDocs";
import { sendEmailWithAttachments } from "./gmail";
import { processYoutubeUrl, checkVocalExtractorHealth, type ProcessingResult } from "./vocalExtractor";
import { parseDocRequestSchema, processRequestSchema } from "@shared/schema";
import { log } from "./index";
import { fromError } from "zod-validation-error";

interface ProcessingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  songs: Array<{
    title: string;
    youtubeUrl: string | null;
    targetKey?: string;
    status: 'pending' | 'processing' | 'success' | 'error' | 'skipped';
    error?: string;
  }>;
  emailTo: string;
  weekLabel: string;
  startedAt: string;
  completedAt?: string;
  totalProcessed: number;
  totalSuccess: number;
  totalErrors: number;
}

const jobs = new Map<string, ProcessingJob>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post('/api/parse-doc', async (req, res) => {
    try {
      const parsed = parseDocRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: fromError(parsed.error).toString() });
      }

      const documentId = extractDocumentId(parsed.data.docUrl);
      const songs = await parseSetlistFromDoc(documentId);

      res.json({ songs, documentId });
    } catch (err: any) {
      log(`Error parsing doc: ${err.message}`, 'google-docs');
      const isUserError = err.message?.includes('Could not extract') || err.message?.includes('not found');
      const status = isUserError ? 400 : 500;
      res.status(status).json({ message: err.message || 'Failed to parse Google Doc' });
    }
  });

  app.get('/api/health/vocal-extractor', async (_req, res) => {
    const healthy = await checkVocalExtractorHealth();
    res.json({ healthy });
  });

  app.post('/api/process', async (req, res) => {
    try {
      const parsed = processRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: fromError(parsed.error).toString() });
      }

      const { songs: songInputs, emailTo, weekLabel } = parsed.data;

      const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

      const job: ProcessingJob = {
        id: jobId,
        status: 'pending',
        songs: songInputs.map((s) => ({
          title: s.title,
          youtubeUrl: s.youtubeUrl || null,
          targetKey: s.targetKey,
          status: s.youtubeUrl ? 'pending' as const : 'skipped' as const,
          error: s.youtubeUrl ? undefined : 'No YouTube URL provided',
        })),
        emailTo,
        weekLabel: weekLabel || 'This Week',
        startedAt: new Date().toISOString(),
        totalProcessed: 0,
        totalSuccess: 0,
        totalErrors: 0,
      };

      jobs.set(jobId, job);

      res.json({ jobId, status: 'pending' });

      processJobInBackground(job).catch((err) => {
        log(`Background job ${jobId} failed: ${err.message}`, 'processor');
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Failed to start processing' });
    }
  });

  app.get('/api/jobs/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.json(job);
  });

  app.get('/api/jobs', (_req, res) => {
    const allJobs = Array.from(jobs.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 20);
    res.json(allJobs);
  });

  return httpServer;
}

async function processJobInBackground(job: ProcessingJob) {
  job.status = 'processing';
  const results: ProcessingResult[] = [];

  for (const song of job.songs) {
    if (song.status === 'skipped') {
      job.totalProcessed++;
      continue;
    }

    song.status = 'processing';
    log(`Processing: ${song.title}`, 'processor');

    const result = await processYoutubeUrl(
      song.youtubeUrl!,
      song.title,
      song.targetKey
    );

    if (result.status === 'success') {
      song.status = 'success';
      job.totalSuccess++;
      results.push(result);
    } else {
      song.status = 'error';
      song.error = result.error;
      job.totalErrors++;
    }
    job.totalProcessed++;
  }

  if (results.length > 0) {
    try {
      const attachments = results
        .filter((r) => r.mp3Buffer)
        .map((r) => ({
          filename: r.filename || `${r.songTitle}.mp3`,
          mimeType: 'audio/mpeg',
          content: r.mp3Buffer!,
        }));

      const songList = job.songs
        .map((s) => {
          const keyInfo = s.targetKey ? ` (Key: ${s.targetKey})` : '';
          const statusIcon = s.status === 'success' ? '✓' : s.status === 'skipped' ? '—' : '✗';
          return `${statusIcon} ${s.title}${keyInfo}`;
        })
        .join('<br>');

      const bodyHtml = `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2>🎵 Worship Setlist — ${job.weekLabel}</h2>
          <p>Your processed tracks are attached.</p>
          <h3>Setlist:</h3>
          <p>${songList}</p>
          <p style="color: #666; font-size: 12px; margin-top: 24px;">
            ${job.totalSuccess} tracks processed successfully.
            ${job.totalErrors > 0 ? `${job.totalErrors} had errors.` : ''}
          </p>
        </div>
      `;

      await sendEmailWithAttachments(
        job.emailTo,
        `🎵 Worship Tracks — ${job.weekLabel}`,
        bodyHtml,
        attachments
      );

      log(`Email sent to ${job.emailTo} with ${attachments.length} tracks`, 'gmail');
    } catch (err: any) {
      log(`Failed to send email: ${err.message}`, 'gmail');
      job.status = 'error';
      return;
    }
  }

  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  log(`Job ${job.id} completed: ${job.totalSuccess} success, ${job.totalErrors} errors`, 'processor');
}
