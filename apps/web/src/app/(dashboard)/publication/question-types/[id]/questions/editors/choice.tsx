'use client';

import type { QuestionRow } from '@poetree/shared';
import { isMultiType, optionSlots } from './kinds';
import { MediaInputs, Slot, SlotsHeading, SlotsHint } from './shared';

/**
 * The options of a question with one right answer, or several.
 *
 * Slots are always shown and the empty ones are ignored on save — an author
 * filling two is writing a two-choice question, which is what most preschool
 * pages are.
 *
 * A radio where exactly one answer is right, a checkbox where several may be.
 * The control is the explanation: nobody has to be told that a page called
 * "tap all the animals" allows more than one.
 */
export function ChoiceEditor({ type, question }: { type: string; question?: QuestionRow }) {
  const multi = isMultiType(type);
  const odd = type === 'ODD_ONE_OUT';

  return (
    <div>
      <SlotsHeading>{odd ? 'The row' : 'What they choose between'}</SlotsHeading>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: optionSlots(type) }, (_, index) => {
          const option = question?.options[index];
          return (
            <Slot
              key={index}
              number={index + 1}
              aside={
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type={multi ? 'checkbox' : 'radio'}
                    name="correct"
                    value={index}
                    defaultChecked={option?.isCorrect}
                    className={`h-3.5 w-3.5 border-navy-300 text-navy-900 ${multi ? 'rounded' : ''}`}
                  />
                  {multi ? 'A right answer' : odd ? 'The different one' : 'Right answer'}
                </label>
              }
            >
              <MediaInputs
                prefix={`option-${index}`}
                imageUrl={option?.imageUrl}
                glyph={option?.glyph}
                text={option?.text}
              />
            </Slot>
          );
        })}
      </div>
      <SlotsHint>
        {multi
          ? 'Tick every answer that is right. Leave the slots you do not need empty.'
          : odd
            ? 'Fill three or four. Tick the one that is different.'
            : 'Tick the one that is right. Leave the slots you do not need empty.'}
      </SlotsHint>
    </div>
  );
}
