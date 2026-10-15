import { describe, expect, it } from 'vitest';
import { emptyTools, makeHiddenCosts } from '@paceline/shared/fixtures';
import { connLabel, evidenceText, familyOf, forecastLine, habitLine, hiddenCards, limitsHint, modelMix, paceLabel, sourceLabel, topCategories } from '../src/ui/view';

const NOW = Date.UTC(2026, 9, 13, 12, 0);

describe('view helpers', () => {
  it('groups model ids into families', () => {
    expect(['claude-opus-5-5', 'claude-sonnet-4-6', 'claude-haiku-5-5', 'claude-mythos-5-1', 'gpt-x'].map(familyOf)).toEqual(['opus', 'sonnet', 'haiku', 'fable', 'other']);
  });

  it('returns model-family cost shares, largest first', () => {
    expect(modelMix({ 'claude-opus-5-5': 6, 'claude-opus-5': 2, 'claude-sonnet-5-5': 2 })).toEqual([
      { family: 'opus', share: 0.8 },
      { family: 'sonnet', share: 0.2 },
    ]);
    expect(modelMix({})).toEqual([]);
  });

  it('turns tip evidence into one short line', () => {
    expect(evidenceText({ hours: 3, medianContext: 120_000, largestFile: '/repo/src/big.ts' })).toBe('hours 3 · median context 120k · largest file big.ts');
  });

  it('lists the heaviest tool categories', () => {
    const tools = emptyTools();
    tools.read.outputTokens = 60_000;
    tools.mcp.outputTokens = 48_000;
    tools.bash.outputTokens = 12_000;
    expect(topCategories(tools, 2)).toBe('read 60k · mcp 48k');
  });

  it('labels the connection and the data source', () => {
    expect(connLabel('mismatch')).toBe('Helper needs an update');
    expect(sourceLabel({ fiveHour: null, sevenDay: null, source: 'stale', updatedAt: NOW - 5 * 60_000 }, NOW)).toBe('updated 5 min ago');
    expect(sourceLabel({ fiveHour: null, sevenDay: null, source: 'claude-code', updatedAt: NOW }, NOW)).toBe('live from Claude Code');
  });

  it('explains missing or stale limit readings', () => {
    const none = { fiveHour: null, sevenDay: null, source: 'none' as const, updatedAt: null };
    const stale = { ...none, source: 'stale' as const, updatedAt: NOW - 20 * 60_000 };
    const live = { ...none, source: 'claude-code' as const, updatedAt: NOW };
    expect(limitsHint('ok', none)).toBe('No limit reading yet. Send a message in Claude Code in your terminal, or turn on the claude.ai fallback in Options.');
    expect(limitsHint('ok', stale)).toBe('Limits refresh when Claude Code runs in a terminal. Using the desktop app or an IDE? Turn on the claude.ai fallback in Options.');
    expect(limitsHint('ok', live)).toBeNull();
    expect(limitsHint('unreachable', none)).toBeNull();
  });
});

describe('forecast and hidden-cost views', () => {
  const FMT = { locale: 'en-GB', timeZone: 'UTC' };
  const f = (over: object) => ({ status: 'after-reset', slopePctPerHour: 10, etaAt: null, safePctPerHour: 20, paceRatio: 0.5, paceLevel: 'ok', ...over }) as never;

  it('describes the forecast under each gauge', () => {
    expect(forecastLine(f({ status: 'before-reset', etaAt: Date.UTC(2026, 9, 13, 15, 10) }), NOW, FMT)).toEqual({ text: 'full ≈ 15:10 ⚠', tone: 'high' });
    expect(forecastLine(f({ status: 'after-reset' }), NOW, FMT)).toEqual({ text: 'on pace ✓', tone: 'ok' });
    expect(forecastLine(f({ status: 'learning' }), NOW, FMT)).toEqual({ text: 'learning your pace…', tone: 'muted' });
    expect(forecastLine(f({ status: 'steady' }), NOW, FMT)).toEqual({ text: 'steady', tone: 'ok' });
    expect(forecastLine(f({ status: 'limited' }), NOW, FMT)).toEqual({ text: 'limit reached', tone: 'high' });
    expect(forecastLine(null, NOW, FMT)).toBeNull();
  });

  it('labels the pace only when there is a trend', () => {
    expect(paceLabel(f({ status: 'before-reset', paceRatio: 1.43 }))).toBe('1.4× safe pace');
    expect(paceLabel(f({ status: 'learning' }))).toBeNull();
  });

  it('turns hidden costs into cards, biggest likely saving first', () => {
    const cards = hiddenCards(makeHiddenCosts());
    // Subagents carry total spend ($6.80), so they sort by the ~30% that narrower tasks could save.
    expect(cards.map((c) => c.title)).toEqual(['Long context', 'Cache misses', 'Setup overhead', 'Subagents']);
    expect(cards.map((c) => c.sentence)).toEqual([
      '41% of turns ran above 150k context.',
      'You paused 9 times; restarts re-sent 1.1M tokens.',
      'my-app starts every message with 78k tokens: 14 MCP servers, CLAUDE.md 6k.',
      'Subagents used 34% of this window.',
    ]);
    expect(cards.map((c) => c.spend)).toEqual([false, false, false, true]);
    expect(cards[1]!.who).toEqual(['my-app $3.10']);
  });

  it('names what really drives setup overhead', () => {
    const setup = (mcpServers: number, claudeMdTokens: number) =>
      hiddenCards(makeHiddenCosts({ setupOverhead: { usd: 2.6, projects: [{ projectName: 'regx', projectPath: '/x/regx', setupTokens: 64_000, mcpServers, claudeMdTokens, usd: 2.6 }] } })).find(
        (c) => c.id === 'setupOverhead',
      )!;
    expect(setup(0, 338)).toMatchObject({
      sentence: 'regx starts every message with 64k tokens of built-in tools, plugins and skills.',
      action: "Turn off plugins and skills you don't use in this project.",
    });
    expect(setup(0, 9_000)).toMatchObject({ sentence: 'regx starts every message with 64k tokens: CLAUDE.md 9k.', action: 'Trim CLAUDE.md to what every task needs.' });
    expect(setup(5, 9_000).action).toBe('Disable MCP servers you do not use and trim CLAUDE.md.');
  });
});

describe('habitLine', () => {
  it('reads today against the budget and shows the streak only when there is one', () => {
    expect(habitLine({ todayPct: 9.4, budgetPct: 14, over: false, streak: 5 })).toEqual({ today: 'Today: 9% of 14%', over: false, streak: '🔥 5-day streak' });
    expect(habitLine({ todayPct: 16, budgetPct: 14, over: true, streak: 0 })).toEqual({ today: 'Today: 16% of 14%', over: true, streak: null });
  });
});
