import { useState } from 'react';
import { browser } from 'wxt/browser';
import { PRIVACY_URL } from '../../../src/core/links';

const COMMAND = 'npx paceline install';

export function Onboarding({ onRetry }: { onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(COMMAND);
    setCopied(true);
  };
  return (
    <main className="onboarding">
      <h1>Connect Claude Code</h1>
      <p>Paceline reads your usage through a small local helper. Run this once in a terminal:</p>
      <div className="cmd">
        <code>{COMMAND}</code>
        <button type="button" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="muted">
        <span className="pulse" aria-hidden="true" />
        Waiting for the helper…{' '}
        <button type="button" className="link" onClick={onRetry}>
          Check again
        </button>
      </p>
      <p className="muted">
        Needs Node.js 18 or newer. Stuck? Run <code>npx paceline doctor</code>.
      </p>
      <p className="muted">
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
          What does the helper read?
        </a>
      </p>
      <p className="muted">
        Only want the limit %?{' '}
        <button type="button" className="link" onClick={() => void browser.runtime.openOptionsPage()}>
          Use your claude.ai session instead
        </button>
        .
      </p>
    </main>
  );
}
