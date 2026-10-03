import { z } from 'zod';
import { idSchema } from './common.js';
import { youTubeUrlSchema, type BookAnimation } from './animation.js';

/**
 * The tracing module: capital letters, numbers, small letters and whatever
 * else a child learns to write, each one watched first and then traced.
 *
 * The publisher owns the catalogue — which categories there are, which
 * letters are in each, and the video for each letter — and one switch that
 * turns the whole module on or off in every school's app. The shape a child
 * traces is never authored here: it comes from the universal stroke table by
 * glyph, so an item is a letter and a video, nothing to draw.
 */

/* -------------------------------------------------------------------------- */
/* Publisher                                                                  */
/* -------------------------------------------------------------------------- */

export const tracingSettingsSchema = z.object({ enabled: z.boolean() });
export type TracingSettingsInput = z.infer<typeof tracingSettingsSchema>;

export const updateTracingCategorySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(40).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTracingCategoryInput = z.infer<typeof updateTracingCategorySchema>;

/** Adds a letter to a category. It must be one the stroke table can draw. */
export const createTracingItemSchema = z.object({
  glyph: z.string().trim().min(1).max(40),
  videoUrl: youTubeUrlSchema.optional(),
});
export type CreateTracingItemInput = z.infer<typeof createTracingItemSchema>;

export const updateTracingItemSchema = z.object({
  /** An empty string takes the video off. */
  videoUrl: youTubeUrlSchema.optional(),
  /** An empty string goes back to the plain sentence. */
  say: z.string().trim().max(200).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTracingItemInput = z.infer<typeof updateTracingItemSchema>;

export interface TracingItemAdmin {
  id: string;
  glyph: string;
  videoUrl: string | null;
  /** Null when the link no longer parses — shown as a problem to fix. */
  videoId: string | null;
  say: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface TracingCategoryAdmin {
  id: string;
  key: string;
  name: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  items: TracingItemAdmin[];
}

export interface TracingCatalogueAdmin {
  enabled: boolean;
  categories: TracingCategoryAdmin[];
  /** Every glyph the stroke table can draw, for the "add a letter" picker. */
  glyphs: string[];
}

/* -------------------------------------------------------------------------- */
/* A child                                                                    */
/* -------------------------------------------------------------------------- */

export const tracingStudentSchema = z.object({ studentId: idSchema });

export interface TracingCategorySummary {
  id: string;
  key: string;
  name: string;
  label: string;
  itemCount: number;
  /** Traced at least once by this child. */
  tracedCount: number;
}

/** What the home screen asks first: is the module on, and what is in it. */
export interface TracingHome {
  enabled: boolean;
  categories: TracingCategorySummary[];
}

export interface TracingItemForChild {
  id: string;
  glyph: string;
  /** What the voice says to start: "Trace the letter A." */
  say: string;
  strokes: Array<Array<{ x: number; y: number }>>;
  /** False when the strokes may be traced in any order. */
  ordered: boolean;
  /** Null when the item has no video yet; tracing then opens straight away. */
  video: BookAnimation | null;
  videoWatched: boolean;
  traced: boolean;
}

export interface TracingCategoryForChild {
  id: string;
  key: string;
  name: string;
  label: string;
  items: TracingItemForChild[];
}
