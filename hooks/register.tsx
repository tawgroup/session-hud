import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

type Api = Parameters<Hook<'session.start'>>[0]

import type { Agent, Count, Done, FileTouch, Git, Running, Turn, Usage } from '../types'

const PANE = 'session-hud'
const TITLE = 'Session HUD'

const usage = atom({ plugin: 'session-hud', key: 'usage' } as const, { ctxPct: null, ctxTokens: null, ctxWindow: null, limits: [], usd: null } as Usage, { shape: 'usage-1' })
const skills = atom({ plugin: 'session-hud', key: 'skills' } as const, [] as Count[], { shape: 'count-1' })
const tools = atom({ plugin: 'session-hud', key: 'tools' } as const, [] as Count[], { shape: 'count-1' })
const mcp = atom({ plugin: 'session-hud', key: 'mcp' } as const, [] as Count[], { shape: 'count-1' })
const running = atom({ plugin: 'session-hud', key: 'running' } as const, [] as Running[], { shape: 'running-1' })
const recent = atom({ plugin: 'session-hud', key: 'recent' } as const, [] as Done[], { shape: 'done-1' })
const agents = atom({ plugin: 'session-hud', key: 'agents' } as const, [] as Agent[], { shape: 'agent-1' })
const files = atom({ plugin: 'session-hud', key: 'files' } as const, [] as FileTouch[], { shape: 'files-1' })
const turn = atom({ plugin: 'session-hud', key: 'turn' } as const, null as Turn | null, { shape: 'turn-1' })
const git = atom({ plugin: 'session-hud', key: 'git' } as const, null as Git | null, { shape: 'git-1' })
const startedAt = atom({ plugin: 'session-hud', key: 'startedAt' } as const, 0, { shape: 'start-1' })

// ---------- helpers ----------

const bump = (list: Count[], name: string, failed: boolean): Count[] => {
  const now = Date.now()
  return list.some(x => x.name === name)
    ? list.map(x => (x.name === name ? { ...x, count: x.count + 1, errors: x.errors + (failed ? 1 : 0), last: now } : x))
    : [...list, { name, count: 1, errors: failed ? 1 : 0, last: now }]
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

const labelOf = (tool: string, a: Record<string, unknown>): string => {
  if (tool === 'Bash') return str(a.description) || str(a.command)
  if (tool === 'Skill') return str(a.skill)
  if (tool === 'Agent') return `${str(a.subagent_type) || 'general'}: ${str(a.description)}`
  if (tool === 'Grep' || tool === 'Glob') return str(a.pattern)
  if (tool === 'WebFetch') return str(a.url)
  if (tool === 'WebSearch') return str(a.query)
  if (str(a.file_path)) return base(str(a.file_path))
  if (tool.startsWith('mcp__')) return tool.split('__').slice(2).join('__')
  return ''
}

const mcpServer = (tool: string) => (tool.startsWith('mcp__') ? tool.split('__')[1] ?? null : null)

const bar = (pct: number, width: number) => {
  const w = Math.max(4, width)
  const fill = Math.round((Math.min(100, Math.max(0, pct)) / 100) * w)
  return '█'.repeat(fill) + '░'.repeat(w - fill)
}
const pctColor = (p: number) => (p >= 85 ? 'red' : p >= 60 ? 'yellow' : 'green')

const dur = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}
const kTok = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)
const limitName = (k: string) => (k === 'five_hour' ? '5h' : k === 'seven_day' ? '7d' : k === 'spend_limit' ? 'spend' : k)
const resetIn = (iso: string | null) => {
  if (!iso) return ''
  const ms = Date.parse(iso) - Date.now()
  return Number.isFinite(ms) && ms > 0 ? `reset ${dur(ms)}` : ''
}
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const statusText = (u: Usage) => {
  const parts: string[] = []
  if (u.ctxPct != null) parts.push(`ctx ${u.ctxPct}%`)
  const five = u.limits.find(l => l.kind === 'five_hour')
  if (five) parts.push(`5h ${five.pct}%`)
  if (u.usd != null) parts.push(`$${u.usd.toFixed(2)}`)
  return parts.length ? parts.join(' · ') : undefined
}

const toUsage = (m: { context: { percent?: number; tokens?: number; window: number }; rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]; cost?: { usd: number } }): Usage => ({
  ctxPct: m.context.percent ?? null,
  ctxTokens: m.context.tokens ?? null,
  ctxWindow: m.context.window,
  limits: m.rateLimits.map(l => ({ kind: l.kind, pct: l.percentUsed, resetsAt: l.resetsAt ?? null })),
  usd: m.cost?.usd ?? null,
})

// ---------- git ----------

