import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeDashboardProject } from '@paceline/shared/fixtures';
import { ProjectsCard } from '../entrypoints/dashboard/ProjectsCard';

const noop = () => undefined;
const render = (budgets: Record<string, number> = {}, projects = [makeDashboardProject()]) =>
  renderToString(<ProjectsCard projects={projects} budgets={budgets} onBudgetChange={noop} />);

describe('ProjectsCard', () => {
  it('shows each project as a row, not a table with a budget column', () => {
    const html = render();
    expect(html).not.toContain('<table');
    expect(html).not.toContain('Budget (this month)');
    expect(html).toContain('<span class="project-name">my-app</span>');
    expect(html).toContain('1 session');
    expect(html).toContain('<span class="project-value">$3.20</span>');
  });

  it('splits the token bar by type and labels the total', () => {
    const html = render();
    for (const kind of ['tok-input', 'tok-output', 'tok-cache-write', 'tok-cache-read']) expect(html).toContain(kind);
    expect(html).toContain('title="cache read 2M"');
    expect(html).toContain('<span class="token-total">2.3M</span>');
    expect(html).toContain('aria-label="my-app: input 1k, output 20k, cache write 300k, cache read 2M, total 2.3M"');
  });

  it("shows this month's spend against a budget, inside the row", () => {
    const html = render({ 'my-app': 10 });
    expect(html).toContain('budget-track tone-over');
    expect(html).toContain('over by $2.00');
    expect(html).toContain('>Edit</button>');
  });

  it('offers to set a budget when there is none', () => {
    expect(render()).toContain('>Set budget</button>');
  });

  it('asks for a helper update when the helper sends no projects', () => {
    expect(renderToString(<ProjectsCard projects={undefined} budgets={{}} onBudgetChange={noop} />)).toContain('Update the helper to see projects');
  });
});
