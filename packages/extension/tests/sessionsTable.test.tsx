import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeDashboardSession } from '@paceline/shared/fixtures';
import { SessionsTable } from '../entrypoints/dashboard/SessionsTable';

describe('SessionsTable', () => {
  const rows = [
    makeDashboardSession({ sessionId: 'a', projectName: 'web', costUsd: 1, score: 90, grade: 'A' }),
    makeDashboardSession({ sessionId: 'b', projectName: 'shop', costUsd: 3, score: 45, grade: 'D', tips: [{ ruleId: 'long-context', title: 'Running at very long context' }] }),
  ];

  it('lists the most expensive session first with its grade and tips', () => {
    const html = renderToString(<SessionsTable rows={rows} truncated={false} />);
    expect(html.indexOf('>shop</td>')).toBeLessThan(html.indexOf('>web</td>'));
    expect(html).toContain('title="Efficiency 45/100">D</span>');
    expect(html).toContain('Running at very long context');
    expect(html).toContain('aria-sort="descending"');
    expect(html).not.toContain('most expensive sessions');
  });

  it('says when the list is capped', () => {
    expect(renderToString(<SessionsTable rows={rows} truncated />)).toContain('Showing the 500 most expensive sessions.');
  });
});
