import cron from 'node-cron';
import { DOCUMENT_ID } from '@shared/schema';
import type { ValidationResult } from '@shared/schema';
import { parseSetlistForSunday } from './googleDocs';
import { validateSections, sendValidationEmails } from './validator';
import { log } from './index';

const runHistory: ValidationResult[] = [];
const MAX_HISTORY = 50;

export function getTargetSunday(fromDate: Date = new Date()): Date {
  const day = fromDate.getDay();
  let daysUntilNextSunday: number;

  if (day === 0) {
    daysUntilNextSunday = 14;
  } else {
    daysUntilNextSunday = 7 - day;
    daysUntilNextSunday += 7;
  }

  const target = new Date(fromDate);
  target.setDate(target.getDate() + daysUntilNextSunday);
  target.setHours(0, 0, 0, 0);
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

export function getNextScheduledRun(): { nextRunAt: string; targetSunday: string } {
  const now = new Date();
  const day = now.getDay();
  let daysUntilTuesday = (2 - day + 7) % 7;
  if (daysUntilTuesday === 0) {
    const hour = now.getHours();
    if (hour >= 17) {
      daysUntilTuesday = 7;
    }
  }

  const nextTuesday = new Date(now);
  nextTuesday.setDate(nextTuesday.getDate() + daysUntilTuesday);

  if (daysUntilTuesday === 0 && now.getHours() < 9) {
    nextTuesday.setHours(9, 0, 0, 0);
  } else if (daysUntilTuesday === 0 && now.getHours() < 17) {
    nextTuesday.setHours(17, 0, 0, 0);
  } else {
    nextTuesday.setHours(9, 0, 0, 0);
  }

  const target = getTargetSunday(nextTuesday);

  return {
    nextRunAt: nextTuesday.toISOString(),
    targetSunday: target.toISOString().split('T')[0],
  };
}

export function startScheduler() {
  cron.schedule('0 9,17 * * 2', async () => {
    log('Scheduled validation triggered (Tuesday cron)', 'scheduler');
    try {
      await runValidation('scheduled');
    } catch (err: any) {
      log(`Scheduled validation error: ${err.message}`, 'scheduler');
    }
  });

  log('Scheduler started: Tuesdays at 9:00 AM and 5:00 PM', 'scheduler');
}
