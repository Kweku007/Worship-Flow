import { z } from "zod";

export const DOCUMENT_ID = "1SD2t9J7jYZUnN9QDOr2TWgtfkEkOfe4yuxYYb1_WwLY";
export const ADMIN_EMAIL = "hello@kwekuaboagye.me";

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
  sundayDate: string;
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

export interface ValidationResult {
  id: string;
  targetSunday: string;
  ranAt: string;
  trigger: "scheduled" | "manual";
  sections: SectionValidation[];
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
