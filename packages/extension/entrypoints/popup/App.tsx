import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { WindowKey } from '@paceline/shared';
import { consumeCelebration, requestRefresh } from '../../src/background/messages';
import type { RefreshOutcome } from '../../src/background/refresh';
import { openDashboard } from '../../src/platform/chrome';
import { fireConfetti } from '../../src/ui/confetti';
import { connLabel, limitsHint, sourceLabel } from '../../src/ui/view';
import { Gauges } from './components/Gauges';
import { HabitLine } from './components/HabitLine';
import { HiddenCosts } from './components/HiddenCosts';
import { Onboarding } from './components/Onboarding';
import { SessionList } from './components/SessionList';
import { WindowTabs } from './components/WindowTabs';

export function App() {
  const [selected, setSelected] = useState<WindowKey>('5h');
  const [outcome, setOutcome] = useState<RefreshOutcome | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<'sessions' | 'hidden'>('sessions');

  const load = useCallback(async (w: WindowKey) => {
    setOutcome(await requestRefresh(w));
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void load(selected);
  }, [selected, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Keep polling while the helper is missing (onboarding) or still indexing.
  useEffect(() => {
    if (!outcome) return;
    const waiting = outcome.conn === 'unreachable' || outcome.snapshot?.indexing === true;
    if (!waiting) return;
    const t = setTimeout(() => void load(selected), outcome.conn === 'unreachable' ? 2_000 : 3_000);
    return () => clearTimeout(t);
  }, [outcome, selected, load]);

  useEffect(() => {
    if (!outcome?.celebratePending) return;
    fireConfetti();
    void consumeCelebration();
  }, [outcome?.celebratePending]);

  if (!outcome) return <p className="loading">Loading…</p>;
  const hint = limitsHint(outcome.conn, outcome.limits);
  if (outcome.conn === 'unreachable' && outcome.limits.source !== 'claude-ai') return <Onboarding onRetry={() => void load(selected)} />;

  return (
    <main>
      <header className="top">
        <h1>Paceline</h1>
        <span className="chip-source">{sourceLabel(outcome.limits, now)}</span>
      </header>
      {outcome.conn === 'mismatch' && (
        <p className="banner warn">
          The helper needs an update. Run <code>npx paceline@latest install</code>
        </p>
      )}
      {outcome.conn === 'error' && <p className="banner warn">Helper error: {outcome.errorMessage}</p>}
      {outcome.snapshot?.indexing && <p className="banner info">Indexing your Claude Code history. Numbers will fill in shortly.</p>}
      {hint && <p className="banner info">{hint}</p>}
      <Gauges limits={outcome.limits} forecasts={outcome.forecasts} now={now} />
      {outcome.limits.source !== 'none' && <HabitLine habits={outcome.habits} />}
      <div className="switch" role="tablist" aria-label="Details">
        <button type="button" role="tab" aria-selected={view === 'sessions'} onClick={() => setView('sessions')}>
          Sessions
        </button>
        <button type="button" role="tab" aria-selected={view === 'hidden'} onClick={() => setView('hidden')}>
          Hidden costs
        </button>
      </div>
      <WindowTabs selected={selected} onSelect={setSelected} />
      {view === 'sessions' ? <SessionList snapshot={outcome.snapshot} now={now} /> : <HiddenCosts snapshot={outcome.snapshot} />}
      <footer>
        <div className="footer-actions">
          <button type="button" onClick={() => void openDashboard()}>
            Dashboard
          </button>
          <button type="button" onClick={() => void browser.runtime.openOptionsPage()}>
            Options
          </button>
        </div>
        <span className="muted">{connLabel(outcome.conn)}</span>
      </footer>
    </main>
  );
}
