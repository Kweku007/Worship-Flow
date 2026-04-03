import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { DOCUMENT_ID, schedulerState } from '@shared/schema';
import type { ValidationResult, ServiceResult } from '@shared/schema';
import { getServicesForWeek } from './googleDocs';
import { validateSections, sendValidationEmails } from './validator';
import { log } from './index';
import { db } from './db';
import { storage } from './storage';

const CT_OFFSET_HOURS = 5;
const CT_9AM_UTC = 9 + CT_OFFSET_HOURS;
const CT_5PM_UTC = 17 + CT_OFFSET_HOURS;

const SCHEDULED_HOURS_UTC = [CT_9AM_UTC, CT_5PM_UTC];

const STATE_KEY = 'last_scheduled_run';

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

  log(`Starting validation for week of Sunday ${targetDateStr} (trigger: ${trigger})`, 'scheduler');

  const result: ValidationResult = {
    id: runId,
    targetSunday: targetDateStr,
    ranAt: new Date().toISOString(),
    trigger,
    services: [],
    emailsSent: [],
  };

  try {
    const weekServices = await getServicesForWeek(DOCUMENT_ID, targetSunday);

    if (weekServices.length === 0) {
      result.error = `No service sections found in the document for the week of Sunday ${targetDateStr}`;
      log(result.error, 'scheduler');
      await storage.saveRunHistory(result);
      return result;
    }

    const allEmailsSent: typeof result.emailsSent = [];

    for (const weekData of weekServices) {
      const serviceDate = weekData.serviceDate;
      const sections = validateSections(weekData);

      const complete = sections.filter((s) => s.status === 'complete').length;
      const total = sections.length;

      let serviceEmails: typeof result.emailsSent = [];

      if (complete === total && trigger === 'scheduled') {
        log(`All ${total} sections complete for ${serviceDate} - skipping emails`, 'scheduler');
      } else {
        serviceEmails = await sendValidationEmails(sections, serviceDate);
        allEmailsSent.push(...serviceEmails);
      }

      const serviceResult: ServiceResult = {
        serviceDate,
        rawHeader: weekData.rawHeader,
        sections,
        emailsSent: serviceEmails,
      };

      result.services.push(serviceResult);
      log(`Validated ${serviceDate}: ${complete}/${total} sections ready`, 'scheduler');
    }

    result.emailsSent = allEmailsSent;

    const totalComplete = result.services.reduce((sum, s) => sum + s.sections.filter((sec) => sec.status === 'complete').length, 0);
    const totalSections = result.services.reduce((sum, s) => sum + s.sections.length, 0);
    log(`Validation complete: ${totalComplete}/${totalSections} sections ready across ${result.services.length} service(s)`, 'scheduler');
  } catch (err: any) {
    result.error = err.message || 'Unknown error during validation';
    log(`Validation failed: ${result.error}`, 'scheduler');
  }

  await storage.saveRunHistory(result);
  return result;
}

function toCtComponents(utcDate: Date): { year: number; month: number; day: number; weekday: number; hour: number } {
  const ctMs = utcDate.getTime() - CT_OFFSET_HOURS * 60 * 60 * 1000;
  const ctDate = new Date(ctMs);
  return {
    year: ctDate.getUTCFullYear(),
    month: ctDate.getUTCMonth(),
    day: ctDate.getUTCDate(),
    weekday: ctDate.getUTCDay(),
    hour: ctDate.getUTCHours(),
  };
}

function ctComponentsToUtc(year: number, month: number, day: number, hour: number): Date {
  return new Date(Date.UTC(year, month, day, hour + CT_OFFSET_HOURS, 0, 0, 0));
}

export function getNextScheduledRun(): { nextRunAt: string; targetSunday: string } {
  const now = new Date();
  const ct = toCtComponents(now);

  let daysAhead = 0;
  let nextHourCT = 9;

  if (ct.weekday === 0) {
    daysAhead = 1;
    nextHourCT = 9;
  } else if (ct.weekday >= 1 && ct.weekday <= 6) {
    if (ct.hour >= 17) {
      if (ct.weekday === 6) {
        daysAhead = 2;
      } else {
        daysAhead = 1;
      }
      nextHourCT = 9;
    } else if (ct.hour >= 9) {
      nextHourCT = 17;
    } else {
      nextHourCT = 9;
    }
  }

  const nextDay = ct.day + daysAhead;
  const nextRunUtc = ctComponentsToUtc(ct.year, ct.month, nextDay, nextHourCT);

  const target = getTargetSunday(nextRunUtc);

  return {
    nextRunAt: nextRunUtc.toISOString(),
    targetSunday: target.toISOString().split('T')[0],
  };
}

async function getLastScheduledRun(): Promise<Date | null> {
  try {
    const rows = await db.select().from(schedulerState).where(eq(schedulerState.key, STATE_KEY));
    if (rows.length > 0) {
      return rows[0].lastRunAt;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveLastScheduledRun(time: Date): Promise<void> {
  try {
    await db
      .insert(schedulerState)
      .values({ key: STATE_KEY, lastRunAt: time })
      .onConflictDoUpdate({
        target: schedulerState.key,
        set: { lastRunAt: time },
      });
  } catch (err: any) {
    log(`Failed to save scheduler state: ${err.message}`, 'scheduler');
  }
}

function getMostRecentScheduledSlot(now: Date): Date | null {
  const ct = toCtComponents(now);

  if (ct.weekday === 0) {
    return null;
  }

  if (ct.weekday >= 1 && ct.weekday <= 6) {
    if (ct.hour >= 17) {
      return ctComponentsToUtc(ct.year, ct.month, ct.day, 17);
    } else if (ct.hour >= 9) {
      return ctComponentsToUtc(ct.year, ct.month, ct.day, 9);
    }
  }

  return null;
}

async function checkAndRunMissedJobs(): Promise<void> {
  const now = new Date();
  const mostRecentSlot = getMostRecentScheduledSlot(now);

  if (!mostRecentSlot) {
    log('No scheduled slot to catch up on right now (Sunday or before 9 AM CT)', 'scheduler');
    return;
  }

  const lastRun = await getLastScheduledRun();

  if (lastRun && lastRun >= mostRecentSlot) {
    log(`Already ran for the ${mostRecentSlot.toISOString()} slot — no catch-up needed`, 'scheduler');
    return;
  }

  log(`Missed scheduled run at ${mostRecentSlot.toISOString()} — running catch-up now`, 'scheduler');

  try {
    await runValidation('scheduled');
    await saveLastScheduledRun(now);
    log('Catch-up validation complete', 'scheduler');
  } catch (err: any) {
    log(`Catch-up validation error: ${err.message}`, 'scheduler');
  }
}

export async function startScheduler() {
  cron.schedule(`0 ${CT_9AM_UTC},${CT_5PM_UTC} * * 1-6`, async () => {
    log('Scheduled validation triggered (Mon-Sat cron)', 'scheduler');
    try {
      await runValidation('scheduled');
      await saveLastScheduledRun(new Date());
    } catch (err: any) {
      log(`Scheduled validation error: ${err.message}`, 'scheduler');
    }
  });

  log('Scheduler started: Mon-Sat at 9:00 AM and 5:00 PM CT (stops when all sections complete)', 'scheduler');

  await checkAndRunMissedJobs();
}
