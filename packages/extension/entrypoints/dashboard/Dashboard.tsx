import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { dashboardDataSchema, type DashboardData, type DashboardRange } from '@paceline/shared';
import { formatTokens, formatUsd } from '../../src/core/format';
import type { DailyUsage } from '../../src/core/habits';
import { mergeSettings, type Settings } from '../../src/core/settings';
import { categoryBars, modelBars, planComparison, stackByProject } from '../../src/dashboard/model';
import { chromeSend, chromeStore } from '../../src/platform/chrome';
import { callHost, type NativeResult } from '../../src/platform/native';
import { BarList } from './charts/BarList';
import { Heatmap } from './charts/Heatmap';
import { StackedBars } from './charts/StackedBars';
import { HabitsStrip } from './HabitsStrip';
import { SessionsTable } from './SessionsTable';

const RANGE_LABEL: Record<DashboardRange, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days' };

function problem(res: Extract<NativeResult<unknown>, { ok: false }>): string {
  if (res.kind === 'unreachable') return 'The Paceline helper is not reachable. Open the Paceline popup for setup steps.';
  if (res.kind === 'mismatch') return 'The helper needs an update. Run npx paceline@latest install';
  return `Helper error: ${res.message}`;
}

export interface DashboardView {
  data: DashboardData;
  settings: Settings;
  daily: DailyUsage;
}

export function Dashboard({ actions }: { actions?: (view: DashboardView) => ReactNode }) {
  const [range, setRange] = useState<DashboardRange>('7d');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [daily, setDaily] = useState<DailyUsage>({});

  useEffect(() => {
    void (async () => {
      setSettings(mergeSettings(await chromeStore.get('settings')));
      setDaily((await chromeStore.get('dailyUsage')) ?? {});
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const res = await callHost(chromeSend, { type: 'dashboard', range }, dashboardDataSchema);
      if (cancelled) return;
      if (!res.ok) {
        setError(problem(res));
        return;
      }
      setError(null);
      setData(res.data);
      // While the helper is still indexing, ask again until the numbers are complete.
      if (res.data.indexing) timer = setTimeout(() => void load(), 3_000);
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [range]);

  const stacked = useMemo(() => (data ? stackByProject(data.days) : null), [data]);

  return (
    <main className="dash">
      <header className="dash-head">
        <h1>Paceline dashboard</h1>
        <div className="tabs" role="tablist" aria-label="Range">
          {(Object.keys(RANGE_LABEL) as DashboardRange[]).map((r) => (
            <button key={r} type="button" role="tab" aria-selected={range === r} onClick={() => setRange(r)}>
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        {data && settings && actions?.({ data, settings, daily })}
      </header>
      {error && <p className="banner warn">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && settings && stacked && (
        <>
          {data.indexing && <p className="banner info">Indexing your Claude Code history. Numbers will fill in shortly.</p>}
          <div className="cards">
            <section className="card value-card">
              <h2>Value</h2>
              <p className="value">{planComparison(data.monthToDateUsd, settings.plan)}</p>
              <p className="muted">API value is what these tokens would cost at Anthropic's API prices, not what you pay.</p>
            </section>
            <HabitsStrip daily={daily} budgetPct={settings.dailyBudgetPct} now={Date.now()} />
          </div>
          <section className="card">
            <h2>Daily API value by project</h2>
            <StackedBars stacked={stacked} label={`Daily API value by project, ${RANGE_LABEL[data.range].toLowerCase()}`} />
          </section>
          <div className="cards">
            <section className="card">
              <h2>Models</h2>
              <BarList items={modelBars(data.byModel)} format={formatUsd} label="API value by model" />
            </section>
            <section className="card">
              <h2>Tool output</h2>
              <BarList items={categoryBars(data.byCategory)} format={formatTokens} label="Tool output tokens by category" />
            </section>
          </div>
          <section className="card">
            <h2>When you use Claude Code</h2>
            <Heatmap heatmap={data.heatmap} label="API value by weekday and hour" />
          </section>
          <section className="card">
            <h2>Sessions</h2>
            <SessionsTable rows={data.sessions} truncated={data.truncated} />
          </section>
        </>
      )}
    </main>
  );
}
