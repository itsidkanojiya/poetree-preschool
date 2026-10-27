'use client';

import type { QuestionRow } from '@poetree/shared';
import { Select } from '@/components/ui/form';
import { MediaInputs, Slot, SlotsHeading, SlotsHint } from './shared';

/** The books sort into two (healthy or junk) or three (land, water, air). */
const BASKETS = 3;
/** Nine cards at most: a question a child finishes before losing interest. */
const CARDS = 9;

/**
 * Sort into Groups: the baskets first, then the cards and where each goes.
 *
 * A basket is a name a child hears ("Healthy") with an emoji or a picture they
 * can see (✓, the sky). A third basket left without a name is not a basket.
 */
export function SortEditor({ question }: { question?: QuestionRow }) {
  const groups = question?.settings.groups ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SlotsHeading>The baskets</SlotsHeading>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: BASKETS }, (_, index) => {
            const group = groups[index];
            return (
              <Slot key={index} number={`Basket ${index + 1}`}>
                <MediaInputs
                  prefix={`group-${index}`}
                  imageUrl={group?.imageUrl}
                  glyph={group?.glyph}
                  text={group?.label}
                  glyphPlaceholder="✓ or ☀"
                  textPlaceholder={
                    index === 0 ? 'Name: Healthy' : index === 1 ? 'Junk' : 'Optional'
                  }
                />
              </Slot>
            );
          })}
        </div>
        <SlotsHint>Two baskets, or three. Each needs a name; a picture or emoji helps.</SlotsHint>
      </div>

      <div>
        <SlotsHeading>The cards</SlotsHeading>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: CARDS }, (_, index) => {
            const card = question?.options[index];
            return (
              <Slot
                key={index}
                number={index + 1}
                aside={
                  <Select
                    name={`card-${index}-group`}
                    defaultValue={String(card?.groupIndex ?? 0)}
                    aria-label={`Basket for card ${index + 1}`}
                    className="h-8 w-auto py-0 text-xs"
                  >
                    {Array.from({ length: BASKETS }, (_, basket) => (
                      <option key={basket} value={basket}>
                        Basket {basket + 1}
                      </option>
                    ))}
                  </Select>
                }
              >
                <MediaInputs
                  prefix={`card-${index}`}
                  imageUrl={card?.imageUrl}
                  glyph={card?.glyph}
                  text={card?.text}
                />
              </Slot>
            );
          })}
        </div>
        <SlotsHint>Fill as many as you need, up to nine, and choose each one’s basket.</SlotsHint>
      </div>
    </div>
  );
}
