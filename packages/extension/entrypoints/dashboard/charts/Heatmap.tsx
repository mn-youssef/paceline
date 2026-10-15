import { formatUsd } from '../../../src/core/format';
import { heatLevel } from '../../../src/dashboard/model';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Rows run Monday to Sunday; the data is indexed 0 = Sunday. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const CELL = 22;
const GAP = 2;
const LEFT = 36;
const TOP = 16;
const W = LEFT + 24 * (CELL + GAP);
const H = TOP + 7 * (CELL + GAP);
const pad = (h: number) => String(h).padStart(2, '0');

export function Heatmap({ heatmap, label }: { heatmap: number[][]; label: string }) {
  const max = Math.max(0, ...heatmap.flat());
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} tabIndex={0}>
        {[0, 6, 12, 18].map((h) => (
          <text key={h} className="tick" x={LEFT + h * (CELL + GAP)} y={TOP - 4}>
            {`${pad(h)}:00`}
          </text>
        ))}
        {ORDER.map((wd, r) => (
          <g key={wd}>
            <text className="tick" x={LEFT - 6} y={TOP + r * (CELL + GAP) + CELL / 2 + 4} textAnchor="end">
              {DAY_NAMES[wd]}
            </text>
            {(heatmap[wd] ?? []).map((v, h) => (
              <rect key={h} className={`heat heat-${heatLevel(v, max)}`} x={LEFT + h * (CELL + GAP)} y={TOP + r * (CELL + GAP)} width={CELL} height={CELL} rx={4}>
                <title>{`${DAY_NAMES[wd]} ${pad(h)}:00 · ${formatUsd(v)}`}</title>
              </rect>
            ))}
          </g>
        ))}
      </svg>
    </figure>
  );
}
