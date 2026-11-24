/**
 * Small charts drawn as SVG on the server — no chart library, nothing for the
 * phone to download or run. Every figure is also in the markup as text, so a
 * screen reader, a print-out or a slow connection loses nothing.
 */

const TONE = {
  emerald: { bar: '#10b981', soft: '#d1fae5', text: '#047857' },
  violet: { bar: '#8b5cf6', soft: '#ede9fe', text: '#6d28d9' },
  sky: { bar: '#0ea5e9', soft: '#e0f2fe', text: '#0369a1' },
  amber: { bar: '#f59e0b', soft: '#fef3c7', text: '#b45309' },
  rose: { bar: '#f43f5e', soft: '#ffe4e6', text: '#be123c' },
} as const;
export type ChartTone = keyof typeof TONE;

/**
 * Bars standing side by side — a figure for each month, say. The latest is
 * the strongest colour; the value of each is in its tooltip and in the hidden
 * table beneath.
 */
export function ColumnChart({
  data,
  tone = 'emerald',
  format = (value) => String(value),
  label,
}: {
  data: Array<{ label: string; value: number }>;
  tone?: ChartTone;
  format?: (value: number) => string;
  /** What the chart shows, for a screen reader. */
  label: string;
}) {
  const colours = TONE[tone];
  const max = Math.max(1, ...data.map((d) => d.value));
  const width = 100 / data.length;

  return (
    // Relative, so the hidden table below sits inside the chart, not off the page.
    <figure className="relative">
      <div className="flex h-44 items-end gap-1.5" role="img" aria-label={label}>
        {data.map((d, index) => {
          const height = d.value > 0 ? Math.max(4, (d.value / max) * 100) : 2;
          const last = index === data.length - 1;
          return (
            <div
              key={d.label}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
              style={{ maxWidth: `${width}%` }}
            >
              <div
                className="w-full rounded-t-lg transition-[filter] group-hover:brightness-95"
                style={{
                  height: `${height}%`,
                  background: last ? colours.bar : d.value > 0 ? `${colours.bar}99` : colours.soft,
                }}
                title={`${d.label}: ${format(d.value)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {data.map((d) => (
          <span
            key={d.label}
            className="min-w-0 flex-1 truncate text-center text-[0.7rem] font-medium text-slate-500"
          >
            {/* One letter on a phone, where three would be cut off. */}
            <span className="sm:hidden">{d.label.slice(0, 1)}</span>
            <span className="hidden sm:inline">{d.label}</span>
          </span>
        ))}
      </div>
      {/* In a div: a table ignores sr-only's 1px width and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                <td>{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Rows of bars, each labelled with its own figure — children per class. */
export function BarList({
  rows,
  tone = 'violet',
}: {
  rows: Array<{ label: string; value: number; href?: string }>;
  tone?: ChartTone;
}) {
  const colours = TONE[tone];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-sm font-semibold text-navy-950">
            {row.label}
          </span>
          <span
            className="h-3 flex-1 overflow-hidden rounded-full"
            style={{ background: colours.soft }}
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${(row.value / max) * 100}%`, background: colours.bar }}
            />
          </span>
          <span
            className="w-8 shrink-0 text-right text-sm font-bold tabular-nums"
            style={{ color: colours.text }}
          >
            {row.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A ring showing part of a whole — today's attendance. */
export function Ring({
  value,
  total,
  tone = 'sky',
  caption,
}: {
  value: number;
  total: number;
  tone?: ChartTone;
  caption: string;
}) {
  const colours = TONE[tone];
  const share = total > 0 ? value / total : 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative grid h-36 w-36 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke={colours.soft} strokeWidth="12" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={colours.bar}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${share * circumference} ${circumference}`}
        />
      </svg>
      <div className="text-center">
        <p className="font-display text-3xl font-extrabold" style={{ color: colours.text }}>
          {Math.round(share * 100)}%
        </p>
        <p className="text-xs font-medium text-slate-500">{caption}</p>
      </div>
    </div>
  );
}
