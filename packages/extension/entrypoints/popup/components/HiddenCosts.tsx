import type { SnapshotData } from '@paceline/shared';
import { formatUsd } from '../../../src/core/format';
import { hiddenCards } from '../../../src/ui/view';

export function HiddenCosts({ snapshot }: { snapshot: SnapshotData | null }) {
  if (!snapshot) return <p className="muted">Hidden costs need the local helper.</p>;
  if (!snapshot.hiddenCosts) {
    return (
      <p className="banner warn">
        Update the helper to see hidden costs: <code>npx paceline@latest install</code>
      </p>
    );
  }
  return (
    <ul className="hidden-costs" aria-label="Hidden costs">
      {hiddenCards(snapshot.hiddenCosts).map((c) => (
        <li key={c.id} className="hc-card">
          <span className="hc-head">
            <span className="hc-title">{c.title}</span>
            <span className="hc-usd">{c.spend ? `${formatUsd(c.usd)} spent` : `≈ ${formatUsd(c.usd)}`}</span>
          </span>
          <p>{c.sentence}</p>
          <p className="muted">{c.action}</p>
          {c.who.length > 0 && <p className="muted">Most from: {c.who.join(' · ')}</p>}
        </li>
      ))}
    </ul>
  );
}
