import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeDashboardProject } from '@paceline/shared/fixtures';
import { ProjectsCard } from '../entrypoints/dashboard/ProjectsCard';

const render = (projects = [makeDashboardProject()]) => renderToString(<ProjectsCard projects={projects} />);

describe('ProjectsCard', () => {
  it('shows each project as a row with its sessions and API value', () => {
    const html = render();
    expect(html).not.toContain('<table');
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

  it('has no budget and no sort buttons', () => {
    const html = render();
    expect(html).not.toContain('Set budget');
    expect(html).not.toContain('budget');
    expect(html).not.toContain('<button');
  });

  it('asks for a helper update when the helper sends no projects', () => {
    expect(renderToString(<ProjectsCard projects={undefined} />)).toContain('Update the helper to see projects');
  });
});
