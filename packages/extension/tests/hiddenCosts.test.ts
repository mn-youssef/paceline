import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeHiddenCosts, makeSnapshot } from '@paceline/shared/fixtures';
import { HiddenCosts } from '../entrypoints/popup/components/HiddenCosts';

describe('HiddenCosts view', () => {
  it('asks for a helper update when the snapshot has no hidden costs', () => {
    expect(renderToString(createElement(HiddenCosts, { snapshot: makeSnapshot() }))).toContain('Update the helper to see hidden costs');
  });

  it('renders one card per hidden cost', () => {
    const html = renderToString(createElement(HiddenCosts, { snapshot: makeSnapshot({ hiddenCosts: makeHiddenCosts() }) }));
    expect(html.match(/class="hc-card"/g)).toHaveLength(4);
    expect(html).toContain('$6.80 spent');
  });
});
