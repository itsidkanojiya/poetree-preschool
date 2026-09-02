import { TabStrip } from '@/components/ui/tab-strip';

/**
 * The two halves of setting a class up.
 *
 * Subjects sit beside classrooms rather than in the sidebar: they are written
 * once at the start of a year and read on every timetable, which is a poor
 * reason to hold a place in a bar an office uses all day.
 */
export function ClassSetupTabs({ current }: { current: 'classrooms' | 'subjects' }) {
  return (
    <TabStrip
      current={current}
      tabs={[
        { key: 'classrooms', label: 'Classrooms', href: '/school/classrooms' },
        { key: 'subjects', label: 'Subjects', href: '/school/classrooms/subjects' },
      ]}
    />
  );
}
