import type { HabitSummary } from '../../../src/core/habits';
import { habitLine } from '../../../src/ui/view';

export function HabitLine({ habits }: { habits: HabitSummary }) {
  const line = habitLine(habits);
  return (
    <p className="habit-line">
      <span className={line.over ? 'tone-high' : undefined}>{line.today}</span>
      {line.streak && <span> · {line.streak}</span>}
    </p>
  );
}
