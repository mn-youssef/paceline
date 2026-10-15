import type { WindowKey } from '@paceline/shared';

const TABS: { key: WindowKey; label: string }[] = [
  { key: '5h', label: 'Last 5h' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7 days' },
];

export function WindowTabs({ selected, onSelect }: { selected: WindowKey; onSelect: (w: WindowKey) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label="Time window">
      {TABS.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === selected} onClick={() => onSelect(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
