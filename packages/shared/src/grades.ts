import type { Grade } from './protocol';

/** Sessions cheaper than this are too small to judge and score 100. */
export const GRADE_MIN_COST_USD = 0.1;

export function gradeFor(score: number): Grade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
