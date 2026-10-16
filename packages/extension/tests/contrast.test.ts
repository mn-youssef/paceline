import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('grade badges', () => {
  it('keep white 11 px text at WCAG AA contrast (4.5:1)', () => {
    const css = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
    const fills = [...css.matchAll(/\.grade-([A-F]) \{ background: (#[0-9a-f]{6}); \}/g)].map((m) => [m[1]!, m[2]!] as const);
    expect(fills.map(([g]) => g)).toEqual(['A', 'B', 'C', 'D', 'F']);
    for (const [grade, fill] of fills) expect(contrast(fill, '#ffffff'), `grade ${grade} ${fill}`).toBeGreaterThanOrEqual(4.5);
  });
});
