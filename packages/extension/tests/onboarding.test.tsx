import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PRIVACY_URL } from '../src/core/links';

vi.mock('wxt/browser', () => ({ browser: { runtime: { openOptionsPage: () => undefined } } }));

const { Onboarding } = await import('../entrypoints/popup/components/Onboarding');

describe('Onboarding', () => {
  it('offers to check again and links to what the helper reads', () => {
    const html = renderToString(<Onboarding onRetry={() => undefined} />);
    expect(html).toContain('>Check again</button>');
    expect(html).toContain(`href="${PRIVACY_URL}"`);
  });
});
