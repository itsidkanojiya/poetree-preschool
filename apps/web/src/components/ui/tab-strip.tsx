import Link from 'next/link';

/**
 * One row of sections, scrolling sideways when it will not fit.
 *
 * Links rather than client state, so each section is a real address: a support
 * call is answered by sending somebody the URL of the tab, a save that
 * revalidates the page comes back to the tab it was made on, and the browser's
 * back button does what it looks like it does.
 *
 * The overflow is on this strip alone — never on the page — so a narrow window
 * scrolls the tabs and not the whole layout.
 */
export function TabStrip({
  tabs,
  current,
}: {
  tabs: Array<{ key: string; label: string; href: string; badge?: string | number }>;
  current: string;
}) {
  return (
    <div className="-mx-1 mb-5 overflow-x-auto px-1 pb-1">
      <nav className="flex w-max items-center gap-1 rounded-2xl bg-slate-100/80 p-1">
        {tabs.map((tab) => {
          const active = tab.key === current;

          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white text-navy-950 shadow-sm ring-1 ring-navy-950/[0.06]'
                  : 'text-slate-500 hover:text-navy-900'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge !== '' && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                    active ? 'bg-navy-50 text-navy-900' : 'bg-slate-200/80 text-slate-500'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
