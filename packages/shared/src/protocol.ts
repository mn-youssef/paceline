import { z } from 'zod';

export const windowKeySchema = z.enum(['5h', '24h', '7d']);
export type WindowKey = z.infer<typeof windowKeySchema>;

/** One limit window. `resetsAt` is epoch milliseconds. */
export const rateWindowSchema = z.object({ usedPct: z.number(), resetsAt: z.number() });
export type RateWindow = z.infer<typeof rateWindowSchema>;

export const liveCaptureSchema = z.object({
  capturedAt: z.number(),
  sessionId: z.string().nullable(),
  model: z.string().nullable(),
  fiveHour: rateWindowSchema.nullable(),
  sevenDay: rateWindowSchema.nullable(),
});
export type LiveCapture = z.infer<typeof liveCaptureSchema>;

export const liveStateSchema = z.object({
  lastSeenAt: z.number().nullable(),
  capture: liveCaptureSchema.nullable(),
});
export type LiveState = z.infer<typeof liveStateSchema>;

export const TOOL_CATEGORIES = ['read', 'edit', 'bash', 'search', 'web', 'mcp', 'agent', 'other'] as const;
export const toolCategorySchema = z.enum(TOOL_CATEGORIES);
export type ToolCategory = z.infer<typeof toolCategorySchema>;

export const toolStatSchema = z.object({ calls: z.number(), outputTokens: z.number(), residencyUsd: z.number() });
export type ToolStat = z.infer<typeof toolStatSchema>;

export const tipSeveritySchema = z.enum(['info', 'warn', 'high']);
export type TipSeverity = z.infer<typeof tipSeveritySchema>;

export const tipSchema = z.object({
  ruleId: z.string(),
  severity: tipSeveritySchema,
  title: z.string(),
  message: z.string(),
  evidence: z.record(z.string(), z.union([z.number(), z.string()])),
  estSavingUsd: z.number(),
});
export type Tip = z.infer<typeof tipSchema>;

export const gradeSchema = z.enum(['A', 'B', 'C', 'D', 'F']);
export type Grade = z.infer<typeof gradeSchema>;

export const sessionSummarySchema = z.object({
  sessionId: z.string(),
  projectPath: z.string(),
  projectName: z.string(),
  entrypoint: z.string().nullable(),
  startedAt: z.number(),
  endedAt: z.number(),
  durationMin: z.number(),
  activeMin: z.number(),
  turns: z.number(),
  costUsd: z.number(),
  windowCostUsd: z.number(),
  subagentCostUsd: z.number(),
  models: z.record(z.string(), z.number()),
  tokens: z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number() }),
  peakContext: z.number(),
  medianContext: z.number(),
  compactions: z.number(),
  tools: z.record(toolCategorySchema, toolStatSchema),
  mcpServers: z.record(z.string(), toolStatSchema),
  tips: z.array(tipSchema),
  pricingEstimated: z.boolean(),
  score: z.number().optional(),
  grade: gradeSchema.optional(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const totalsSchema = z.object({
  costUsd: z.number(),
  sessions: z.number(),
  byModel: z.record(z.string(), z.number()),
  byCategory: z.record(toolCategorySchema, z.number()),
});
export type Totals = z.infer<typeof totalsSchema>;

export const contributorSchema = z.object({ sessionId: z.string(), projectName: z.string(), usd: z.number() });
export type Contributor = z.infer<typeof contributorSchema>;

export const hiddenCostsSchema = z.object({
  cacheMisses: z.object({ count: z.number(), tokens: z.number(), usd: z.number(), sessions: z.array(contributorSchema) }),
  setupOverhead: z.object({
    usd: z.number(),
    projects: z.array(
      z.object({
        projectName: z.string(),
        projectPath: z.string(),
        setupTokens: z.number(),
        mcpServers: z.number(),
        claudeMdTokens: z.number(),
        usd: z.number(),
      }),
    ),
  }),
  subagents: z.object({ usd: z.number(), share: z.number(), sessions: z.array(contributorSchema) }),
  longContext: z.object({ turns: z.number(), share: z.number(), usd: z.number(), sessions: z.array(contributorSchema) }),
});
export type HiddenCosts = z.infer<typeof hiddenCostsSchema>;

export const snapshotDataSchema = z.object({
  live: liveStateSchema,
  topSessions: z.array(sessionSummarySchema),
  totals: totalsSchema,
  indexing: z.boolean(),
  truncated: z.boolean(),
  // Optional so a pre-M2 helper still satisfies a newer extension.
  hiddenCosts: hiddenCostsSchema.optional(),
});
export type SnapshotData = z.infer<typeof snapshotDataSchema>;

export const pingDataSchema = z.object({
  helperVersion: z.string(),
  protocol: z.number(),
  statusLineInstalled: z.boolean(),
  lastStatusLineAt: z.number().nullable(),
});
export type PingData = z.infer<typeof pingDataSchema>;

export const dashboardRangeSchema = z.enum(['7d', '30d']);
export type DashboardRange = z.infer<typeof dashboardRangeSchema>;

export const hostRequestSchema = z.discriminatedUnion('type', [
  z.object({ v: z.number(), id: z.string(), type: z.literal('ping') }),
  z.object({ v: z.number(), id: z.string(), type: z.literal('snapshot'), window: windowKeySchema }),
  z.object({ v: z.number(), id: z.string(), type: z.literal('dashboard'), range: dashboardRangeSchema }),
]);
export type HostRequest = z.infer<typeof hostRequestSchema>;

export const errorCodeSchema = z.enum(['PROTOCOL_MISMATCH', 'BAD_REQUEST', 'INTERNAL']);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const hostResponseSchema = z.union([
  z.object({ v: z.number(), id: z.string(), ok: z.literal(true), data: z.unknown() }),
  z.object({
    v: z.number(),
    id: z.string(),
    ok: z.literal(false),
    error: z.object({
      code: errorCodeSchema,
      message: z.string(),
      helperVersion: z.string().optional(),
      protocol: z.number().optional(),
    }),
  }),
]);
export type HostResponse = z.infer<typeof hostResponseSchema>;

export const dashboardSessionSchema = z.object({
  sessionId: z.string(),
  projectName: z.string(),
  startedAt: z.number(),
  endedAt: z.number(),
  durationMin: z.number(),
  turns: z.number(),
  costUsd: z.number(),
  score: z.number(),
  grade: gradeSchema,
  tips: z.array(z.object({ ruleId: z.string(), title: z.string() })),
});
export type DashboardSession = z.infer<typeof dashboardSessionSchema>;

export const dashboardProjectSchema = z.object({
  name: z.string(),
  sessions: z.number(),
  costUsd: z.number(),
  tokens: z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number() }),
  monthToDateUsd: z.number(),
});
export type DashboardProject = z.infer<typeof dashboardProjectSchema>;

export const dashboardDataSchema = z.object({
  range: dashboardRangeSchema,
  days: z.array(z.object({ day: z.string(), costUsd: z.number(), sessions: z.number(), byProject: z.record(z.string(), z.number()) })),
  byModel: z.record(z.string(), z.number()),
  byCategory: z.record(toolCategorySchema, z.number()),
  heatmap: z.array(z.array(z.number())),
  monthToDateUsd: z.number(),
  sessions: z.array(dashboardSessionSchema),
  truncated: z.boolean(),
  indexing: z.boolean(),
  /** Missing from helpers older than M6. */
  projects: z.array(dashboardProjectSchema).optional(),
});
export type DashboardData = z.infer<typeof dashboardDataSchema>;
