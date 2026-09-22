import { agentRowOf, agentStatsOf, type AgentStats } from './agentTree'
import { asRecord } from './services'

export interface GoalAgent extends AgentStats {
  id: string
  label: string
  running: boolean
  updatedAt: number
}

/** Direct children only: siblings, ancestors and other sessions are not delegated by this session. */
export function goalAgentsOf(snapshot: unknown, sessionId: string | undefined): GoalAgent[] | null {
  try {
    const rows = asRecord(asRecord(snapshot)?.byId)
    if (rows === null || Array.isArray(rows) || !sessionId) return null
    const agents: GoalAgent[] = []
    for (const id of Object.keys(rows)) {
      try {
        const row = agentRowOf(rows[id])
        if (id === sessionId || row === null || row.blank || row.parentId !== sessionId) continue
        const stats = agentStatsOf(row.projections)
        agents.push({ ...stats, id, label: stats.identity?.label ?? row.title ?? row.displayTitle ?? id,
          running: row.running, updatedAt: row.updatedAt })
      } catch {
        // Drop a hostile row whole while preserving the rest of the list.
      }
    }
    return agents.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  } catch {
    return null
  }
}
