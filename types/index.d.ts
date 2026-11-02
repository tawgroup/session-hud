export type Usage = {
  ctxPct: number | null
  ctxTokens: number | null
  ctxWindow: number | null
  limits: { kind: string; pct: number; resetsAt: string | null }[]
  usd: number | null
}
export type Count = { name: string; count: number; errors: number; last: number }
export type Running = { id: string; tool: string; label: string; started: number }
export type Done = { tool: string; label: string; ms: number; ok: boolean; at: number }
export type Agent = { id: string; type: string; desc: string; started: number; ms: number | null }
export type FileTouch = { path: string; count: number; last: number }
export type Turn = { n: number; ms: number; tokIn: number; tokOut: number; cacheRead: number; model: string }
export type Git = { branch: string; ahead: number; behind: number; dirty: number; at: number }

declare module 'claude-code' {
  interface PluginState {
    'session-hud': {
      usage: Shaped<Usage>
      skills: Shaped<Count[]>
      tools: Shaped<Count[]>
      mcp: Shaped<Count[]>
      running: Shaped<Running[]>
      recent: Shaped<Done[]>
      agents: Shaped<Agent[]>
      files: Shaped<FileTouch[]>
      turn: Shaped<Turn | null>
      git: Shaped<Git | null>
      startedAt: Shaped<number>
    }
  }
}
