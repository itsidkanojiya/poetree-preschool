import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { compressPicture } from '../../src/lib/compress.js';

/**
 * A picture like the books' own: soft colour, a few bold shapes, and a
 * see-through corner, the way a sticker is cut out of its page.
 */
async function artwork(width: number, height: number): Promise<Buffer> {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3aa7e0"/><stop offset="1" stop-color="#bfe8ff"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#sky)"/>
      <circle cx="${width * 0.7}" cy="${height * 0.3}" r="${height * 0.15}" fill="#ffd23f"/>
      <ellipse cx="${width / 2}" cy="${height}" rx="${width * 0.7}" ry="${height * 0.35}" fill="#5cbf3a"/>
      <rect x="${width * 0.3}" y="${height * 0.45}" width="${width * 0.12}" height="${height * 0.3}" fill="#8b5a2b"/>
      <circle cx="${width * 0.36}" cy="${height * 0.42}" r="${height * 0.14}" fill="#2e8b3a"/>
    </svg>`;
  const drawn = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
  // The top-left corner see-through.
  for (let y = 0; y < height / 4; y++) {
    for (let x = 0; x < width / 4; x++) drawn[(y * width + x) * 4 + 3] = 0;
  }
  return sharp(drawn, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/** How far each visible colour moved, sorted: what is hidden cannot differ. */
async function drift(before: Buffer, after: Buffer): Promise<number[]> {
  const a = await sharp(before).ensureAlpha().raw().toBuffer();
  const b = await sharp(after).ensureAlpha().raw().toBuffer();
  const moved: number[] = [];
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) moved.push(Math.abs(a[i + c]! - b[i + c]!));
  }
  return moved.sort((x, y) => x - y);
}

describe('compressing a picture', () => {
  it('turns a PNG into a much smaller WebP of the same size, see-through parts kept', async () => {
    const png = await artwork(600, 400);
    const out = await compressPicture({ bytes: png, mime: 'image/png', name: 'leaves.png' });

    expect(out.mime).toBe('image/webp');
    expect(out.name).toBe('leaves.webp');
    expect(out.bytes.length).toBeLessThan(png.length / 2);

    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([600, 400]);
    expect(meta.hasAlpha).toBe(true);

    // Looks the same: on average a colour moves by less than 1% of its range,
    // and almost none by enough to see.
    const moved = await drift(png, out.bytes);
    const mean = moved.reduce((sum, d) => sum + d, 0) / moved.length;
    expect(mean).toBeLessThan(3);
    expect(moved[Math.floor(moved.length * 0.99)]).toBeLessThan(16);
    // And what was see-through still is.
    const corner = await sharp(out.bytes).ensureAlpha().raw().toBuffer();
    expect(corner[3]).toBe(0);
  });

  it('brings a picture larger than any screen down to 2048 on its longest side', async () => {
    const huge = await artwork(3000, 1500);
    const out = await compressPicture({ bytes: huge, mime: 'image/png', name: 'big.png' });

    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([2048, 1024]);
  });

  it('leaves a WebP alone: compressing it again would only lose more', async () => {
    const webp = await sharp(await artwork(300, 300))
      .webp({ quality: 80 })
      .toBuffer();
    const out = await compressPicture({ bytes: webp, mime: 'image/webp', name: 'already.webp' });

    expect(out.bytes).toBe(webp);
    expect(out.mime).toBe('image/webp');
  });

  it('keeps the original when it cannot be read rather than failing the upload', async () => {
    const broken = Buffer.from('\x89PNG\r\n\x1a\nthis is not really a picture');
    const out = await compressPicture({ bytes: broken, mime: 'image/png', name: 'broken.png' });

    expect(out.bytes).toBe(broken);
    expect(out.mime).toBe('image/png');
    expect(out.name).toBe('broken.png');
  });
});
