import { describe, expect, it } from 'vitest';
import { youTubeVideoId } from '@poetree/shared';

describe('the link somebody pasted', () => {
  it('reads every form YouTube hands out', () => {
    // Nobody types a canonical URL. They paste what the Share button gave them,
    // or the address bar, or an embed snippet — and all of them are the same
    // eleven characters.
    const expected = 'dQw4w9WgXcQ';

    expect(youTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(expected);
    expect(youTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(expected);
    expect(youTubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(expected);
    expect(youTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(expected);
    expect(youTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(expected);
    expect(youTubeVideoId('dQw4w9WgXcQ')).toBe(expected);
  });

  it('survives the rubbish the Share button attaches', () => {
    // A share link carries a timestamp and a tracking parameter; an address bar
    // carries the playlist the video happened to be in.
    expect(youTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42&si=aBcDeFg')).toBe('dQw4w9WgXcQ');
    expect(
      youTubeVideoId('https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&index=2'),
    ).toBe('dQw4w9WgXcQ');
    expect(youTubeVideoId('  https://youtu.be/dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('refuses anything that is not a video', () => {
    // Refused at the door rather than stored: a book whose animation will not
    // play is a book whose activities never open, and nobody would find out
    // until a child sat in front of it.
    expect(youTubeVideoId('')).toBeNull();
    expect(youTubeVideoId('https://vimeo.com/12345678')).toBeNull();
    expect(youTubeVideoId('https://www.youtube.com/')).toBeNull();
    expect(youTubeVideoId('https://www.youtube.com/@poetree')).toBeNull();
    expect(youTubeVideoId('not a link at all')).toBeNull();
    // Ten characters, not eleven.
    expect(youTubeVideoId('https://youtu.be/dQw4w9WgXc')).toBeNull();
  });
});
