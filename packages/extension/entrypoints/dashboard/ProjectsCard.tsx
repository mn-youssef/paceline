import { useMemo, useState } from 'react';
import type { DashboardProject } from '@paceline/shared';
import { formatTokens, formatUsd } from '../../src/core/format';
import { parseProjectBudget } from '../../src/core/settings';
import { budgetStatus, sortProjects, totalTokens, type ProjectSortKey } from '../../src/dashboard/projects';

const SORTS: { key: ProjectSortKey; label: string }[] = [
  { key: 'value', label: 'API value' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'budget', label: 'Budget' },
];

/** Token types in a fixed order, so each keeps its colour. */
const KINDS = [
  { key: 'input', label: 'input', cls: 'tok-input' },
  { key: 'output', label: 'output', cls: 'tok-output' },
  { key: 'cacheWrite', label: 'cache write', cls: 'tok-cache-write' },
  { key: 'cacheRead', label: 'cache read', cls: 'tok-cache-read' },
] as const;

/** One slim bar split by token type; its length compares the project with the largest one. */
function TokenBar({ project, maxTotal }: { project: DashboardProject; maxTotal: number }) {
  const total = totalTokens(project.tokens);
  const parts = KINDS.map((k) => `${k.label} ${formatTokens(project.tokens[k.key])}`).join(', ');
  return (
    <div className="token-row">
      <div className="token-track">
        <div className="token-bar" role="img" aria-label={`${project.name}: ${parts}, total ${formatTokens(total)}`} style={{ width: `${maxTotal > 0 ? (total / maxTotal) * 100 : 0}%` }}>
          {KINDS.filter((k) => project.tokens[k.key] > 0).map((k) => (
            <span key={k.key} className={k.cls} title={`${k.label} ${formatTokens(project.tokens[k.key])}`} style={{ flexGrow: project.tokens[k.key] }} />
          ))}
        </div>
      </div>
      <span className="token-total">{formatTokens(total)}</span>
    </div>
  );
}

/** This month against the budget, or a link to set one. The field saves on blur or Enter; empty removes the budget. */
function BudgetLine({ project, budget, onChange }: { project: DashboardProject; budget: number | undefined; onChange: (name: string, budget: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const open = () => {
    setText(budget === undefined ? '' : String(budget));
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = parseProjectBudget(text, budget ?? null);
    if (next !== (budget ?? null)) onChange(project.name, next);
  };

  if (editing) {
    return (
      <div className="budget-row">
        <label className="budget-input">
          Monthly budget $
          <input
            type="number"
            min={0}
            inputMode="decimal"
            autoFocus
            value={text}
            aria-label={`Monthly budget for ${project.name}, in dollars`}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        </label>
        <span className="muted">Leave empty to remove it.</span>
      </div>
    );
  }
  if (!budget) {
    return (
      <div className="budget-row">
        <button type="button" className="link-button" onClick={open}>
          Set budget
        </button>
      </div>
    );
  }
  const status = budgetStatus(project.monthToDateUsd, budget);
  return (
    <div className="budget-row">
      <span className={status.tone === 'over' ? 'budget-text over' : 'budget-text'}>{status.text}</span>
      <span className={`budget-track tone-${status.tone}`} aria-hidden="true">
        <span style={{ width: `${Math.min(status.share, 1) * 100}%` }} />
      </span>
      <button type="button" className="link-button" onClick={open} aria-label={`Edit the budget for ${project.name}`}>
        Edit
      </button>
    </div>
  );
}

export function ProjectsCard({
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
  const maxTotal = Math.max(0, ...rows.map((p) => totalTokens(p.tokens)));

  let body;
  if (!projects) {
    body = (
      <p className="muted">
        Update the helper to see projects: <code>npx paceline@latest install</code>
      </p>
    );
  } else if (projects.length === 0) {
    body = <p className="muted">No usage in this range or this month.</p>;
  } else {
    body = (
      <>
        <ul className="token-legend">
          {KINDS.map((k) => (
            <li key={k.key}>
              <span className={`swatch ${k.cls}`} />
              {k.label}
            </li>
          ))}
        </ul>
        <ul className="project-list">
          {rows.map((p) => (
            <li key={p.name} className="project">
              <div className="project-head">
                <span>
                  <span className="project-name">{p.name}</span>
                  <span className="project-meta">{` · ${p.sessions} session${p.sessions === 1 ? '' : 's'}`}</span>
                </span>
                <span className="project-value">{formatUsd(p.costUsd)}</span>
              </div>
              <TokenBar project={p} maxTotal={maxTotal} />
              <BudgetLine key={`${p.name}:${budgets[p.name] ?? ''}`} project={p} budget={budgets[p.name]} onChange={onBudgetChange} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section className="card projects-card">
      <div className="card-head">
        <h2>Projects</h2>
        {projects && projects.length > 0 && (
          <div className="tabs" role="group" aria-label="Sort projects by">
            {SORTS.map((s) => (
              <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {body}
    </section>
  );
}
