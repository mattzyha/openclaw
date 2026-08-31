# Openclaw Fork — Status

`## Now` is the live dashboard — update it on state transitions (work
completes / goes in-flight / blocks / decision lands), not just at
checkpoints. The sections below it are the standing snapshot of what's
wired up / open.

## Now

**In flight:**

- (nothing)

**Blocked on:**

- (nothing)

**Next:**

- Retire fork patch `c1de8eebf9c` (Claude CLI subscription-limit "You've hit
  your … limit" → rate_limit + verbatim `⚠️` copy in channels) if/when upstream
  ships equivalent handling — check `git grep -i "hit your" upstream/main -- src`
  at each rebase. Deployed + verified 2026-08-30 21:02: gateway restarted on
  the 21:00 dist (pid 284924), `gateway status` clean, 12 plugins loaded,
  markers in 2 dist chunks. **Proven end-to-end 2026-08-30 21:18:** the Max
  session limit tripped on two turns; journal shows `model fallback decision:
… reason=rate_limit … detail=You've hit your session limit · resets 1:20am`
  with no `no queued reply payloads` warning, and Matt confirmed the
  `You've hit your session limit` message appeared in #openclaw. Rollback copy
  in `~/dist-backups/2026-08-30-pre-session-limit-fix/` — safe to delete.
- Retire fork patch `c8ddcd77ba2` (Claude CLI natural-OAuth-expiry → auth
  classifier, port of upstream #131345) at the first rebase past #131345.
  Deployed + verified 2026-08-30 17:26: gateway restarted on the new dist,
  status clean, marker in `dist/errors-*.js`. Rollback copy in
  `~/dist-backups/2026-08-30-pre-oauth-expiry-fix/` — delete once confident.
- Port upstream `740e7687e84` (#102186, 2026-07-09, not in v2026.7.1-2):
  `openclaw models list` crashes with `Cannot read properties of undefined
(reading 'input')` in `applyAnthropicSonnet5Cost`
  (`extensions/anthropic/register.runtime.ts:587`) because a configured
  Sonnet-5 row arrives without `cost`; upstream guards it with
  `modelCostsEqual(current | undefined, expected)` in
  `src/plugin-sdk/provider-model-shared.ts` (+ same guard in
  `extensions/anthropic-vertex/provider-catalog.ts`). Pre-existing since the
  2026-08-12 upgrade; still reproduces 2026-08-30 21:12 on the current dist.
  CLI-only — `models status`, routing, and the gateway are unaffected. Small
  port (8 lines each in two files + the helper); Matt to decide.
- ~~Model-catalog boot warning (`Cannot find module
'../../../dist/extensions/deepinfra/provider-policy-api.js'`)~~ — CLOSED
  2026-08-30 (absent at the 20:48 and 21:02 boots, each running 10+ min and
  each rebuilding `agent_model_catalogs` successfully at 20:48:47 / 21:02:53).
  What is known: deepinfra is an external official plugin — present in the
  source tree (`extensions/deepinfra`, 150 dirs) but excluded from `dist/`
  (97) and `dist-runtime/` (96); the error string is a dangling overlay
  symlink target, i.e. a `dist-runtime` entry left over from the 2026-08-12
  build while `dist/` had moved on — which is why both trees now rsync together
  (spec TL;DR, `.matt/scripts/deploy.sh` + import-target assertion). What is
  NOT pinned down: the live overlay has been unchanged since 17:24 yet the
  warning still fired at the 17:26 / 18:33 / 19:03 boots and on the 18:28 /
  19:02 Hindsight config hot-reloads; the only changes in the 19:04→20:48
  window were Hindsight config edits (`plugins.slots.memory`,
  `agents.defaults.heartbeat.every`) and another session's 20:47
  `openclaw-restart-compact` job. If it comes back, start at
  `src/plugins/provider-public-artifacts.ts` (checks `dist/extensions` then
  `dist-runtime/extensions`) and note the plugin index (regenerated 18:28,
  `source-changed`) lists deepinfra with `rootDir` in the _source_ tree.
  Oddity from the same window: mtimes of ~40 tracked root files in the live
  checkout (tsconfig\*, openclaw.mjs, README, pnpm-lock…) changed 19:04→20:48
  with no reflog entry and `git status` clean — content is fine, cause unknown.
- Auth expiry went unnoticed for 3.5 days (2026-08-27 → 08-30) because only
  heartbeats were failing. Consider a heartbeat/cron auth check that pings
  #server-management when `claude auth status` reports logged out.
- Checkpoint the sections below: they were last verified 2026-07-30
  against openclaw 2026.6.2, before the 2026-08-12 upgrade to 2026.7.1-2
  and the model rebinding (Fable 5 defaults + Opus 5 pins). Patch list,
  version references, and watchdog notes need re-verification against the
  upgraded fork.

---

## Wired up & working

- Fork running on `~/projects/openclaw` (branch `main`, openclaw 2026.6.2 `b1bdc29`).
- Build worktree at `~/projects/openclaw-build` — `pnpm install` complete, builds succeed (~5.4 min).
- Live dist at `~/projects/openclaw/dist` serving the gateway via systemd drop-in.
- Live runtime overlay at `~/projects/openclaw/dist-runtime` (added to the deploy flow 2026-08-30); `.matt/scripts/deploy.sh` is the scripted build→rsync-both→assert→restart path (dry-run self-test passed 2026-08-30).
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
