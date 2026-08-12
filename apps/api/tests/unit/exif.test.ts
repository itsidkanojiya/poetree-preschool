import { describe, expect, it } from 'vitest';
import { carriesMetadata, stripImageMetadata } from '../../src/lib/exif.js';

/**
 * §9 of the architecture plan asked for this and it was never built. It matters
 * most for the feature that prompted it: a parent photographing homework does
 * it at home, and a phone JPEG carries the coordinates of the room.
 */

/** A JPEG segment: 0xFF, marker, big-endian length (inclusive of itself). */
function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

const SOI = Buffer.from([0xff, 0xd8]);
/** Start of Scan plus a little compressed data and an end marker. */
const IMAGE_DATA = Buffer.concat([
  Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
  Buffer.from([0x12, 0x34, 0x56, 0x78]),
  Buffer.from([0xff, 0xd9]),
]);

/** Exif with something that looks like a GPS tag, as a phone would write. */
const EXIF = segment(
  0xe1,
  Buffer.concat([
    Buffer.from('Exif\0\0', 'latin1'),
    Buffer.from('MM\0*', 'latin1'),
    Buffer.from([0x00, 0x00, 0x00, 0x08]),
    Buffer.from('GPSLatitude 51.5074 GPSLongitude -0.1278', 'latin1'),
  ]),
);

const JFIF = segment(0xe0, Buffer.from('JFIF\0\0\0\0\0\0', 'latin1'));
const QUANT = segment(0xdb, Buffer.alloc(65, 0x10));

describe('stripping metadata from a photograph', () => {
  it('removes the Exif block, coordinates and all', () => {
    const photo = Buffer.concat([SOI, JFIF, EXIF, QUANT, IMAGE_DATA]);

    expect(photo.toString('latin1')).toContain('GPSLatitude');

    const cleaned = stripImageMetadata(photo, 'image/jpeg');

    expect(cleaned.toString('latin1')).not.toContain('GPSLatitude');
    expect(cleaned.toString('latin1')).not.toContain('Exif');
    expect(cleaned.length).toBeLessThan(photo.length);
  });

  it('leaves the picture itself intact', () => {
    const photo = Buffer.concat([SOI, JFIF, EXIF, QUANT, IMAGE_DATA]);
    const cleaned = stripImageMetadata(photo, 'image/jpeg');

    // Still a JPEG, still ends properly, and the compressed data is untouched —
    // a photograph this corrupted would be a parent's work lost.
    expect(cleaned.subarray(0, 2)).toEqual(SOI);
    expect(cleaned.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(cleaned.includes(IMAGE_DATA)).toBe(true);
    // The quantisation table is needed to decode; only metadata goes.
    expect(cleaned.includes(QUANT)).toBe(true);
    // JFIF is density information, no personal data, and some decoders want it.
    expect(cleaned.includes(JFIF)).toBe(true);
  });

  it('drops a comment block, which can carry a name or a path', () => {
    const comment = segment(0xfe, Buffer.from('/Users/meera/photos/aarav.jpg', 'latin1'));
    const photo = Buffer.concat([SOI, JFIF, comment, IMAGE_DATA]);

    const cleaned = stripImageMetadata(photo, 'image/jpeg');
    expect(cleaned.toString('latin1')).not.toContain('meera');
  });

  it('leaves a photograph with nothing to strip exactly as it was', () => {
    const photo = Buffer.concat([SOI, JFIF, QUANT, IMAGE_DATA]);

    expect(stripImageMetadata(photo, 'image/jpeg')).toEqual(photo);
    expect(carriesMetadata(photo, 'image/jpeg')).toBe(false);
  });

  it('does not touch anything that is not a JPEG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(stripImageMetadata(png, 'image/png')).toEqual(png);

    const pdf = Buffer.from('%PDF-1.7 trailer', 'latin1');
    expect(stripImageMetadata(pdf, 'application/pdf')).toEqual(pdf);
  });

  it('gives up rather than mangling something malformed', () => {
    // Better to store a photograph with its metadata than to hand back bytes
    // that no longer decode. The privacy problem is recoverable; the lost
    // picture is not.
    const truncated = Buffer.concat([SOI, Buffer.from([0xff, 0xe1, 0xff, 0xfe])]);
    expect(stripImageMetadata(truncated, 'image/jpeg')).toEqual(truncated);

    const notReally = Buffer.concat([SOI, Buffer.from([0x00, 0x01, 0x02, 0x03])]);
    expect(stripImageMetadata(notReally, 'image/jpeg')).toEqual(notReally);

    expect(stripImageMetadata(Buffer.alloc(0), 'image/jpeg')).toEqual(Buffer.alloc(0));
  });
});
