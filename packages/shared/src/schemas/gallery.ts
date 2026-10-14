import { z } from 'zod';
import { idSchema } from './common.js';
import { youTubeVideoId } from './animation.js';

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

/**
 * The small copy of a photo that grids show, made in the browser beside the
 * photo itself. A grid of sixty photos is then a couple of megabytes on a
 * parent's phone rather than sixty.
 */
export const GALLERY_THUMB_MAX_BYTES = 200 * 1024;

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

/**
 * A video in an event, by link: the school uploads it to its own YouTube
 * channel — Unlisted, so only those with the link find it — and pastes the
 * link here. Nothing of the video is stored on this platform.
 */
export const addGalleryVideoSchema = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => youTubeVideoId(value) !== null, {
      message: 'Paste a YouTube link — youtube.com/watch?v=… or youtu.be/…',
    }),
  caption: z.string().trim().max(200).nullish(),
});
export type AddGalleryVideoInput = z.infer<typeof addGalleryVideoSchema>;

/** What Google hands back to the portal's callback page. */
export const connectGalleryDriveSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(512),
});
export type ConnectGalleryDriveInput = z.infer<typeof connectGalleryDriveSchema>;

export interface GalleryPhoto {
  id: string;
  url: string;
  /** The small copy, for grids. The photo itself when none was made. */
  thumbUrl: string;
  caption: string | null;
}

export interface GalleryVideo {
  id: string;
  /** YouTube's id for it. */
  videoId: string;
  /** The link as the school pasted it. */
  url: string;
  /** YouTube's own still for it. */
  thumbnailUrl: string;
  caption: string | null;
}

/** The school's Google Drive, as the gallery page shows it. */
export interface GalleryDriveStatus {
  /** This platform is set up to connect Google Drive at all. */
  available: boolean;
  connected: boolean;
  /** The Google account it is connected with. */
  email: string | null;
  /** Connected, but Google has since refused — access removed in that account. */
  broken: boolean;
  /** The gallery's folder in their Drive. */
  folderUrl: string | null;
  /** Gallery photos still kept on this server, waiting to be moved. */
  onServer: number;
}

/** One step of moving the photos already on this server into Drive. */
export const moveGalleryToDriveSchema = z.object({
  /** Where the last step stopped; absent to start from the beginning. */
  after: idSchema.optional(),
});
export type MoveGalleryToDriveInput = z.infer<typeof moveGalleryToDriveSchema>;

export interface GalleryDriveMoveResult {
  moved: number;
  /** Could not be moved — the bytes are missing here — and stay as they are. */
  failed: number;
  remaining: number;
  /** Where to carry on from, or null when every photo has been tried. */
  next: string | null;
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
  videoCount: number;
  /** The first photo, for the tile. */
  cover: GalleryPhoto | null;
  /** The first video, for the tile of an event that has no photos. */
  coverVideo: GalleryVideo | null;
  createdAt: string;
}

/** One event, with its photos, for the office or a parent. */
export interface GalleryEventDetail extends GalleryEventSummary {
  photos: GalleryPhoto[];
  videos: GalleryVideo[];
}

/* -------------------------------------------------------------------------- */
/* Poetree's Google sign-in, set by the Super Admin                           */
/* -------------------------------------------------------------------------- */

/**
 * The OAuth client from Poetree's Google Cloud project. One for the whole
 * platform — it tells Google "this is Poetree", not which school — and every
 * school uses it to connect its own, separate Google Drive.
 */
export const saveGoogleDriveSettingsSchema = z.object({
  clientId: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value.endsWith('.apps.googleusercontent.com'), {
      message: 'A Google Client ID ends in .apps.googleusercontent.com',
    }),
  /** Blank keeps the one already saved. */
  clientSecret: z.string().trim().max(255).optional(),
  redirectUri: z
    .string()
    .trim()
    .max(500)
    .url('The redirect URI is a full address, starting https://')
    .refine((value) => value.endsWith('/school/gallery/drive/callback'), {
      message: 'The redirect URI is the portal’s /school/gallery/drive/callback page',
    }),
});
export type SaveGoogleDriveSettingsInput = z.infer<typeof saveGoogleDriveSettingsSchema>;

/** One school's own Google Drive, as the Super Admin sees it. */
export interface SchoolDriveSummary {
  schoolId: string;
  schoolName: string;
  googleEmail: string;
  broken: boolean;
  connectedAt: string;
  /** Gallery photos kept in that Drive. */
  photos: number;
}

export interface GoogleDriveSettings {
  /** Set up: schools can connect their Drives. */
  configured: boolean;
  clientId: string | null;
  /** A secret is saved. It is never sent back. */
  clientSecretSet: boolean;
  redirectUri: string | null;
  schools: SchoolDriveSummary[];
  /** Gallery photos still kept on Poetree's server, every school together. */
  photosOnServer: number;
}
