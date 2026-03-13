import type { Express } from "express";
import type { Server } from "http";
import { DOCUMENT_ID, SECTION_NAMES } from "@shared/schema";
import type { WeekData } from "@shared/schema";
import { parseSetlistForSunday, getAllSundays } from "./googleDocs";
import { runValidation, getRunHistory, getNextScheduledRun, getTargetSunday } from "./scheduler";
import { log } from "./index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post('/api/validate', async (_req, res) => {
    try {
      const result = await runValidation('manual');
      res.json(result);
    } catch (err: any) {
      log(`Manual validation error: ${err.message}`, 'routes');
      res.status(500).json({ message: err.message || 'Validation failed' });
    }
  });

  app.get('/api/history', (_req, res) => {
    const history = getRunHistory();
    res.json(history);
  });

  app.get('/api/schedule', (_req, res) => {
    const info = getNextScheduledRun();
    res.json(info);
  });

  app.get('/api/preview', async (_req, res) => {
    try {
      const targetSunday = getTargetSunday();
      const weekData = await parseSetlistForSunday(DOCUMENT_ID, targetSunday);
      const targetSundayStr = targetSunday.toISOString().split('T')[0];

      const finalWeekData: WeekData = weekData
        ? {
            ...weekData,
            sections: SECTION_NAMES.map((name) => {
              const existing = weekData.sections.find((s) => s.name === name);
              return existing || { name, leaderEmail: null, songs: [] };
            }),
          }
        : {
            sundayDate: targetSundayStr,
            rawHeader: '',
            sections: SECTION_NAMES.map((name) => ({
              name,
              leaderEmail: null,
              songs: [],
            })),
          };

      res.json({ targetSunday: targetSundayStr, weekData: finalWeekData });
    } catch (err: any) {
      log(`Preview error: ${err.message}`, 'routes');
      res.status(500).json({ message: err.message || 'Failed to preview setlist' });
    }
  });

  app.get('/api/sundays', async (_req, res) => {
    try {
      const sundays = await getAllSundays(DOCUMENT_ID);
      res.json(sundays);
    } catch (err: any) {
      log(`Sundays list error: ${err.message}`, 'routes');
      res.status(500).json({ message: err.message || 'Failed to list Sundays' });
    }
  });

  return httpServer;
}
