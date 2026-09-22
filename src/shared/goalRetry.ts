import { z } from 'zod'

export const GOAL_RETRY_ROUTE = '/api/dsh-goal-plus-plus/goal-retry'
export const retrySettingsSchema = z.object({
  enabled: z.boolean(),
  intervalSeconds: z.number().int().min(1).max(2_147_483),
  maxRetries: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict()
export type RetrySettings = z.infer<typeof retrySettingsSchema>
export const RETRY_DEFAULTS: RetrySettings = { enabled: false, intervalSeconds: 30, maxRetries: 3 }
export const retryViewSchema = retrySettingsSchema.extend({
  attempts: z.number().int().nonnegative(),
  status: z.enum(['idle', 'waiting', 'resumed', 'exhausted', 'cancelled', 'ineligible', 'failed']),
  nextAt: z.number().nullable(),
  code: z.string().nullable(),
})
export type RetryView = z.infer<typeof retryViewSchema>
export const retryRequestSchema = z.object({
  sessionId: z.string().min(1), goalId: z.string().min(1), revision: z.number().int().positive(),
  action: z.enum(['read', 'configure', 'cancel']), settings: retrySettingsSchema.optional(),
}).strict()
export type RetryRequest = z.infer<typeof retryRequestSchema>

export function retryRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

/** Use the harness's normalized failure taxonomy, never HTTP status or broad error text. */
export function retryCode(value: unknown): string | null {
  const code = retryRecord(value).code
  return typeof code === 'string' && ['TRANSPORT', 'TIMEOUT', 'SERVER', 'EMPTY_RESPONSE', 'RATE_LIMIT'].includes(code) ? code : null
}
