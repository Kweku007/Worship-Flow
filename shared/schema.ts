import { z } from "zod";
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const DOCUMENT_ID = "1SD2t9J7jYZUnN9QDOr2TWgtfkEkOfe4yuxYYb1_WwLY";
export const ADMIN_EMAIL = "hello@kwekuaboagye.me";

export const schedulerState = pgTable("scheduler_state", {
  key: text("key").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
});

export const SECTION_NAMES = ["Call to Worship", "Worship", "Praise"] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

export interface SongEntry {
  title: string;
  youtubeUrl: string | null;
}

export interface SectionData {
  name: SectionName;
  leaderEmail: string | null;
  songs: SongEntry[];
}

export interface WeekData {
  serviceDate: string;
  rawHeader: string;
  sections: SectionData[];
}

export type SectionStatus = "complete" | "missing_songs" | "missing_links" | "missing_leader";

export interface SectionValidation {
  sectionName: SectionName;
  leaderEmail: string | null;
  status: SectionStatus;
  songCount: number;
  songsWithLinks: number;
  songsWithoutLinks: string[];
}

export interface ServiceResult {
  serviceDate: string;
  rawHeader: string;
  sections: SectionValidation[];
  emailsSent: EmailSent[];
}

export interface ValidationResult {
  id: string;
  targetSunday: string;
  ranAt: string;
  trigger: "scheduled" | "manual";
  services: ServiceResult[];
  emailsSent: EmailSent[];
  error?: string;
}

export interface EmailSent {
  to: string;
  type: "leader_reminder" | "admin_missing_leader";
  sectionName: string;
  sentAt: string;
}

export interface ScheduleInfo {
  nextRunAt: string;
  targetSunday: string;
}

export const runHistory = pgTable("run_history", {
  id: text("id").primaryKey(),
  targetSunday: text("target_sunday").notNull(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull(),
  trigger: text("trigger").notNull(),
  services: jsonb("services").notNull().default([]),
  emailsSent: jsonb("emails_sent").notNull(),
  error: text("error"),
});
