'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type Point = { x: number; y: number };
type Stroke = Point[];

/**
 * Drawing the path a child will trace.
 *
 * Strokes are normalised 0–1 coordinates so one definition renders on any screen
 * — which is right for the app and impossible to type by hand. This was a JSON
 * textarea, and nobody was ever going to author the alphabet that way.
 *
 * Each stroke is one movement of the finger, in the order a child should make
 * them: for an A, the two diagonals and then the bar. The order is kept because
 * that is how the letter is taught, not merely how it looks.
 */
export function StrokeEditor({
  name,
  guide,
  initial,
}: {
  name: string;
  /** The letter itself, shown faintly underneath to draw over. */
  guide?: string;
  initial?: Stroke[];
}) {
  const [strokes, setStrokes] = useState<Stroke[]>(initial ?? []);
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  function pointFrom(event: ReactPointerEvent): Point | null {
    const box = surface.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;

    // Clamped: a finger that slides off the edge should end the stroke at the
    // edge rather than record a coordinate the app would refuse.
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  }

  function start(event: ReactPointerEvent): void {
    const point = pointFrom(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing([point]);
  }

  function extend(event: ReactPointerEvent): void {
    if (!drawing) return;
    const point = pointFrom(event);
    if (!point) return;

    // Only when the pointer has actually travelled. Without this a slow hand
    // records hundreds of points a millimetre apart, and the stored definition
    // is a paragraph of noise.
    const last = drawing[drawing.length - 1]!;
    if (Math.abs(point.x - last.x) < 0.02 && Math.abs(point.y - last.y) < 0.02) return;

    setDrawing([...drawing, point]);
  }

  function finish(): void {
    if (!drawing) return;
    // A tap is not a stroke. The contract needs two points, and one is what a
    // misclick produces.
    if (drawing.length >= 2) setStrokes([...strokes, drawing]);
    setDrawing(null);
  }

  const all = drawing ? [...strokes, drawing] : strokes;

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(strokes)} />

      <div
        ref={surface}
        onPointerDown={start}
        onPointerMove={extend}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="relative aspect-square w-full max-w-xs touch-none rounded-2xl bg-slate-50 ring-1 ring-navy-950/10"
      >
        {guide && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[10rem] font-semibold leading-none text-slate-200"
          >
            {guide}
          </span>
        )}

        <svg viewBox="0 0 1 1" className="absolute inset-0 h-full w-full">
          {all.map((stroke, index) => (
            <polyline
              key={index}
              points={stroke.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="#16307C"
              strokeWidth={0.04}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 6 }}
            />
          ))}
        </svg>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStrokes(strokes.slice(0, -1))}
          disabled={strokes.length === 0}
          className={CONTROL}
        >
          Undo stroke
        </button>
        <button
          type="button"
          onClick={() => setStrokes([])}
          disabled={strokes.length === 0}
          className={CONTROL}
        >
          Clear
        </button>
        <span className="text-xs text-slate-500">
          {strokes.length === 0
            ? 'Draw the letter, one stroke at a time.'
            : `${strokes.length} ${strokes.length === 1 ? 'stroke' : 'strokes'}, in the order a child should make them.`}
        </span>
      </div>
    </div>
  );
}

const CONTROL =
  'rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50 disabled:opacity-40';
