import type { Bar } from '../../../src/dashboard/model';

export function BarList({ items, format, label }: { items: Bar[]; format: (n: number) => string; label: string }) {
  if (items.length === 0) return <p className="muted">No data in this range.</p>;
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="barlist" aria-label={label}>
      {items.map((i) => (
        <li key={i.label}>
          <span className="bl-label">{i.label}</span>
          <span className="bl-track">
            <span className="bl-bar" style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <span className="bl-value">{format(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}
