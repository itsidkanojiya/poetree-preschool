import { GALLERY_PHOTO_MAX_BYTES } from '@poetree/shared';

/**
 * A photograph made small enough for the gallery, in the browser, before it is
 * sent.
 *
 * Here rather than on the server on purpose. The API runs on a two-core box it
 * shares with three other production projects, and the image library that would
 * do this there is a large native dependency the project has already decided
 * against (see lib/exif.ts). The office's laptop has a whole browser for it.
 *
 * A 10 MB phone photo comes out well under a megabyte: first by drawing it no
 * larger than a phone screen can use, then by lowering the JPEG quality a step
 * at a time, and only then by drawing it smaller again. Re-drawing also drops
 * the camera's metadata — including where the photo was taken, which for a
 * school outing is somewhere a group of children was.
 */
export async function shrinkForGallery(file: File): Promise<Blob> {
  // Already small and already a JPEG: sending it as it is keeps it sharpest.
  if (file.size <= GALLERY_PHOTO_MAX_BYTES && file.type === 'image/jpeg') return file;

  const bitmap = await decode(file);

  try {
    // Long edge in pixels. 2048 is more than any phone shows a photo at.
    let longEdge = 2048;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser cannot resize photos.');

      // A transparent PNG would turn black as a JPEG; white is what a printed
      // photo's border would be.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.85, 0.75, 0.65, 0.55]) {
        const blob = await toJpeg(canvas, quality);
        if (blob.size <= GALLERY_PHOTO_MAX_BYTES) return blob;
      }

      longEdge = Math.round(longEdge * 0.75);
    }
  } finally {
    bitmap.close();
  }

  throw new Error('This photo could not be made small enough. Try a smaller one.');
}

/** Upright, whichever way the phone was held. */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      // Most often an iPhone HEIC photo, which only Safari can read.
      throw new Error(
        `${file.name} is in a format this browser cannot open. Save it as a JPEG and try again.`,
      );
    }
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo.'))),
      'image/jpeg',
      quality,
    );
  });
}
