'use client';

import type { QuestionRow } from '@poetree/shared';
import { MediaInputs, Slot, SlotsHeading, SlotsHint } from './shared';

/** Five pairs at most: more is too many for a child to hold at once. */
const PAIRS = 5;

/**
 * Match the Pairs: each pair written side by side, the way it is meant.
 *
 * The app shuffles the right-hand side, so nobody has to scramble it here —
 * and a pair written apart from its partner is a pair that ends up wrong.
 *
 * "The left picture's shadow" draws the left picture black instead of a second
 * picture, which is what most of the books' shadow pages are. It needs a
 * picture with a see-through background; on a white one the whole square goes
 * black.
 */
export function PairsEditor({ question }: { question?: QuestionRow }) {
  return (
    <div>
      <SlotsHeading>The pairs</SlotsHeading>
      <div className="space-y-3">
        {Array.from({ length: PAIRS }, (_, index) => {
          const pair = question?.options[index];
          return (
            <Slot
              key={index}
              number={`Pair ${index + 1}`}
              aside={
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    name={`pair-${index}-shadow`}
                    defaultChecked={pair?.matchShadow}
                    className="h-3.5 w-3.5 rounded border-navy-300 text-navy-900"
                  />
                  Right side is the left picture’s shadow
                </label>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Left</p>
                  <MediaInputs
                    prefix={`pair-${index}-left`}
                    imageUrl={pair?.imageUrl}
                    glyph={pair?.glyph}
                    text={pair?.text}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Right</p>
                  <MediaInputs
                    prefix={`pair-${index}-right`}
                    imageUrl={pair?.matchImageUrl}
                    glyph={pair?.matchGlyph}
                    text={pair?.matchText}
                    glyphPlaceholder="a or 3"
                  />
                </div>
              </div>
            </Slot>
          );
        })}
      </div>
      <SlotsHint>
        Fill two to five pairs and leave the rest empty. For a shadow, put the picture on the left
        and tick the box; nothing is needed on the right.
      </SlotsHint>
    </div>
  );
}
