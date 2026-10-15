import { useMemo, useState } from 'react';
import type { DashboardSession } from '@paceline/shared';
import { formatDuration, formatUsd } from '../../src/core/format';
import { localDayKey } from '../../src/core/habits';
import { sortSessions, toCsv, type SortKey } from '../../src/dashboard/model';

const COLUMNS: { label: string; sort: SortKey | null; numeric?: boolean }[] = [
  { label: 'Project', sort: null },
  { label: 'Started', sort: 'date' },
  { label: 'Duration', sort: 'duration', numeric: true },
  { label: 'Turns', sort: null, numeric: true },
  { label: 'API value', sort: 'cost', numeric: true },
  { label: 'Grade', sort: 'grade' },
  { label: 'Tips', sort: null },
];

const started = (ts: number) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function SessionsTable({ rows, truncated }: { rows: DashboardSession[]; truncated: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'cost', dir: 'desc' });
  const sorted = useMemo(() => sortSessions(rows, sort.key, sort.dir), [rows, sort]);

  // Exports exactly the rows shown, in the order shown. A Blob link needs no download permission.
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(sorted)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `paceline-sessions-${localDayKey(Date.now())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  if (rows.length === 0) return <p className="muted">No sessions in this range.</p>;
  return (
    <>
      <div className="table-actions">
        {truncated && <span className="muted">Showing the 500 most expensive sessions.</span>}
        <button type="button" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <div className="table-wrap">
        <table className="sessions-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const active = c.sort !== null && sort.key === c.sort;
                return (
                  <th key={c.label} scope="col" className={c.numeric ? 'num' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sort === null ? (
                      c.label
                    ) : (
                      <button type="button" onClick={() => setSort((s) => ({ key: c.sort!, dir: s.key === c.sort && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                        {`${c.label}${active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}`}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.sessionId}>
                <td>{s.projectName}</td>
                <td>{started(s.startedAt)}</td>
                <td className="num">{formatDuration(s.durationMin * 60_000)}</td>
                <td className="num">{s.turns}</td>
                <td className="num">{formatUsd(s.costUsd)}</td>
                <td>
                  <span className={`grade grade-${s.grade}`} title={`Efficiency ${s.score}/100`}>
                    {s.grade}
                  </span>
                </td>
                <td>{s.tips.map((t) => t.title).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
