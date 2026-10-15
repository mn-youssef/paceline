export interface FmtOpts {
  locale?: string;
  timeZone?: string;
}

const dayKey = (ts: number, o: FmtOpts) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: o.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);

/** "15:40" today, "Mon 09:00" on another day. */
export function formatClock(ts: number, now: number, o: FmtOpts = {}): string {
  const time = new Intl.DateTimeFormat(o.locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: o.timeZone }).format(ts);
  if (dayKey(ts, o) === dayKey(now, o)) return time;
  const weekday = new Intl.DateTimeFormat(o.locale, { weekday: 'short', timeZone: o.timeZone }).format(ts);
  return `${weekday} ${time}`;
}

/** Countdown text: "42m", "2h 05m", "3d 4h". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(total / 1_440);
  const hours = Math.floor((total % 1_440) / 60);
  const minutes = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

export function formatAgo(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatUsd(x: number): string {
  if (x >= 100) return `$${Math.round(x)}`;
  if (x >= 10) return `$${x.toFixed(1)}`;
  return `$${x.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}
