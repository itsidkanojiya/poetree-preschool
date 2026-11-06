import { TabStrip } from '@/components/ui/tab-strip';

/**
 * One place for children and their families.
 *
 * Parents used to be a section of their own, so finding a child's mother meant
 * leaving the child. Now the child's page holds the family; the Parents tab is
 * here for the accounts themselves — exporting them, switching sign-in on and
 * off — and Removed holds both the children and the parents to put back.
 */
export function StudentsSectionTabs({ current }: { current: 'children' | 'parents' | 'removed' }) {
  return (
    <TabStrip
      current={current}
      tabs={[
        { key: 'children', label: 'Children', href: '/school/students' },
        { key: 'parents', label: 'Parents', href: '/school/parents' },
        { key: 'removed', label: 'Removed', href: '/school/students?removed=true' },
      ]}
    />
  );
}
