import { PageHeader, Card } from '@/components/ui/layout';
import { NewSchoolForm } from './school-form';

export default function NewSchoolPage() {
  return (
    <>
      <PageHeader
        title="Add a school"
        description="Create the school first — its plan and administrator are set up on the next screen."
      />
      <Card>
        <NewSchoolForm />
      </Card>
    </>
  );
}
