# Openclaw Fork — Status

`## Now` is the live dashboard — update it on state transitions (work
completes / goes in-flight / blocks / decision lands), not just at
checkpoints. The sections below it are the standing snapshot of what's
wired up / open.

## Now

**In flight:**

- **Cascading global AGENTS.md — DEPLOYED + validated live 2026-10-10.**
  `870b06d1d48` (feat(hooks): operator-trusted absolute paths in
  bootstrap-extra-files): project agents now get the global house-rules
  AGENTS.md injected natively instead of via per-project symlinks the
  workspace-boundary check rejected. Config:
  `hooks.internal.entries.bootstrap-extra-files.paths =
["~/.openclaw/shared/AGENTS.md"]` (regular file required — loader rejects
  symlinks); file created 10:14 as a copy of the workspace AGENTS.md.
  Rocky deploy: the original work run OOM-killed at 09:54 mid-build (tsdown
  dts phase ~9-10 GB on the 11 GB box took out the CLI session and the build
  unit together); retry ran with `MemoryHigh=7G` + `oom_score_adj=500` on
  the build unit, build finished 10:27, `deploy.sh --skip-build` completed
  10:46 (backup `~/dist-backups/2026-10-10-1046-pre-870b06d1d48`, Timeshift
  #19), restart 10:47. Validated live 10:49: fresh project-agent bootstrap
  (openclaw agent) shows the shared AGENTS.md layered above the repo one;
  `operator bootstrap root` marker in live dist. All 10
  `~/projects/*/AGENTS.md` symlinks deleted. Second-channel validation
  passed 10:58 (hindsight project agent confirmed shared AGENTS.md + real
  workspace AGENTS.md). Memory guards baked into `deploy.sh` 11:22 (Matt
  approved): `BUILD_MEMORY_HIGH=7G` + `OOMScoreAdjust=500` on the build
  unit, `BUILD_TIMEOUT=3600` (throttled builds run ~35 min). Walk back the
  7G cap after the planned server RAM upgrade (TODO comment in script).
  Open option: skip dts-generation for gateway-only deploys (gateway never
  reads `.d.ts`; would make builds fast/cheap again).

- **Hot-apply agent bindings — DEPLOYED + validated live 2026-09-29.** Matt
  green-lit implementation in #openclaw 2026-09-29 (Discord-only first).
  `d9946c42dc5`: `ResolveAgentRouteInput.cfg` optional → omitted callers
  resolve against the live runtime snapshot; Discord route call sites
  (preflight, native commands, components, reactions, voice) stop passing
  the startup-captured cfg. Tests: hot-apply regression + discord monitor
  855/855 + routing 58/58; tsgo src/test lanes clean. Deployed 2026-09-29 12:30 via `.matt/scripts/deploy.sh` (`fd2fe4ebf75`,
  backup `~/dist-backups/2026-09-29-1229-pre-fd2fe4ebf75`), restart 12:31.
  Validated live: #calibre-admin rebound to a canary agent and back with
  `openclaw config patch`, zero restarts — route followed both edits on the
  next message. Move to a Done note at next checkpoint. Deferred follow-ups: feishu/telegram/slack call-site
  sweep (same capture pattern; feishu confirmed upstream #133757), and
  configured-binding resolution (`resolveConfiguredBindingRoute`) still
  reads startup-captured cfg — session-target binding edits still want a
  restart until that lands. Full context in spec.md patch list.

**Blocked on:**

- (nothing)

**Next:**

- **Agent-definition stale-capture — FIXED (`d026286af48`), deployed 13:21 + validated live 13:34 2026-09-29 (canary cwd = configured workspace, zero restarts).** Was: reply
  dispatch threads the Discord-captured cfg as a complete configOverride
  (`message-handler.process.ts` → `dispatchInboundMessageWithBufferedDispatcher`
  → `dispatch-from-config.ts` `withFullRuntimeReplyConfig`;
  `resolveGetReplyConfig` prefers it, `get-reply-fast-path.ts:117`), so
  workspace/per-agent settings resolve against boot-time config — a hot-added
  agent routes correctly but runs in `agents.defaults.workspace/<id>` until
  restart. Fix mirrors `d9946c42dc5`: dispatcher + turn-kernel cfg optional,
  one runtime snapshot pinned per turn, Discord dispatch call sites omit the
  captured cfg. Green-lit by Matt in #openclaw 2026-09-29. Tests: dispatcher
  hot-apply regression, discord monitor 855/855, reply 2918, four tsgo lanes.
  Live re-validation passed 2026-09-29 13:34.

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
