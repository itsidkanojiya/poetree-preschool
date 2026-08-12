/**
 * Removes metadata from uploaded photographs.
 *
 * §9 of the architecture plan called for this and it was never built: images
 * were written through byte for byte. It has not mattered much while uploads
 * were office paperwork scanned at a desk, but a parent photographing their
 * child's homework does it at home, on a phone, with location services on —
 * and a JPEG straight off a phone carries the coordinates of the room it was
 * taken in, the device serial, and often a thumbnail of the original frame.
 *
 * The school would then serve that back. To a teacher legitimately, which is
 * bad enough; to anyone who ever gains access to the file root, considerably
 * worse. It is the address of a small child's home.
 *
 * Done by hand rather than with `sharp`. Re-encoding through a native image
 * pipeline is the thorough answer, but it is a large compiled dependency on a
 * two-core box shared with three other production projects, and the whole job
 * here is deleting a few labelled blocks. Nothing is decoded, so a malformed
 * file cannot make this do anything except give up and return the original.
 */

/**
 * JPEG application segments to drop.
 *
 * APP1 carries Exif (GPS, timestamps, device) and XMP. APP2 onwards carries
 * ICC profiles, Photoshop resources and maker notes. APP0 is JFIF — density
 * and a thumbnail flag, no personal data — and is kept because some decoders
 * expect it.
 */
const DROP_FROM = 0xe1; // APP1
const DROP_TO = 0xef; // APP15
const COMMENT = 0xfe; // COM, free text, sometimes a filename or author

/** Start of Scan: after this marker the rest of the file is entropy-coded. */
const START_OF_SCAN = 0xda;

function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/**
 * Returns the image with its metadata segments removed.
 *
 * Falls back to the original bytes if the structure is not what we expect. A
 * photograph that keeps its metadata is a privacy problem; a photograph this
 * function corrupts is a parent's work lost, and between the two the safe
 * failure is to leave it alone and let the caller decide.
 */
export function stripImageMetadata(bytes: Buffer, mimeType: string): Buffer {
  if (mimeType !== 'image/jpeg' || !isJpeg(bytes)) return bytes;

  const keep: Buffer[] = [bytes.subarray(0, 2)]; // SOI
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    // Every marker begins 0xFF. Anything else means we have lost the thread.
    if (bytes[offset] !== 0xff) return bytes;

    const marker = bytes[offset + 1]!;

    // Fill bytes are legal padding before a marker.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }

    if (marker === START_OF_SCAN) {
      // Compressed data runs to the end; copy the remainder untouched.
      keep.push(bytes.subarray(offset));
      return Buffer.concat(keep);
    }

    const length = bytes.readUInt16BE(offset + 2);
    // A segment declares its own length including those two bytes, so anything
    // under two is malformed.
    if (length < 2 || offset + 2 + length > bytes.length) return bytes;

    const segment = bytes.subarray(offset, offset + 2 + length);
    const drop = (marker >= DROP_FROM && marker <= DROP_TO) || marker === COMMENT;
    if (!drop) keep.push(segment);

    offset += 2 + length;
  }

  // Ran off the end without finding the image data.
  return bytes;
}

/** Whether anything was actually removed — used by the upload log and tests. */
export function carriesMetadata(bytes: Buffer, mimeType: string): boolean {
  return stripImageMetadata(bytes, mimeType).byteLength !== bytes.byteLength;
}
