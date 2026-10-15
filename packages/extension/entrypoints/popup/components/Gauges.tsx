import { COLORS, colorFor } from '../../../src/core/badge';
import type { Forecast, Forecasts } from '../../../src/core/forecast';
import { formatDuration } from '../../../src/core/format';
import type { ResolvedLimits, WindowState } from '../../../src/core/limits';
import { forecastLine, paceLabel } from '../../../src/ui/view';

const R = 34;
const C = 2 * Math.PI * R;

function Ring({ label, w, forecast, now, stale }: { label: string; w: WindowState | null; forecast: Forecast | null; now: number; stale: boolean }) {
  const pct = w ? Math.min(100, Math.max(0, w.pct)) : 0;
  const shown = Math.round(pct);
  const color = !w || stale ? COLORS.grey : colorFor(shown);
  const caption = !w ? 'no data yet' : w.resetsAt !== null ? `resets in ${formatDuration(w.resetsAt - now)}` : 'fresh window';
  const line = stale ? null : forecastLine(forecast, now);
  const pace = stale ? null : paceLabel(forecast);
  return (
    <div className="gauge">
      <svg viewBox="0 0 84 84" role="img" aria-label={w ? `${label} limit: ${shown}% used` : `${label} limit: no data`}>
        <circle cx="42" cy="42" r={R} fill="none" stroke="var(--track)" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap={pct > 0 ? 'round' : 'butt'}
          strokeDasharray={`${(pct / 100) * C} ${C}`}
          transform="rotate(-90 42 42)"
        />
        <text x="42" y="48" textAnchor="middle" className="pct">
          {w ? `${shown}%` : '—'}
        </text>
      </svg>
      <span className="label">{label}</span>
      <span className="muted">{caption}</span>
      {line && <span className={`forecast tone-${line.tone}`}>{line.text}</span>}
      {pace && forecast && (
        <>
          <span className="pace" aria-hidden="true">
            <span className={`pace-bar pace-${forecast.paceLevel}`} style={{ width: `${Math.min(100, (forecast.paceRatio / 2) * 100)}%` }} />
          </span>
          <span className="muted">{pace}</span>
        </>
      )}
    </div>
  );
}

export function Gauges({ limits, forecasts, now }: { limits: ResolvedLimits; forecasts: Forecasts; now: number }) {
  const stale = limits.source === 'stale';
  return (
    <section className="gauges" aria-label="Usage limits">
      <Ring label="5-hour" w={limits.fiveHour} forecast={forecasts['5h']} now={now} stale={stale} />
      <Ring label="Weekly" w={limits.sevenDay} forecast={forecasts['7d']} now={now} stale={stale} />
    </section>
  );
}
