import type { SnapshotData } from '@paceline/shared';
import { formatUsd } from '../../../src/core/format';
import { SessionRow } from './SessionRow';

export function SessionList({ snapshot, now }: { snapshot: SnapshotData | null; now: number }) {
  const sessions = snapshot?.topSessions ?? [];
  const maxCost = sessions.reduce((m, s) => Math.max(m, s.windowCostUsd), 0.01);
  return (
    <section className="sessions-section" aria-label="Top sessions">
      {snapshot && (
        <p className="muted">
          ≈ {formatUsd(snapshot.totals.costUsd)} API value · {snapshot.totals.sessions} session{snapshot.totals.sessions === 1 ? '' : 's'}
        </p>
      )}
      {!snapshot ? (
        <p className="muted">Session details need the local helper.</p>
      ) : sessions.length === 0 ? (
        <p className="muted">No Claude Code sessions in this window.</p>
      ) : (
        <ul className="sessions">
          {sessions.map((s) => (
            <SessionRow key={s.sessionId} s={s} maxCost={maxCost} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
