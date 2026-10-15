import type { DashboardData } from '@paceline/shared';
import { formatUsd } from '../core/format';
import { averageGrade, topCategory, topProject } from './model';

export const SHARE_W = 1200;
export const SHARE_H = 630;

export interface ShareCardModel {
  title: string;
  value: string;
  caption: string;
  facts: { label: string; value: string }[];
}

export function shareCardModel(data: DashboardData, streak: number, showProjects: boolean): ShareCardModel {
  const total = data.days.reduce((s, d) => s + d.costUsd, 0);
  const avg = averageGrade(data.sessions);
  const category = topCategory(data.byCategory);
  const project = showProjects ? topProject(data.days) : null;
  const facts = [{ label: 'Sessions', value: `${data.sessions.length}${data.truncated ? '+' : ''}` }];
  if (avg) facts.push({ label: 'Efficiency', value: avg.grade });
  if (streak > 0) facts.push({ label: 'Budget streak', value: `${streak} day${streak === 1 ? '' : 's'}` });
  if (category) facts.push({ label: 'Top tool', value: category });
  if (project) facts.push({ label: 'Top project', value: project });
  return {
    title: data.range === '7d' ? 'My week with Claude Code' : 'My month with Claude Code',
    value: total >= 10 ? `$${Math.round(total).toLocaleString('en-US')}` : formatUsd(total),
    caption: `of API value in the last ${data.range === '7d' ? 7 : 30} days`,
    facts,
  };
}

const font = (weight: number, px: number) => `${weight} ${px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;

export function drawShareCard(ctx: CanvasRenderingContext2D, m: ShareCardModel): void {
  const bg = ctx.createLinearGradient(0, 0, SHARE_W, SHARE_H);
  bg.addColorStop(0, '#1c1917');
  bg.addColorStop(1, '#7c2d12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fdba74';
  ctx.font = font(600, 36);
  ctx.fillText(m.title, 80, 120);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 150);
  ctx.fillText(m.value, 76, 290);
  ctx.fillStyle = '#d6d3d1';
  ctx.font = font(500, 36);
  ctx.fillText(m.caption, 80, 345);
  const colW = (SHARE_W - 160) / Math.max(1, m.facts.length);
  m.facts.forEach((f, i) => {
    const x = 80 + i * colW;
    ctx.fillStyle = '#a8a29e';
    ctx.font = font(500, 24);
    ctx.fillText(f.label.toUpperCase(), x, 470, colW - 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 46);
    ctx.fillText(f.value, x, 528, colW - 24);
  });
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fdba74';
  ctx.font = font(600, 24);
  ctx.fillText('Paceline · usage meter for Claude Code', SHARE_W - 80, 596);
}

export function renderShareCard(m: ShareCardModel): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is not available.'));
  drawShareCard(ctx, m);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card.'))), 'image/png'));
}
