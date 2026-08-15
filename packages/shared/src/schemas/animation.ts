import { z } from 'zod';

/**
 * The animation a child watches before a book's activities open.
 *
 * A YouTube link rather than an upload: these are minutes of video, the box
 * serving this product has two cores and nothing in front of it, and a
 * preschool's families are on mobile data. YouTube already solves delivery.
 */

/**
 * Pulls the video id out of whatever somebody pasted.
 *
 * Nobody types a canonical URL. They paste what the Share button gave them,
 * which is a youtu.be short link; or the address bar, which carries a playlist
 * and a timestamp; or an embed snippet. All of them are the same eleven
 * characters, and storing the id rather than the URL means the player never has
 * to parse a link a four-year-old is waiting on.
 */
export function youTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (value === '') return null;

  // Already just an id.
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;

  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match?.[1]) return match[1];
  }

  return null;
}

/**
 * A link somebody pasted, checked at the door.
 *
 * Refused here rather than stored and discovered later: a book whose animation
 * will not play is a book whose activities never unlock, and nobody would find
 * out until a child sat in front of it.
 */
export const youTubeUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === '' || youTubeVideoId(value) !== null, {
    message: 'That is not a YouTube link. Paste the one the Share button gives you.',
  });

/** What a client needs to play and to know whether it has been watched. */
export interface BookAnimation {
  /** The eleven-character id, ready for a player. */
  videoId: string;
  /** The original link, for anybody who wants to open it themselves. */
  url: string;
}
