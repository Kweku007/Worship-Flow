import { z } from "zod";

export const parseDocRequestSchema = z.object({
  docUrl: z.string().url(),
});

export const songInputSchema = z.object({
  title: z.string(),
  youtubeUrl: z.string().nullable(),
  targetKey: z.string().optional(),
});

export const processRequestSchema = z.object({
  songs: z.array(songInputSchema).min(1),
  emailTo: z.string().email(),
  weekLabel: z.string().optional(),
});

export type ParseDocRequest = z.infer<typeof parseDocRequestSchema>;
export type SongInput = z.infer<typeof songInputSchema>;
export type ProcessRequest = z.infer<typeof processRequestSchema>;
