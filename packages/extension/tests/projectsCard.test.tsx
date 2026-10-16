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
    expect(html).not.toContain('Sort');
  });

  it('makes each row a button that opens its details, closed at first', () => {
    const html = render([makeDashboardProject(), makeDashboardProject({ name: 'api' })]);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(controls).size).toBe(2);
    for (const id of controls) expect(html).toMatch(new RegExp(`<div[^>]*id="${id}"[^>]*hidden`));
  });

  it('details the tokens by type with their share', () => {
    const html = render();
    expect(html).toMatch(/cache read<\/span><span class="dl-value">2M<\/span><span class="dl-pct">86%/);
    expect(html).toMatch(/input<\/span><span class="dl-value">1k<\/span><span class="dl-pct">&lt;1%/);
  });

  it('details models, tools, MCP servers and skills', () => {
    const html = render();
    expect(html).toMatch(/Opus<\/span><span class="dl-value">\$2.80<\/span><span class="dl-pct">88%/);
    expect(html).toMatch(/read<\/span><span class="dl-value">120k</);
    expect(html).toMatch(/figma<\/span><span class="dl-value">40k</);
    // Plugin skills may wrap after the plugin name, never inside a word.
    expect(html).toMatch(/superpowers:<wbr\/>brainstorming<\/span><span class="dl-value">9k</);
    // Tools without tokens are left out.
    expect(html).not.toMatch(/>web<\/span>/);
  });

  it('sums up the cache and the subagents', () => {
    const html = render();
    expect(html).toContain('Expired 3× · 450k tokens written again');
    expect(html).toContain('25% of the cost ($0.80)');
  });

  it('says when there is nothing to show', () => {
    const p = makeDashboardProject();
    const html = render([{ ...p, details: { ...p.details!, mcp: {}, skills: {}, cacheMisses: 0, cacheMissTokens: 0, subagentCostUsd: 0 } }]);
    expect(html).toContain('No MCP servers');
    expect(html).toContain('No skills');
    expect(html).toContain('Never expired');
    expect(html).toContain('No subagents');
  });

  it('asks for a helper update when the helper sends no details', () => {
    expect(render([makeDashboardProject({ details: undefined })])).toContain('Update the helper to see details');
  });

  it('asks for a helper update when the helper sends no projects', () => {
    expect(renderToString(<ProjectsCard projects={undefined} />)).toContain('Update the helper to see projects');
  });
});
