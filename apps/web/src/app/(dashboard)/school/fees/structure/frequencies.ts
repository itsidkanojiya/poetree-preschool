/** How often a fee is charged, in the order the office reads them. */
export const FREQUENCIES = [
  { value: 'MONTHLY', label: 'Monthly', perYear: 12 },
  { value: 'QUARTERLY', label: 'Quarterly', perYear: 4 },
  { value: 'HALF_YEARLY', label: 'Half-yearly', perYear: 2 },
  { value: 'ANNUAL', label: 'Yearly', perYear: 1 },
  // Admission: once, in a child's first year at the school, with the first installment.
  { value: 'ONE_TIME', label: 'Once, for new children', perYear: 1 },
] as const;

export type FrequencyValue = (typeof FREQUENCIES)[number]['value'];

export const isFrequency = (value: string): value is FrequencyValue =>
  FREQUENCIES.some((f) => f.value === value);
