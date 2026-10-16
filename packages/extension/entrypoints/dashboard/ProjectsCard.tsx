import type { DashboardProject } from '@paceline/shared';
import { formatTokens, formatUsd } from '../../src/core/format';
import { totalTokens } from '../../src/dashboard/projects';

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

/** Projects used in the range, most expensive first (the helper sends them in that order). */
export function ProjectsCard({ projects }: { projects: DashboardProject[] | undefined }) {
  let body;
  if (!projects) {
    body = (
      <p className="muted">
        Update the helper to see projects: <code>npx paceline@latest install</code>
      </p>
    );
  } else if (projects.length === 0) {
    body = <p className="muted">No usage in this range.</p>;
  } else {
    const maxTotal = Math.max(0, ...projects.map((p) => totalTokens(p.tokens)));
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
          {projects.map((p) => (
            <li key={p.name} className="project">
              <div className="project-head">
                <span>
                  <span className="project-name">{p.name}</span>
                  <span className="project-meta">{` · ${p.sessions} session${p.sessions === 1 ? '' : 's'}`}</span>
                </span>
                <span className="project-value">{formatUsd(p.costUsd)}</span>
              </div>
              <TokenBar project={p} maxTotal={maxTotal} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section className="card projects-card">
      <h2>Projects</h2>
      {body}
    </section>
  );
}
