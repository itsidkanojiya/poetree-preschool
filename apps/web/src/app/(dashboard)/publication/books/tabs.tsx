import { TabStrip } from '@/components/ui/tab-strip';

/**
 * The two halves of the catalogue's shape.
 *
 * A standard only exists so a book can belong to one, and it is edited perhaps
 * twice a year — which is a poor reason to spend a place in the sidebar. It
 * lives beside the books instead, one click from them.
 */
export function CatalogueTabs({ current }: { current: 'books' | 'standards' }) {
  return (
    <TabStrip
      current={current}
      tabs={[
        { key: 'books', label: 'Books', href: '/publication/books' },
        { key: 'standards', label: 'Standards', href: '/publication/books/standards' },
      ]}
    />
  );
}
