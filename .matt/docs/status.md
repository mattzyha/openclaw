# Openclaw Fork — Status

Snapshot of what's wired up, what's in progress, what's broken.

_Last touched: 2026-06-09_

## Wired up & working

- Fork running on `~/projects/openclaw` (branch `main`, openclaw 2026.6.2 `b1bdc29`).
- Build worktree at `~/projects/openclaw-build` — `pnpm install` complete, builds succeed (~5.4 min).
- Live dist at `~/projects/openclaw/dist` serving the gateway via systemd drop-in.
- Two custom patches landed and committed: sticky-❌ (`98fa5aefa7`), inline-await reaction cleanup (`703cc6540c`).
- Bundled-hooks loader on (`hooks.internal.enabled: true`). boot-md confirmed firing on restart and posting back-online to the channel from `RESTART_REASON.md`.
- CLI backend watchdog raised to 600s for both fresh + resume sessions.
- Discord plugin loading from the bundled fork dist (not the npm install, which was removed 2026-06-02).
- First per-project channel→agent binding: `#claudedevtools` → `claudedevtools` agent → `~/projects/ClaudeDevTools/`. Verified 2026-06-09.

## In progress

- _(none — last work batch was the channel-binding setup, now landed.)_

## Known open items / paper cuts

- Doctor advisory: base systemd unit Description says version 2026.5.22 while the CLI is 2026.6.2 — cosmetic, do NOT run `openclaw doctor --repair`.
- Sticky-❌ behavior is in code + verified by grep but never end-to-end-tested with a real harness failure.
- Memory fragmentation: each per-project agent gets its own Claude CLI auto-memory dir. Project agents start with no user memory beyond the symlinked persona files.
