import { TabStrip } from '@/components/ui/tab-strip';

export function ResultsTabs({ current }: { current: 'classes' | 'setup' }) {
  return (
    <TabStrip
      current={current}
      tabs={[
        { key: 'classes', label: 'Classes', href: '/school/results' },
        { key: 'setup', label: 'Setup', href: '/school/results/setup' },
      ]}
    />
  );
}
