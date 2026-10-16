import { formatUsd } from '../../../src/core/format';
import { OTHER, OTHER_KEY, type Stacked } from '../../../src/dashboard/model';

const W = 960;
const H = 220;
const LEFT = 48;
/** Room for the last day's label, which is centred on its bar. */
const RIGHT = 24;
const BOTTOM = 22;
const TOP = 10;
const RADIUS = 4;

/** A rectangle whose top corners are rounded: the data end of a stacked bar. */
export function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`;
}

const seriesClass = (key: string, i: number) => (key === OTHER_KEY ? 's-other' : `s-${i}`);

export function StackedBars({ stacked, label }: { stacked: Stacked; label: string }) {
  const max = Math.max(0, ...stacked.days.map((d) => d.values.reduce((s, v) => s + v, 0)));
  if (max === 0) return <p className="muted">No usage in this range.</p>;
  const plotH = H - TOP - BOTTOM;
  const slot = (W - LEFT - RIGHT) / stacked.days.length;
  const barW = Math.min(28, slot * 0.7);
  const last = stacked.days.length - 1;
  const every = stacked.days.length > 10 ? 5 : 1;
  return (
    <figure className="chart">
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} tabIndex={0}>
          <line className="gridline" x1={LEFT} x2={W - RIGHT} y1={TOP} y2={TOP} />
          <line className="axis" x1={LEFT} x2={W - RIGHT} y1={H - BOTTOM} y2={H - BOTTOM} />
          <text className="tick" x={LEFT - 6} y={TOP + 4} textAnchor="end">
            {formatUsd(max)}
          </text>
          <text className="tick" x={LEFT - 6} y={H - BOTTOM} textAnchor="end">
            $0
          </text>
          {stacked.days.map((d, i) => {
            const x = LEFT + i * slot + (slot - barW) / 2;
            const segs = d.values.map((v, s) => ({ v, s })).filter((p) => p.v > 0);
            let base = H - BOTTOM;
            return (
              <g key={d.day}>
                {segs.map(({ v, s }, k) => {
                  const h = (v / max) * plotH;
                  base -= h;
                  const name = stacked.series[s]?.name ?? OTHER;
                  const cls = `seg ${seriesClass(stacked.series[s]?.key ?? OTHER_KEY, s)}`;
                  const tip = <title>{`${d.day} · ${name}: ${formatUsd(v)}`}</title>;
                  return k === segs.length - 1 ? (
                    <path key={s} className={cls} d={roundedTop(x, base, barW, h, RADIUS)}>
                      {tip}
                    </path>
                  ) : (
                    <rect key={s} className={cls} x={x} y={base} width={barW} height={h}>
                      {tip}
                    </rect>
                  );
                })}
                {(i % every === 0 || i === last) && (
                  <text className="tick" x={x + barW / 2} y={H - 6} textAnchor="middle">
                    {d.day.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {/* The same numbers as a table, for screen readers. */}
      {/* A table ignores overflow, so the hiding goes on a wrapper. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {stacked.series.map((s) => (
                <th key={s.key} scope="col">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stacked.days.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                {d.values.map((v, i) => (
                  <td key={stacked.series[i]?.key ?? i}>{formatUsd(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="legend">
        {stacked.series.map((s, i) => (
          <li key={s.key}>
            <span className={`swatch ${seriesClass(s.key, i)}`} />
            <span className="legend-name">{s.name}</span>
            <span className="muted">{formatUsd(s.total)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
