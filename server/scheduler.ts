import cron from 'node-cron';
import { DOCUMENT_ID } from '@shared/schema';
import type { ValidationResult } from '@shared/schema';
import { parseSetlistForSunday } from './googleDocs';
import { validateSections, sendValidationEmails } from './validator';
import { log } from './index';

const CT_OFFSET_HOURS = 5;
const CT_9AM_UTC = 9 + CT_OFFSET_HOURS;
const CT_5PM_UTC = 17 + CT_OFFSET_HOURS;

const runHistory: ValidationResult[] = [];
const MAX_HISTORY = 50;

export function getTargetSunday(fromDate: Date = new Date()): Date {
  const day = fromDate.getUTCDay();
  let daysUntilNextSunday: number;

  if (day === 0) {
    daysUntilNextSunday = 14;
  } else {
    daysUntilNextSunday = 7 - day;
    daysUntilNextSunday += 7;
  }

  const target = new Date(fromDate);
  target.setUTCDate(target.getUTCDate() + daysUntilNextSunday);
  target.setUTCHours(0, 0, 0, 0);
  return target;
}

export async function runValidation(trigger: 'scheduled' | 'manual' = 'manual'): Promise<ValidationResult> {
  const targetSunday = getTargetSunday();
  const targetDateStr = targetSunday.toISOString().split('T')[0];
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  log(`Starting validation for Sunday ${targetDateStr} (trigger: ${trigger})`, 'scheduler');

  const result: ValidationResult = {
    id: runId,
    targetSunday: targetDateStr,
    ranAt: new Date().toISOString(),
    trigger,
    sections: [],
    emailsSent: [],
  };

  try {
    const weekData = await parseSetlistForSunday(DOCUMENT_ID, targetSunday);

    if (!weekData) {
      result.error = `No section found in the document for Sunday ${targetDateStr}`;
      log(result.error, 'scheduler');
      addToHistory(result);
      return result;
    }

    result.sections = validateSections(weekData);
    result.emailsSent = await sendValidationEmails(result.sections, targetDateStr);

    const complete = result.sections.filter((s) => s.status === 'complete').length;
    const total = result.sections.length;
    log(`Validation complete: ${complete}/${total} sections ready for ${targetDateStr}`, 'scheduler');
  } catch (err: any) {
    result.error = err.message || 'Unknown error during validation';
    log(`Validation failed: ${result.error}`, 'scheduler');
  }

  addToHistory(result);
  return result;
}

function addToHistory(result: ValidationResult) {
  runHistory.unshift(result);
  if (runHistory.length > MAX_HISTORY) {
    runHistory.length = MAX_HISTORY;
  }
}

export function getRunHistory(): ValidationResult[] {
  return runHistory;
}

function nowInCT(): { day: number; hour: number } {
  const now = new Date();
  const ctMs = now.getTime() - CT_OFFSET_HOURS * 60 * 60 * 1000;
  const ctDate = new Date(ctMs);
  return { day: ctDate.getUTCDay(), hour: ctDate.getUTCHours() };
}

export function getNextScheduledRun(): { nextRunAt: string; targetSunday: string } {
  const now = new Date();
  const ct = nowInCT();

  let daysUntilTuesday = (2 - ct.day + 7) % 7;

  if (daysUntilTuesday === 0) {
    if (ct.hour >= 17) {
      daysUntilTuesday = 7;
    }
  }

  const nextTuesday = new Date(now);
  nextTuesday.setUTCDate(nextTuesday.getUTCDate() + daysUntilTuesday);

  if (daysUntilTuesday === 0 && ct.hour < 9) {
    nextTuesday.setUTCHours(CT_9AM_UTC, 0, 0, 0);
  } else if (daysUntilTuesday === 0 && ct.hour < 17) {
    nextTuesday.setUTCHours(CT_5PM_UTC, 0, 0, 0);
  } else {
    nextTuesday.setUTCHours(CT_9AM_UTC, 0, 0, 0);
  }

  const target = getTargetSunday(nextTuesday);

  return {
    nextRunAt: nextTuesday.toISOString(),
    targetSunday: target.toISOString().split('T')[0],
  };
}

export function startScheduler() {
  cron.schedule(`0 ${CT_9AM_UTC},${CT_5PM_UTC} * * 2`, async () => {
    log('Scheduled validation triggered (Tuesday cron)', 'scheduler');
    try {
      await runValidation('scheduled');
    } catch (err: any) {
      log(`Scheduled validation error: ${err.message}`, 'scheduler');
    }
  });

  log('Scheduler started: Tuesdays at 9:00 AM and 5:00 PM CT', 'scheduler');
}
