import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeDashboardProject } from '@paceline/shared/fixtures';
import { ProjectsTable } from '../entrypoints/dashboard/ProjectsTable';

const noop = () => undefined;

describe('ProjectsTable', () => {
  it('lists each project with its tokens and API value', () => {
    const html = renderToString(<ProjectsTable projects={[makeDashboardProject()]} budgets={{}} onBudgetChange={noop} />);
    expect(html).toContain('>my-app</td>');
    expect(html).toContain('>2M</td>');
    expect(html).toContain('>$3.20</td>');
    expect(html).toContain('No budget');
  });

  it("shows this month's spend against the budget", () => {
    const html = renderToString(<ProjectsTable projects={[makeDashboardProject()]} budgets={{ 'my-app': 10 }} onBudgetChange={noop} />);
    expect(html).toContain('budget-bar tone-over');
    expect(html).toContain('over by $2.00');
  });

  it('asks for a helper update when the helper sends no projects', () => {
    const html = renderToString(<ProjectsTable projects={undefined} budgets={{}} onBudgetChange={noop} />);
    expect(html).toContain('Update the helper to see projects');
  });
});
