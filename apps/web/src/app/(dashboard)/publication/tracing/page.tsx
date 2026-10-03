import type { TracingCatalogueAdmin } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, Notice, PageHeader } from '@/components/ui/layout';
import { LiveSwitch } from '@/components/ui/live-switch';
import { TabStrip } from '@/components/ui/tab-strip';
import { setCategoryActiveAction, setTracingEnabledAction } from './actions';
import { AddItemForm, CategoryForm, ItemRow } from './forms';

/**
 * The tracing module, for every school at once: whether the app shows it at
 * all, which categories it offers, and the video a child watches before
 * tracing each letter.
 */
export default async function TracingPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category: key } = await searchParams;
  const catalogue = await apiFetch<TracingCatalogueAdmin>('/publication/tracing');
  const selected =
    catalogue.categories.find((c) => c.key === key) ?? catalogue.categories[0] ?? null;

  const offered = selected?.items.filter((item) => item.isActive) ?? [];
  const missing = offered.filter((item) => !item.videoId).length;

  return (
    <>
      <PageHeader
        title="Tracing"
        description="Letters, numbers and patterns a child traces in the app — each one after its video."
      />

      <Card className="mb-5">
        <LiveSwitch
          on={catalogue.enabled}
          action={setTracingEnabledAction.bind(null, !catalogue.enabled)}
          label={catalogue.enabled ? 'Turn tracing off' : 'Turn tracing on'}
          onTitle="Tracing is on in every school’s app"
          offTitle="Tracing is off"
          onNote="The Tracing tile shows on the app’s home screen, with every category switched on below."
          offNote="The Tracing tile is gone from every school’s app and it cannot be opened. Nothing is deleted — the letters, videos and each child’s progress are all kept for when it is switched back on."
        />
      </Card>

      {selected && (
        <>
          <TabStrip
            current={selected.key}
            tabs={catalogue.categories.map((category) => ({
              key: category.key,
              label: category.name,
              href: `/publication/tracing?category=${category.key}`,
              badge: category.isActive ? category.items.filter((i) => i.isActive).length : 'off',
            }))}
          />

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <Card
              title={`${selected.name} · ${selected.label}`}
              description="In the order a child meets them. Paste each letter’s YouTube link; a letter with no video opens straight to tracing."
            >
              {missing > 0 && selected.isActive && (
                <div className="mb-4">
                  <Notice tone="warning">
                    {missing} of {offered.length} still {missing === 1 ? 'has' : 'have'} no video.
                    Children go straight to tracing for {missing === 1 ? 'that one' : 'those'}.
                  </Notice>
                </div>
              )}
              <ul>
                {selected.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
              <AddItemForm categoryId={selected.id} glyphs={catalogue.glyphs} />
            </Card>

            <div className="space-y-5">
              <Card>
                <LiveSwitch
                  on={selected.isActive}
                  action={setCategoryActiveAction.bind(null, selected.id, !selected.isActive)}
                  label={selected.isActive ? `Hide ${selected.name}` : `Offer ${selected.name}`}
                  onTitle="Offered in the app"
                  offTitle="Not offered"
                  onNote="Children see this category when they open Tracing."
                  offNote="Hidden from children. Switch it on once its videos are ready."
                />
              </Card>
              <Card title="Name and card">
                <CategoryForm key={selected.id} category={selected} />
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
