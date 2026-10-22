import { z } from 'zod';

/**
 * The picture library: every picture the publisher has in the catalogue —
 * uploaded for a question, a cover, a subject, or brought in from the app's
 * own letter and number pictures — to be chosen again rather than uploaded
 * again.
 */

export const pictureLibraryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(96).default(48),
  /** Part of the picture's name: "apple", "four", "(A)". */
  search: z.string().trim().min(1).max(100).optional(),
});
export type PictureLibraryQuery = z.infer<typeof pictureLibraryQuerySchema>;

export interface LibraryPicture {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** `/api/v1/catalogue/assets/<id>`, like every catalogue picture. */
  url: string;
  createdAt: string;
}

/** What an upload answers: the picture, and whether it was already there. */
export interface StoredPicture {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  /** The same picture was in the library already; that one is answered. */
  reused: boolean;
}

/** Bringing the app's own pictures into the library. */
export interface AppPicturesImport {
  /** Pictures the app has. */
  total: number;
  /** Newly in the library. */
  added: number;
  /** In the library already, left as they were. */
  existing: number;
}
