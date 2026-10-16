import { Fragment, useId, useState, type ReactNode } from 'react';
import type { DashboardProject } from '@paceline/shared';
import { formatTokens, formatUsd } from '../../src/core/format';
import { modelBars, type Bar } from '../../src/dashboard/model';
import { percent, topEntries, totalTokens } from '../../src/dashboard/projects';

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
    <span className="token-row">
      <span className="token-track">
        <span className="token-bar" role="img" aria-label={`${project.name}: ${parts}, total ${formatTokens(total)}`} style={{ width: `${maxTotal > 0 ? (total / maxTotal) * 100 : 0}%` }}>
          {KINDS.filter((k) => project.tokens[k.key] > 0).map((k) => (
            <span key={k.key} className={k.cls} title={`${k.label} ${formatTokens(project.tokens[k.key])}`} style={{ flexGrow: project.tokens[k.key] }} />
          ))}
        </span>
      </span>
      <span className="token-total">{formatTokens(total)}</span>
    </span>
  );
}

interface Row {
  label: ReactNode;
  key: string;
  value: string;
  pct?: string;
}

function DetailList({ rows, empty, more = 0 }: { rows: Row[]; empty: string; more?: number }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="detail-list">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="dl-label">{r.label}</span>
          <span className="dl-value">{r.value}</span>
          <span className="dl-pct">{r.pct ?? ''}</span>
        </li>
      ))}
      {more > 0 && <li className="dl-more">{`+${more} more`}</li>}
    </ul>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="detail-block">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** Lets `plugin:skill` names wrap after the plugin name instead of inside a word. */
const wrapAfterColon = (name: string): ReactNode =>
  name.split(':').map((part, i, all) => (
    <Fragment key={i}>
      {i < all.length - 1 ? `${part}:` : part}
      {i < all.length - 1 && <wbr />}
    </Fragment>
  ));

const tokenRows = (bars: Bar[]): Row[] => bars.map((b) => ({ key: b.label, label: wrapAfterColon(b.label), value: formatTokens(b.value) }));

/** What the project's tokens and cost are made of. */
function ProjectDetails({ project }: { project: DashboardProject }) {
  const d = project.details;
  if (!d) {
    return (
      <p className="muted">
        Update the helper to see details: <code>npx paceline@latest install</code>
      </p>
    );
  }
  const total = totalTokens(project.tokens);
  const models = modelBars(d.byModel);
  const modelTotal = models.reduce((sum, m) => sum + m.value, 0);
  const tools = topEntries(d.tools, Object.keys(d.tools).length);
  const toolTotal = tools.items.reduce((sum, t) => sum + t.value, 0);
  const mcp = topEntries(d.mcp);
  const skills = topEntries(d.skills);
  return (
    <div className="detail-grid">
      <Block title="Tokens">
        <DetailList
          empty="No tokens."
          rows={KINDS.map((k) => ({
            key: k.key,
            label: (
              <>
                <span className={`swatch ${k.cls}`} />
                {k.label}
              </>
            ),
            value: formatTokens(project.tokens[k.key]),
            pct: percent(project.tokens[k.key], total),
          }))}
        />
      </Block>
      <Block title="Models">
        <DetailList empty="No models." rows={models.map((m) => ({ key: m.label, label: m.label, value: formatUsd(m.value), pct: percent(m.value, modelTotal) }))} />
      </Block>
      <Block title="Tools (tokens returned)">
        <DetailList empty="No tool output." rows={tools.items.map((t) => ({ key: t.label, label: t.label, value: formatTokens(t.value), pct: percent(t.value, toolTotal) }))} />
      </Block>
      <Block title="MCP servers">
        <DetailList empty="No MCP servers." rows={tokenRows(mcp.items)} more={mcp.more} />
      </Block>
      <Block title="Skills">
        <DetailList empty="No skills." rows={tokenRows(skills.items)} more={skills.more} />
      </Block>
      <Block title="Cache and subagents">
        <p>{d.cacheMisses > 0 ? `Expired ${d.cacheMisses}× · ${formatTokens(d.cacheMissTokens)} tokens written again` : 'Never expired'}</p>
        <p>{d.subagentCostUsd > 0 ? `Subagents: ${percent(d.subagentCostUsd, project.costUsd)} of the cost (${formatUsd(d.subagentCostUsd)})` : 'No subagents'}</p>
      </Block>
    </div>
  );
}

/** Projects used in the range, most expensive first (the helper sends them in that order). */
export function ProjectsCard({ projects }: { projects: DashboardProject[] | undefined }) {
  const baseId = useId();
  const [open, setOpen] = useState<string | null>(null);
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
          {projects.map((p, i) => {
            const expanded = open === p.name;
            const panelId = `${baseId}-details-${i}`;
            return (
              <li key={p.name} className="project">
                <button type="button" className="project-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? null : p.name)}>
                  <span className="project-head">
                    <span>
                      <span className="project-name">{p.name}</span>
                      <span className="project-meta">{` · ${p.sessions} session${p.sessions === 1 ? '' : 's'}`}</span>
                    </span>
                    <span className="project-end">
                      <span className="project-value">{formatUsd(p.costUsd)}</span>
                      <span className="chevron" aria-hidden="true" />
                    </span>
                  </span>
                  <TokenBar project={p} maxTotal={maxTotal} />
                </button>
                <div id={panelId} className="project-details" hidden={!expanded}>
                  <ProjectDetails project={p} />
                </div>
              </li>
            );
          })}
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