async function refreshGit($: Api) {
  try {
    const cwd = await $.session.cwd()
    const r = await $.process.run(['git', 'status', '--porcelain=v1', '-b'], { cwd, timeoutMs: 4000 })
    if (r.exitCode !== 0) return
    const lines = r.stdout.split('\n').filter(Boolean)
    const head = lines[0] ?? ''
    const branch = head.replace(/^## /, '').split('...')[0]?.split(' ')[0] ?? '?'
    const ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0)
    const behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0)
    await update($, git, () => ({ branch, ahead, behind, dirty: Math.max(0, lines.length - 1), at: Date.now() }))
  } catch {
    // git missing or not a repo: leave the section empty
  }
}


// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hud', description: 'Open the Session HUD pane' })
    try {
      const u = await $.session.usage()
      await update($, startedAt, old => old || u.startedAt)
      await update($, usage, () => toUsage(u))
      $.ui.status(statusText(toUsage(u)))
    } catch {
      await update($, startedAt, old => old || Date.now())
    }
    void refreshGit($)
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'hud' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Session HUD opened.' }
  })

  on('session.measure', async ($, e, next) => {
    const u = toUsage(e)
    await update($, usage, () => u)
    $.ui.status(statusText(u))
    return next(e)
  })

  // Some security plugins swallow skill.prompt, so skills are also counted from the Skill tool call below.
  on('skill.prompt', async ($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const a = e as unknown as Record<string, unknown>
    const label = cut(labelOf(e.tool, a), 60)
    const started = Date.now()
    const id = e.tool_use_id
    await update($, running, list => [...list, { id, tool: e.tool, label, started }].slice(-20))
    if (e.tool === 'Agent') {
      await update($, agents, list => [...list, { id, type: str(a.subagent_type) || 'general', desc: cut(str(a.description), 40), started, ms: null }].slice(-20))
    }

    let failed = true
    try {
      const ran = await next(e)
      failed = ran.deny !== undefined || ran.isError === true
      return ran
    } finally {
      const ms = Date.now() - started
      await update($, running, list => list.filter(r => r.id !== id))
      await update($, recent, list => [...list, { tool: e.tool, label, ms, ok: !failed, at: Date.now() }].slice(-30))
      await update($, tools, list => bump(list, e.tool, failed))
      const server = mcpServer(e.tool)
      if (server) await update($, mcp, list => bump(list, server, failed))
      if (e.tool === 'Skill' && str(a.skill)) await update($, skills, list => bump(list, str(a.skill), failed))
      if (e.tool === 'Agent') await update($, agents, list => list.map(x => (x.id === id ? { ...x, ms } : x)))
      const fp = str(a.file_path) || str(a.notebook_path)
      if (!failed && fp && ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(e.tool)) {
        await update($, files, list => {
          const now = Date.now()
          return list.some(f => f.path === fp)
            ? list.map(f => (f.path === fp ? { ...f, count: f.count + 1, last: now } : f))
            : [...list, { path: fp, count: 1, last: now }].slice(-50)
        })
      }
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId) {
      const u = done.usage
      const n = await $.session.turns().catch(() => 0)
      await update($, turn, () => ({
        n,
        ms: e.durationMs,
        tokIn: u ? u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens : 0,
        tokOut: u?.output_tokens ?? 0,
        cacheRead: u?.cache_read_input_tokens ?? 0,
        model: u?.model ?? '',
      }))
      void refreshGit($)
    }
    return done
  })

  // ---------- pane ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const cols = e.viewport?.columns ?? 40
    const barW = Math.max(6, Math.min(24, cols - 22))

    const [u, sk, tl, mc, run, rec, ag, fl, tn, g, t0] = await Promise.all([
      read($, usage), read($, skills), read($, tools), read($, mcp), read($, running), read($, recent),
      read($, agents), read($, files), read($, turn), read($, git), read($, startedAt),
    ])
    const model = await $.session.model().catch(() => '?')
    const cwd = await $.session.cwd().catch(() => '')
    const totalCalls = tl.reduce((n, x) => n + x.count, 0)
    const totalErr = tl.reduce((n, x) => n + x.errors, 0)
    const H = (s: string) => <Text bold color="cyan">{s}</Text>

    return (
      <Box flexDirection="column">
        {/* header */}
        <Text>
          <Text bold color="magenta">{model}</Text>
          <Text dimColor> · {base(cwd)} · up {t0 ? dur(Date.now() - t0) : '?'}{tn ? ` · turn ${tn.n}` : ''}</Text>
        </Text>

        {/* git */}
        {g && (
          <Text>
            <Text color="green">⎇ {g.branch}</Text>
            {g.ahead > 0 && <Text color="yellow"> ↑{g.ahead}</Text>}
            {g.behind > 0 && <Text color="yellow"> ↓{g.behind}</Text>}
            <Text color={g.dirty > 0 ? 'yellow' : 'green'}> {g.dirty > 0 ? `● ${g.dirty} changed` : '✓ clean'}</Text>
          </Text>
        )}
        <Text> </Text>

        {/* usage */}
        {H('Usage')}
        {u.ctxPct != null ? (
          <Text>
            ctx <Text color={pctColor(u.ctxPct)}>{bar(u.ctxPct, barW)}</Text> {u.ctxPct}%
            <Text dimColor>{u.ctxTokens != null && u.ctxWindow ? ` ${kTok(u.ctxTokens)}/${kTok(u.ctxWindow)}` : ''}</Text>
          </Text>
        ) : (
          <Text dimColor>ctx: waiting for first measure</Text>
        )}
        {u.limits.map(l => (
          <Text>
            {limitName(l.kind).padEnd(3)} <Text color={pctColor(l.pct)}>{bar(l.pct, barW)}</Text> {l.pct}%
            <Text dimColor> {resetIn(l.resetsAt)}</Text>
          </Text>
        ))}
        {u.usd != null && <Text>cost <Text color="yellow">${u.usd.toFixed(2)}</Text></Text>}
        {tn && (
          <Text dimColor>
            last turn {dur(tn.ms)} · in {kTok(tn.tokIn)} (cache {tn.tokIn ? Math.round((tn.cacheRead / tn.tokIn) * 100) : 0}%) · out {kTok(tn.tokOut)}
          </Text>
        )}
        <Text> </Text>

        {/* live */}
        {run.length > 0 && (
          <Box flexDirection="column">
            {H(`Running (${run.length})`)}
            {run.map(r => (
              <Text>
                <Text color="yellow">◐ {r.tool}</Text> <Text dimColor>{cut(r.label, cols - r.tool.length - 6)} · {dur(Date.now() - r.started)}</Text>
              </Text>
            ))}
            <Text> </Text>
          </Box>
        )}

        {/* agents */}
        {ag.length > 0 && (
          <Box flexDirection="column">
            {H(`Subagents (${ag.length})`)}
            {ag.slice(-5).map(a => (
              <Text>
                <Text color={a.ms == null ? 'yellow' : 'green'}>{a.ms == null ? '◐' : '✓'} {a.type}</Text>
                <Text dimColor> {a.desc}{a.ms != null ? ` · ${dur(a.ms)}` : ''}</Text>
              </Text>
            ))}
            <Text> </Text>
          </Box>
        )}

        {/* skills */}
        {H(`Skills (${sk.length})`)}
        {sk.length === 0 && <Text dimColor>No skill used yet.</Text>}
        {sk.slice().sort((a, b) => b.last - a.last).slice(0, 6).map(s => (
          <Text>
            {s.name} <Text dimColor>×{s.count} · {clock(s.last)}</Text>
          </Text>
        ))}
        <Text> </Text>

        {/* tools */}
        {H(`Tools (${totalCalls} calls${totalErr ? `, ${totalErr} errors` : ''})`)}
        {tl.slice().sort((a, b) => b.count - a.count).slice(0, 8).map(t => (
          <Text>
            {cut(t.name.replace(/^mcp__/, ''), cols - 14)} <Text dimColor>×{t.count}</Text>
            {t.errors > 0 && <Text color="red"> ✗{t.errors}</Text>}
          </Text>
        ))}
        {mc.length > 0 && (
          <Text>
            <Text dimColor>MCP: </Text>
            {mc.map(m => `${m.name}×${m.count}`).join(', ')}
          </Text>
        )}
        <Text> </Text>

        {/* files */}
        {fl.length > 0 && (
          <Box flexDirection="column">
            {H(`Files edited (${fl.length})`)}
            {fl.slice().sort((a, b) => b.last - a.last).slice(0, 6).map(f => (
              <Text>
                <Text color="blue">✎ {cut(base(f.path), cols - 10)}</Text>
                <Text dimColor> ×{f.count}</Text>
              </Text>
            ))}
            <Text> </Text>
          </Box>
        )}

        {/* timeline */}
        {H('Timeline')}
        {rec.length === 0 && <Text dimColor>Nothing yet.</Text>}
        {rec.slice(-6).reverse().map(r => (
          <Text>
            <Text color={r.ok ? 'green' : 'red'}>{r.ok ? '✓' : '✗'}</Text>
            <Text dimColor> {clock(r.at).slice(0, 5)} </Text>
            {r.tool.replace(/^mcp__/, '')}
            <Text dimColor> {cut(r.label, Math.max(8, cols - r.tool.length - 18))} · {dur(r.ms)}</Text>
          </Text>
        ))}
      </Box>
    )
  })
}
