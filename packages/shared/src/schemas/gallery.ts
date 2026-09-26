import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * The school's photographs, grouped by the occasion they were taken at.
 *
 * Shown to parents as Gallery → event → photos, and only to the classes the
 * office picks: the photos are of other people's children, and the Nursery
 * trip is nothing to do with Senior KG.
 */

/**
 * The largest a gallery photo may be once it reaches the server.
 *
 * One megabyte is a sharp photo on any phone screen and a quarter of what a
 * phone camera produces. The portal shrinks a larger one in the browser before
 * sending it, so a 10 MB original arrives under this; the server refuses
 * anything that did not, rather than storing it at full size.
 */
export const GALLERY_PHOTO_MAX_BYTES = 1024 * 1024;

export const createGalleryEventSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the event a name').max(120),
    eventDate: z.coerce.date().nullish(),
    description: z.string().trim().max(500).nullish(),
    /** Every family in the school, instead of the classes listed. */
    visibleToAll: z.boolean().default(false),
    classroomIds: z.array(idSchema).max(100).default([]),
  })
  .refine((value) => value.visibleToAll || value.classroomIds.length > 0, {
    message: 'Choose which classes can see it, or make it visible to the whole school',
    path: ['classroomIds'],
  });
export type CreateGalleryEventInput = z.infer<typeof createGalleryEventSchema>;

export const updateGalleryEventSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  eventDate: z.coerce.date().nullish(),
  description: z.string().trim().max(500).nullish(),
  visibleToAll: z.boolean().optional(),
  classroomIds: z.array(idSchema).max(100).optional(),
});
export type UpdateGalleryEventInput = z.infer<typeof updateGalleryEventSchema>;

/** Files already uploaded through POST /files, added to an event. */
export const addGalleryPhotosSchema = z.object({
  fileIds: z.array(idSchema).min(1).max(100),
});
export type AddGalleryPhotosInput = z.infer<typeof addGalleryPhotosSchema>;

export interface GalleryPhoto {
  id: string;
  url: string;
  caption: string | null;
}

/** An event as the office lists it. */
export interface GalleryEventSummary {
  id: string;
  name: string;
  eventDate: string | null;
  description: string | null;
  visibleToAll: boolean;
  classrooms: Array<{ id: string; label: string }>;
  photoCount: number;
  /** The first photo, for the tile. */
  cover: GalleryPhoto | null;
  createdAt: string;
}

/** One event, with its photos, for the office or a parent. */
export interface GalleryEventDetail extends GalleryEventSummary {
  photos: GalleryPhoto[];
}
