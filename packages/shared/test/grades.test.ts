import { describe, expect, it } from 'vitest';
import { gradeFor } from '../src/grades';

describe('gradeFor', () => {
  it('maps scores to letters at the spec cut-offs', () => {
    expect([100, 85, 84, 70, 69, 55, 54, 40, 39, 0].map(gradeFor)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'F', 'F']);
  });
});
