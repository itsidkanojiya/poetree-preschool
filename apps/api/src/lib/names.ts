/**
 * A child's name, the way it is written on a form in an Indian school:
 * given name, father's name, surname — "Dishan Krunal Patel".
 *
 * The middle part is a person, not a spelling: it is the father's given name,
 * which is how two children called Dishan Patel are told apart on a register
 * and on an ID card. Stored as its own column for the same reason, rather than
 * being run into the surname where nothing could ever separate it again.
 *
 * One function because eighteen places used to join these by hand, and a child
 * whose name printed in full on an ID card and in half on a receipt is the kind
 * of thing nobody reports and everybody notices.
 */
export function studentName(student: {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [student.firstName, student.middleName, student.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
}
