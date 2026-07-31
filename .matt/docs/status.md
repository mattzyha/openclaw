# Openclaw Fork — Status

Snapshot of what's wired up, what's in progress, what's broken.

_Last touched: 2026-07-30_

## Wired up & working

- Fork running on `~/projects/openclaw` (branch `main`, openclaw 2026.6.2 `b1bdc29`).
- Build worktree at `~/projects/openclaw-build` — `pnpm install` complete, builds succeed (~5.4 min).
- Live dist at `~/projects/openclaw/dist` serving the gateway via systemd drop-in.
- Four custom patches landed, committed, and deployed: sticky-❌ (`98fa5aefa7`), inline-await reaction cleanup (`703cc6540c`), Claude CLI auth-failure surfacing (`4c19adaa06`), auth-failure detection loosening for `reason=unknown` credential-expiry (`9ff5a3b69e`, deployed 2026-07-30, verified end-to-end via `claude auth logout` on this box — gateway posted the re-auth message and ❌ landed on the test Discord ping, `claude auth login` restored normal ✅ replies).
- Bundled-hooks loader on (`hooks.internal.enabled: true`). boot-md confirmed firing on restart and posting back-online to the channel from `RESTART_REASON.md`.
- CLI backend watchdog raised to 600s for both fresh + resume sessions.
- Discord plugin loading from the bundled fork dist (not the npm install, which was removed 2026-06-02).
- First per-project channel→agent binding: `#claudedevtools` → `claudedevtools` agent → `~/projects/ClaudeDevTools/`. Verified 2026-06-09.

## In progress

- _(none — last work batch was the channel-binding setup, now landed.)_

## Known open items / paper cuts

- Doctor advisory: base systemd unit Description says version 2026.5.22 while the CLI is 2026.6.2 — cosmetic, do NOT run `openclaw doctor --repair`.
- Sticky-❌ behavior verified end-to-end 2026-07-30 as part of the auth-failure surfacing deploy (see `spec.md` "Patches applied" for the flow).
- Memory fragmentation: each per-project agent gets its own Claude CLI auto-memory dir. Project agents start with no user memory beyond the symlinked persona files.
