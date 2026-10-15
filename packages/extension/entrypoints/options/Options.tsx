import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { CLAUDE_AI_ORIGIN } from '@paceline/shared';
import { requestRefresh } from '../../src/background/messages';
import { mergeSettings, parseThresholds, type BadgeWindow, type Plan, type Settings } from '../../src/core/settings';
import { chromeStore } from '../../src/platform/chrome';
import type { FallbackStatus } from '../../src/platform/fallback';

export function Options() {
  const [s, setS] = useState<Settings | null>(null);
  const [thresholdText, setThresholdText] = useState('');
  const [permitted, setPermitted] = useState(false);
  const [status, setStatus] = useState<FallbackStatus | null>(null);

  useEffect(() => {
    void (async () => {
      const loaded = mergeSettings(await chromeStore.get('settings'));
      setS(loaded);
      setThresholdText(loaded.thresholds.join(', '));
      setPermitted(await browser.permissions.contains({ origins: [CLAUDE_AI_ORIGIN] }));
      setStatus((await chromeStore.get('fallbackStatus')) ?? null);
    })();
  }, []);

  if (!s) return null;

  const save = async (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    await chromeStore.set({ settings: next });
    void requestRefresh('5h');
  };

  // permissions.request must run inside the click, before any other await.
  const toggleFallback = async (on: boolean) => {
    if (on) {
      const granted = await browser.permissions.request({ origins: [CLAUDE_AI_ORIGIN] });
      setPermitted(granted);
      if (!granted) return;
    }
    await save({ fallbackEnabled: on });
  };

  const commitThresholds = () => {
    const thresholds = parseThresholds(thresholdText);
    setThresholdText(thresholds.join(', '));
    void save({ thresholds });
  };

  return (
    <main className="options">
      <h1>Paceline options</h1>

      <section>
        <h2>Alerts</h2>
        <label>
          Notify me at
          <input value={thresholdText} onChange={(e) => setThresholdText(e.target.value)} onBlur={commitThresholds} aria-describedby="thresholds-help" />% used
        </label>
        <p id="thresholds-help" className="muted">
          Comma-separated, for example 50, 80, 95.
        </p>
        <label>
          <input type="checkbox" checked={s.notifications} onChange={(e) => void save({ notifications: e.target.checked })} />
          Show notifications
        </label>
        <label>
          <input type="checkbox" checked={s.paceAlerts} onChange={(e) => void save({ paceAlerts: e.target.checked })} />
          Warn me when I'm on pace to hit a limit
        </label>
        <label>
          <input type="checkbox" checked={s.weeklyDigest} onChange={(e) => void save({ weeklyDigest: e.target.checked })} />
          Send me a weekly digest on Monday morning
        </label>
        <label>
          <input type="checkbox" checked={s.quietHours.enabled} onChange={(e) => void save({ quietHours: { ...s.quietHours, enabled: e.target.checked } })} />
          Quiet hours from
          <input type="time" value={s.quietHours.start} onChange={(e) => void save({ quietHours: { ...s.quietHours, start: e.target.value } })} />
          to
          <input type="time" value={s.quietHours.end} onChange={(e) => void save({ quietHours: { ...s.quietHours, end: e.target.value } })} />
        </label>
        <label>
          Celebrate a reset when I had used at least
          <input
            type="number"
            min={0}
            max={100}
            value={s.celebrationThreshold}
            onChange={(e) => void save({ celebrationThreshold: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
          />
          %
        </label>
      </section>

      <section>
        <h2>Badge</h2>
        <label>
          The badge shows
          <select value={s.badgeWindow} onChange={(e) => void save({ badgeWindow: e.target.value as BadgeWindow })}>
            <option value="higher">whichever limit is higher</option>
            <option value="5h">the 5-hour limit</option>
            <option value="7d">the weekly limit</option>
          </select>
        </label>
      </section>

      <section>
        <h2>
          claude.ai fallback <span className="tag">unofficial</span>
        </h2>
        <p>
          When Claude Code hasn't reported your limits for 15 minutes, read them from your signed-in claude.ai session instead. This uses an
          undocumented claude.ai endpoint and may stop working without notice. Only your limit percentages are read.
        </p>
        <label>
          <input type="checkbox" checked={s.fallbackEnabled && permitted} onChange={(e) => void toggleFallback(e.target.checked)} />
          Use my claude.ai session
        </label>
        {s.fallbackEnabled && status?.reason && <p className="warn">Last attempt failed: {status.reason}. Paceline will retry later.</p>}
      </section>

      <section>
        <h2>Habits</h2>
        <label>
          Daily budget
          <input
            type="number"
            min={1}
            max={100}
            value={s.dailyBudgetPct}
            onChange={(e) => void save({ dailyBudgetPct: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
          />
          % of the weekly limit
        </label>
        <label>
          My plan
          <select value={s.plan} onChange={(e) => void save({ plan: e.target.value as Plan })}>
            <option value="pro">Pro ($20/month)</option>
            <option value="max5">Max 5x ($100/month)</option>
            <option value="max20">Max 20x ($200/month)</option>
            <option value="api">API (pay as you go)</option>
          </select>
        </label>
      </section>

      <section>
        <h2>Privacy</h2>
        <p className="muted">
          Paceline has no servers and collects nothing. Session analysis runs on your computer in the local helper; the extension only receives
          numbers, model names, tool names and file paths.
        </p>
        <label>
          <input type="checkbox" checked={s.shareShowProjects} onChange={(e) => void save({ shareShowProjects: e.target.checked })} />
          Show my top project's name on share cards
        </label>
      </section>
    </main>
  );
}
