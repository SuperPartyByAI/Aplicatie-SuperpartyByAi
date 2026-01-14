const { z } = require('zod');

const SendRequestSchema = z.object({
  threadId: z.string().min(1),
  accountId: z.string().min(1),
  chatId: z.string().min(1).optional(),
  to: z.string().min(1),
  text: z.string().min(1),
  clientMessageId: z.string().min(1),
});

const AccountsCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().default(''),
});

const RegenerateQrParamsSchema = z.object({
  accountId: z.string().min(1),
});

const HealthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  gitSha: z.string().nullable().optional(),
  instanceId: z.string().min(1),
  uptimeSec: z.number().int().nonnegative(),
  outboxBacklog: z.number().int().nonnegative().optional(),
  oldestUnprocessedIngestAt: z.any().optional(),
  ingestLagSec: z.number().int().nonnegative().optional(),
  healthy: z.boolean().optional(),
  thresholds: z
    .object({
      heartbeatStaleSec: z.number().int().positive().optional(),
      eventStaleSec: z.number().int().positive().optional(),
      ingestLagWarnSec: z.number().int().positive().optional(),
      outboxBacklogWarn: z.number().int().positive().optional(),
      reconnectsPerHourWarn: z.number().int().positive().optional(),
      mediaFailureRateWarn: z.number().int().positive().optional(),
    })
    .optional(),
  leases: z
    .array(
      z.object({
        accountId: z.string().min(1),
        ownerInstanceId: z.any().optional(),
        leaseUntil: z.any().optional(),
      }),
    )
    .optional(),
  accounts: z.array(
    z.object({
      accountId: z.string().min(1),
      status: z.any().optional(),
      lastSeenAt: z.any().optional(),
      heartbeatAgeSec: z.number().int().nonnegative().nullable().optional(),
      lastEventAt: z.any().optional(),
      eventAgeSec: z.number().int().nonnegative().nullable().optional(),
      degraded: z.boolean().optional(),
      assignedWorkerId: z.any().optional(),
      reconnectCount: z.number().int().nonnegative().optional(),
      reconnectsPerHour: z.number().int().nonnegative().optional(),
      mediaFailureRate: z.number().int().nonnegative().optional(),
      outboxBacklogCount: z.number().int().nonnegative().optional(),
      ingestLagSec: z.number().int().nonnegative().nullable().optional(),
    }),
  ),
});

function parseOr400(schema, data) {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    error: {
      code: 'invalid_request',
      issues: r.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    },
  };
}

module.exports = {
  SendRequestSchema,
  AccountsCreateSchema,
  RegenerateQrParamsSchema,
  HealthResponseSchema,
  parseOr400,
};

