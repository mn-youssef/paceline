import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BarList } from '../entrypoints/dashboard/charts/BarList';
import { Heatmap } from '../entrypoints/dashboard/charts/Heatmap';
import { StackedBars } from '../entrypoints/dashboard/charts/StackedBars';
import { formatUsd } from '../src/core/format';
import { stackByProject } from '../src/dashboard/model';

describe('StackedBars', () => {
  const stacked = stackByProject([
    { day: '2026-10-12', costUsd: 3, sessions: 2, byProject: { shop: 2, web: 1 } },
    { day: '2026-10-13', costUsd: 0, sessions: 0, byProject: {} },
  ]);

  it('draws one labelled segment per project and day, rounding only the top one', () => {
    const html = renderToString(<StackedBars stacked={stacked} label="Daily API value by project" />);
    expect(html).toContain('aria-label="Daily API value by project"');
    expect(html.match(/class="seg /g)).toHaveLength(2);
    expect(html.match(/<path class="seg /g)).toHaveLength(1);
    expect(html).toContain('<title>2026-10-12 · shop: $2.00</title>');
    expect(html).toContain('>10-13</text>');
  });

  it('lists each project with its total in the legend', () => {
    const html = renderToString(<StackedBars stacked={stacked} label="x" />);
    expect(html).toContain('<span class="legend-name">shop</span><span class="muted">$2.00</span>');
  });

  it('keeps the last day label inside the chart', () => {
    const month = stackByProject(Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, costUsd: 1, sessions: 1, byProject: { a: 1 } })));
    const html = renderToString(<StackedBars stacked={month} label="x" />);
    const width = Number(/viewBox="0 0 (\d+) /.exec(html)![1]);
    const lastX = Number(/x="([\d.]+)"[^>]*>10-30<\/text>/.exec(html)![1]);
    expect(lastX).toBeLessThanOrEqual(width - 20);
  });

  it('says so when the range has no use', () => {
    expect(renderToString(<StackedBars stacked={stackByProject([])} label="x" />)).toContain('No usage in this range.');
  });
});

describe('Heatmap', () => {
  it('runs Monday to Sunday and shades the busiest hour darkest', () => {
    const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    heatmap[1]![23] = 2;
    heatmap[0]![9] = 1;
    const html = renderToString(<Heatmap heatmap={heatmap} label="API value by weekday and hour" />);
    expect(html.indexOf('>Mon</text>')).toBeLessThan(html.indexOf('>Sun</text>'));
    expect(html).toContain('<rect class="heat heat-5"');
    expect(html).toContain('<title>Mon 23:00 · $2.00</title>');
    expect(html.match(/heat-0/g)).toHaveLength(7 * 24 - 2);
  });
});

describe('BarList', () => {
  it('scales bars to the largest value and prints every value', () => {
    const html = renderToString(<BarList items={[{ label: 'Opus', value: 4 }, { label: 'Sonnet', value: 1 }]} format={formatUsd} label="API value by model" />);
    expect(html).toContain('width:100%');
    expect(html).toContain('width:25%');
    expect(html).toContain('<span class="bl-value">$4.00</span>');
  });

  it('says so when there is nothing to show', () => {
    expect(renderToString(<BarList items={[]} format={formatUsd} label="x" />)).toContain('No data in this range.');
  });
});

describe('chart sizing', () => {
  it('draws SVG charts at their natural width so labels are never scaled up', () => {
    const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(1));
    const day = { day: '2026-10-12', costUsd: 1, sessions: 1, byProject: { a: 1 } };
    for (const html of [renderToString(<Heatmap heatmap={heatmap} label="x" />), renderToString(<StackedBars stacked={stackByProject([day])} label="x" />)]) {
      const [, w] = /viewBox="0 0 (\d+) \d+"/.exec(html)!;
      expect(html).toContain(`width="${w}"`);
    }
  });
});

describe('StackedBars with a project named Other', () => {
  it('keeps the real project and the fold-in as separate legend entries', () => {
    const stacked = stackByProject([{ day: '2026-10-12', costUsd: 30, sessions: 1, byProject: { Other: 9, a: 6, b: 5, c: 4, d: 3, e: 2, f: 1 } }]);
    const html = renderToString(<StackedBars stacked={stacked} label="x" />);
    expect(html.match(/<span class="legend-name">Other<\/span>/g)).toHaveLength(2);
    expect(html.match(/swatch s-other/g)).toHaveLength(1);
  });
});

describe('chart data for screen readers', () => {
  it('gives the stacked bars a hidden table with one row per day', () => {
    const stacked = stackByProject([
      { day: '2026-10-12', costUsd: 3, sessions: 2, byProject: { shop: 2, web: 1 } },
      { day: '2026-10-13', costUsd: 0, sessions: 0, byProject: {} },
    ]);
    const html = renderToString(<StackedBars stacked={stacked} label="Daily API value by project" />);
    expect(html).toContain('<div class="sr-only"><table>');
    expect(html).toContain('<caption>Daily API value by project</caption>');
    expect(html).toContain('<th scope="row">2026-10-12</th><td>$2.00</td><td>$1.00</td>');
  });

  it('gives the heatmap a hidden table with one row per weekday', () => {
    const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    heatmap[1]![23] = 2;
    const html = renderToString(<Heatmap heatmap={heatmap} label="API value by weekday and hour" />);
    expect(html).toContain('<div class="sr-only"><table>');
    const monday = /<tr><th scope="row">Mon<\/th>(.*?)<\/tr>/.exec(html)![1]!;
    expect(monday.match(/<td>/g)).toHaveLength(24);
    expect(monday.endsWith('<td>$2.00</td>')).toBe(true);
  });
});
