import { desc } from "drizzle-orm";
import { db } from "./db";
import { runHistory } from "@shared/schema";
import type { ValidationResult } from "@shared/schema";

export interface IStorage {
  saveRunHistory(result: ValidationResult): Promise<void>;
  getRunHistory(limit?: number): Promise<ValidationResult[]>;
}

export class DatabaseStorage implements IStorage {
  async saveRunHistory(result: ValidationResult): Promise<void> {
    await db.insert(runHistory).values({
      id: result.id,
      targetSunday: result.targetSunday,
      ranAt: new Date(result.ranAt),
      trigger: result.trigger,
      sections: result.sections,
      emailsSent: result.emailsSent,
      error: result.error ?? null,
    }).onConflictDoNothing();
  }

  async getRunHistory(limit: number = 10): Promise<ValidationResult[]> {
    const rows = await db
      .select()
      .from(runHistory)
      .orderBy(desc(runHistory.ranAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      targetSunday: row.targetSunday,
      ranAt: row.ranAt.toISOString(),
      trigger: row.trigger as ValidationResult["trigger"],
      sections: row.sections as ValidationResult["sections"],
      emailsSent: row.emailsSent as ValidationResult["emailsSent"],
      ...(row.error ? { error: row.error } : {}),
    }));
  }
}

export const storage = new DatabaseStorage();
