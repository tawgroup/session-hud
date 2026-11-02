# session-hud

A Claude Code mod that adds a live HUD pane next to the chat. It shows what the session is doing right now, so you do not have to guess.

## What the pane shows

1. **Header:** model, folder, session time, turn number.
2. **Git:** branch, commits ahead/behind, changed files (refreshed after every turn).
3. **Usage:** context window bar, 5h and 7-day rate limit bars with time to reset, cost in USD. Green under 60%, yellow 60 to 85%, red above 85%. The status line also shows `ctx X% · 5h Y% · $Z`.
4. **Last turn:** duration, tokens in (with cache hit %), tokens out. Main agent only.
5. **Running:** the tool running right now, with a short label and elapsed time.
6. **Subagents:** agents started with the Agent tool, their type, status and duration.
7. **Skills used:** counted from `Skill` tool calls.
8. **Tools:** top 8 tools by call count, errors in red, plus a line for MCP servers.
9. **Files edited:** files changed by Edit, Write or NotebookEdit, newest first.
10. **Timeline:** the last 6 tool calls with result, time, label and duration.

The pane opens when a session starts. Type `/hud` to open it again.

## Install

Requires a Claude Code version with mod support (the `plugin-authoring` skill).

```bash
git clone https://github.com/tawgroup/session-hud.git
claude --plugin-dir ./session-hud
```

Claude Code generates the type files in `.claude-plugin/types/` on load. They are not committed.

## Build it yourself instead

`PROMPT.vi.md` holds the prompt (Vietnamese) that produced this mod. Paste it into Claude Code and it writes its own version with the `plugin-authoring` skill. Good for workshops: people see how a mod is made, not only the result.

## Notes

- Skills are counted from `Skill` tool calls, not the `skill.prompt` event. Some security plugins run first and do not forward that event, so a HUD based on it shows "Skills (0)".
- State lives in atoms in `$.state`, typed in `types/index.d.ts`.
- Ideas for more: a todo list from `TodoWrite`, a sound when context goes above 85%, a compact button.

## Layout

```
.claude-plugin/plugin.json   manifest
hooks/hooks.json             module list
hooks/register.tsx           the mod: event handlers, state, pane UI
types/index.d.ts             state type contract
```
