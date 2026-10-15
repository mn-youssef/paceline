import { habitSummary, type DailyUsage } from '../../src/core/habits';
import { habitCells } from '../../src/dashboard/model';
import { habitLine } from '../../src/ui/view';

export function HabitsStrip({ daily, budgetPct, now }: { daily: DailyUsage; budgetPct: number; now: number }) {
  const line = habitLine(habitSummary(daily, budgetPct, now));
  return (
    <section className="card habits">
      <h2>Daily budget</h2>
      <p>
        <span className={line.over ? 'tone-high' : undefined}>{line.today}</span>
        {line.streak && <span>{` · ${line.streak}`}</span>}
      </p>
      <ol className="strip" aria-label={`Last 30 days against your ${budgetPct}% daily budget`}>
        {habitCells(daily, budgetPct, now).map((c) => {
          const text = c.state === 'none' ? `${c.day}: no usage recorded` : `${c.day}: ${Math.round(c.used)}% of the weekly limit`;
          return <li key={c.day} className={`day day-${c.state}`} title={text} aria-label={text} />;
        })}
      </ol>
      <p className="strip-legend">
        <span>
          <i className="key day-under" /> within budget
        </span>
        <span>
          <i className="key day-over" /> over budget
        </span>
        <span>
          <i className="key day-none" /> no usage recorded
        </span>
      </p>
    </section>
  );
}
