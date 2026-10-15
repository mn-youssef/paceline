import { useState } from 'react';
import type { SessionSummary } from '@paceline/shared';
import { formatAgo, formatDuration, formatUsd } from '../../../src/core/format';
import { evidenceText, modelMix, topCategories } from '../../../src/ui/view';

export function SessionRow({ s, maxCost, now }: { s: SessionSummary; maxCost: number; now: number }) {
  const [open, setOpen] = useState(false);
  const tools = topCategories(s.tools);
  return (
    <li className="row">
      <button type="button" className="row-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="row-title">
          <span className="project" title={s.projectPath}>
            {s.projectName}
          </span>
          <span className="muted">
            {formatAgo(now - s.endedAt)} · {formatDuration(s.durationMin * 60_000)} · {s.turns} turns
          </span>
        </span>
        <span className="row-cost">
          {s.pricingEstimated ? '≈ ' : ''}
          {formatUsd(s.windowCostUsd)}
          {s.grade && (
            <span className={`grade grade-${s.grade}`} title={`Efficiency ${s.score ?? '?'}/100`}>
              {s.grade}
            </span>
          )}
        </span>
        <span className="bar" aria-hidden="true">
          <span style={{ width: `${Math.max(4, (s.windowCostUsd / maxCost) * 100)}%` }} />
        </span>
        <span className="mix" aria-hidden="true">
          {modelMix(s.models).map((m) => (
            <span key={m.family} className={`mix-${m.family}`} style={{ width: `${m.share * 100}%` }} />
          ))}
        </span>
        {s.tips.length > 0 && (
          <span className="chips">
            {s.tips.map((t) => (
              <span key={t.ruleId} className={`chip chip-${t.severity}`}>
                {t.title}
              </span>
            ))}
          </span>
        )}
      </button>
      {open && (
        <div className="row-body">
          {s.tips.length === 0 ? (
            <p className="muted">No waste patterns found in this session.</p>
          ) : (
            s.tips.map((t) => (
              <div key={t.ruleId} className="tip">
                <p>{t.message}</p>
                <p className="muted">
                  Could save ≈ {formatUsd(t.estSavingUsd)} · {evidenceText(t.evidence)}
                </p>
              </div>
            ))
          )}
          {tools && <p className="muted">Tool output: {tools}</p>}
        </div>
      )}
    </li>
  );
}
