import type { DashboardProject } from '@paceline/shared';

export const totalTokens = (t: DashboardProject['tokens']): number => t.input + t.output + t.cacheRead + t.cacheWrite;
