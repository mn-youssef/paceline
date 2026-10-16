import { useMemo, useState } from 'react';
import type { DashboardProject } from '@paceline/shared';
import { formatTokens, formatUsd } from '../../src/core/format';
import { parseProjectBudget } from '../../src/core/settings';
import { budgetStatus, sortProjects, totalTokens, type ProjectSortKey } from '../../src/dashboard/projects';

const SORTABLE: { label: string; key: ProjectSortKey }[] = [
  { label: 'Total tokens', key: 'tokens' },
  { label: 'API value', key: 'value' },
  { label: 'Budget (this month)', key: 'budget' },
];

/** Saved when the field is left or on Enter; empty removes the budget. */
function BudgetCell({ project, budget, onChange }: { project: DashboardProject; budget: number | undefined; onChange: (name: string, budget: number | null) => void }) {
  const [text, setText] = useState(budget === undefined ? '' : String(budget));
  const commit = () => {
    const next = parseProjectBudget(text, budget ?? null);
    setText(next === null ? '' : String(next));
    if (next !== (budget ?? null)) onChange(project.name, next);
  };
  const status = budget ? budgetStatus(project.monthToDateUsd, budget) : null;
  return (
    <td className="budget-cell">
      <label>
        $
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={text}
          placeholder="none"
          aria-label={`Monthly budget for ${project.name}, in dollars`}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </label>
      {status ? (
        <>
          <span className={`budget-bar tone-${status.tone}`} aria-hidden="true">
            <span style={{ width: `${Math.min(status.share, 1) * 100}%` }} />
          </span>
          <span className={status.tone === 'over' ? 'budget-text over' : 'budget-text'}>{status.text}</span>
        </>
      ) : (
        <span className="budget-text muted">No budget</span>
      )}
    </td>
  );
}

export function ProjectsTable({
  projects,
  budgets,
  onBudgetChange,
}: {
  projects: DashboardProject[] | undefined;
  budgets: Record<string, number>;
  onBudgetChange: (name: string, budget: number | null) => void;
}) {
  const [sort, setSort] = useState<ProjectSortKey>('value');
  const rows = useMemo(() => sortProjects(projects ?? [], sort, budgets), [projects, sort, budgets]);

  if (!projects) {
    return (
      <p className="muted">
        Update the helper to see projects: <code>npx paceline@latest install</code>
      </p>
    );
  }
  if (projects.length === 0) return <p className="muted">No usage in this range or this month.</p>;

  const sortButton = (label: string, key: ProjectSortKey) => (
    <th key={key} scope="col" className={key === 'budget' ? undefined : 'num'} aria-sort={sort === key ? 'descending' : undefined}>
      <button type="button" onClick={() => setSort(key)}>
        {`${label}${sort === key ? ' ↓' : ''}`}
      </button>
    </th>
  );

  return (
    <div className="table-wrap">
      <table className="sessions-table projects-table">
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col" className="num">
              Sessions
            </th>
            <th scope="col" className="num">
              Input
            </th>
            <th scope="col" className="num">
              Output
            </th>
            <th scope="col" className="num">
              Cache write
            </th>
            <th scope="col" className="num">
              Cache read
            </th>
            {SORTABLE.map((c) => sortButton(c.label, c.key))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td className="num">{p.sessions}</td>
              <td className="num">{formatTokens(p.tokens.input)}</td>
              <td className="num">{formatTokens(p.tokens.output)}</td>
              <td className="num">{formatTokens(p.tokens.cacheWrite)}</td>
              <td className="num">{formatTokens(p.tokens.cacheRead)}</td>
              <td className="num">{formatTokens(totalTokens(p.tokens))}</td>
              <td className="num">{formatUsd(p.costUsd)}</td>
              <BudgetCell project={p} budget={budgets[p.name]} onChange={onBudgetChange} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
