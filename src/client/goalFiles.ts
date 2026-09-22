import { asRecord } from './services'

export interface GoalFileChange { path: string; added: number; removed: number }
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Sum successful, explicitly goal-owned file writes; one hostile item drops whole. */
export function goalFilesOf(value: unknown, goalId: string): GoalFileChange[] {
  const files = new Map<string, GoalFileChange>()
  if (!Array.isArray(value)) return []
  for (const item of value) {
    try {
      const op = asRecord(item)
      if (op?.goalId !== goalId || op.kind !== 'write' || op.err !== false
        || typeof op.path !== 'string' || op.path.trim() === '' || !count(op.added) || !count(op.removed)) continue
      const path = op.path.replaceAll('\\', '/')
      const previous = files.get(path)
      files.set(path, { path,
        added: Math.min(Number.MAX_SAFE_INTEGER, (previous?.added ?? 0) + op.added),
        removed: Math.min(Number.MAX_SAFE_INTEGER, (previous?.removed ?? 0) + op.removed) })
    } catch { /* Skip a malformed operation without losing other files. */ }
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path))
}
