export const round1 = (x: number): number => Math.round(x * 10) / 10;
export const round2 = (x: number): number => Math.round(x * 100) / 100;
export const pct = (share: number): number => Math.round(share * 100);
export const hours = (minutes: number): string => String(round1(minutes / 60));

/** 950 → "950", 42_000 → "42k", 1_250_000 → "1.3M". */
export function k(n: number): string {
  if (n >= 1_000_000) return `${round1(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}
