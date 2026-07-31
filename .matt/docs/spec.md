# Openclaw Fork — Local Spec

Snapshot of how this fork of openclaw is set up on the minimatt server. Fork-only documentation — never PR this directory upstream (see "Keeping this out of upstream" at the bottom).

## TL;DR build & deploy flow

```
edit + commit in ~/projects/openclaw (branch: main)
         │
         ▼
cd ~/projects/openclaw-build && git fetch && git reset --hard main && pnpm build
         │
         ▼
rsync -a --delete ~/projects/openclaw-build/dist/ ~/projects/openclaw/dist/
         │
         ▼
openclaw gateway restart   (only when bindings / cliBackends / source code change)
```

**Rule:** never run `pnpm build` directly in `~/projects/openclaw/`. The build wipes `dist/` as a prepass and would leave the live gateway in a broken state for several minutes.

## Source / dist / build layout

| Role                        | Path                                                              | Notes                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fork source checkout        | `~/projects/openclaw/`                                            | branch `main`, `origin` = `mattzyha/openclaw`, `upstream` = `openclaw/openclaw`. Source edits + commits happen here.                                                         |
| Build worktree              | `~/projects/openclaw-build/`                                      | second `git worktree`, branch `build`. Used for `pnpm build` so the live dist is never touched. Created once via `git worktree add ~/projects/openclaw-build -b build main`. |
| Live dist served by gateway | `~/projects/openclaw/dist/`                                       | populated by rsync from the build worktree, NEVER built in place.                                                                                                            |
| Bin shim                    | `~/.npm-global/bin/openclaw` → `~/projects/openclaw/openclaw.mjs` | plain `ln -sf`, not pnpm-managed.                                                                                                                                            |

The systemd unit at `~/.config/systemd/user/openclaw-gateway.service` is the original installed by 2026.5.22 and still points at the npm-global install, but is **overridden by drop-in** `~/.config/systemd/user/openclaw-gateway.service.d/dev-clone.conf` which sets effective ExecStart to:

```
ExecStart=/usr/bin/node /home/minimatt/projects/openclaw/dist/index.js gateway --port 18789
Environment=OPENCLAW_SERVICE_VERSION=2026.6.2
```

The base-unit-vs-CLI version mismatch shows as a cosmetic advisory from `openclaw gateway status`. **Don't run `openclaw doctor --repair`** — it'd try to regenerate the base unit (drop-in still overrides ExecStart, so this is structurally safe, but still avoid the noise).

## Build mechanics + gotchas

- `pnpm install` in the build worktree is near-free — hard-links from the pnpm global store at `~/.local/share/pnpm/store/`. Typical: ~3s, no real download for ~1073 packages.
- `pnpm build` takes ~5.4 min total (dominated by `tsdown` at ~4 min).
- Memory peak is ~9.7 GiB on an 11 GiB box — close to OOM. Foreground `pnpm build` invoked from a bash tool call can be killed by the Claude CLI's no-output watchdog (raised to 600s on this gateway) OR by the kernel OOM killer if anything else is hot at the same time.
- Workaround when running the build via an agent: detach with `systemd-run` so the build survives the calling shell's lifecycle.
  ```bash
  systemd-run --user --unit=openclaw-build \
    --working-directory=/home/minimatt/projects/openclaw-build \
    --setenv=PATH=/home/minimatt/.npm-global/bin:/usr/local/bin:/usr/bin:/bin \
    -- /home/minimatt/.npm-global/bin/pnpm build
  ```
  Then poll with `systemctl --user status openclaw-build` (each poll is sub-second; unit reports `inactive` + result on completion).
- After build: `ls /home/minimatt/projects/openclaw-build/dist/index.js` should show a fresh timestamp; `du -sh` of the dist will be ~149 MiB / ~5,500 files.
- After rsync (typically <2 s): grep a unique substring from a recent patch to confirm it landed in the live dist before restarting.

## Config

Config file: `~/.openclaw/openclaw.json` (rolling backups `openclaw.json.bak.N` and `openclaw.json.last-good`).

Modify via `openclaw config patch --stdin --dry-run` first (validates), then drop `--dry-run` to apply.

Hot-reload matrix (confirmed empirically):

- `channels.discord.*` — hot-reloads.
- `hooks.internal.*` — hot-reloads.
- `agents.list` — hot-reloads.
- `bindings` — detected at hot-reload but NOT fully applied; **restart required**.
- `agents.defaults.cliBackends.*.reliability.watchdog.*` — restart required.

When restart is needed: write `~/.openclaw/workspace/RESTART_REASON.md` with `channel_id` + `verification_ask`, then `openclaw gateway restart`. The boot-md hook (enabled in `hooks.internal`) posts a "back online" message to the channel from the RESTART_REASON file.

## Agent + channel routing model

**Per-channel = per-project workspace.** Each Discord dev-project channel gets its own openclaw agent bound to its own project directory. Direct binding via `bindings[]`, not orchestrator delegation.

Currently wired:

| Agent ID         | Workspace                    | Channel ID                         | Notes                                             |
| ---------------- | ---------------------------- | ---------------------------------- | ------------------------------------------------- |
| `main`           | `~/.openclaw/workspace/`     | (default for all unbound channels) | MiniMatt persona lives here                       |
| `claudedevtools` | `~/projects/ClaudeDevTools/` | `1508647803101118558`              | First per-project binding, established 2026-06-09 |

**Persona consistency across project agents:** each project workspace symlinks `IDENTITY.md`, `SOUL.md`, `USER.md`, `TOOLS.md` from `~/.openclaw/workspace/`. `AGENTS.md`, `MEMORY.md`, `HEARTBEAT.md`, `BOOT.md` stay workspace-specific. Project's own `CLAUDE.md`/`AGENTS.md`/`spec.md` if present remain project-local.

**Auto-memory caveat:** each agent's workspace becomes a distinct Claude CLI project root, so auto-memory fragments — `~/.claude/projects/-home-minimatt-projects-<name>/memory/` is separate from the openclaw workspace's. Each project agent starts with no auto-memory of the user; symlinked persona files are the cross-project continuity mechanism.

## Plugins

Auto-loaded (verify with `openclaw plugins list`): acpx, anthropic, browser, canvas, device-pair, discord, duckduckgo, file-transfer, memory-core, phone-control, talk-voice — 11 bundled.

Explicitly enabled in `plugins.entries`: `anthropic`, `discord`, `duckduckgo`.

**Discord plugin sourcing gotcha:** Discord (and other monorepo extensions) ship both bundled-with-the-fork-dist AND as standalone npm packages. Standalone npm installs SHADOW the bundled version (origin `global` wins over origin `bundled`). The standalone Discord install was removed on 2026-06-02 from `~/.openclaw/npm/node_modules/@openclaw/discord/`. If you ever see a plugin loading from `~/.openclaw/npm/node_modules/<scope>/<name>/` instead of the bundled fork version, prune it: edit `~/.openclaw/npm/package.json` to drop the dep, `npm install` (which prunes), `rmdir` any leftover empty scope dirs, restart.

## Hooks

```jsonc
"hooks": { "internal": { "enabled": true } }
```

`internal.enabled: true` loads all bundled hooks. Currently active:

- 🚀 `boot-md` (`gateway:startup`) — runs `BOOT.md` on gateway boot; posts the "back online" message after restart.
- 📎 `bootstrap-extra-files` (`agent:bootstrap`) — injects extra workspace files into prompt context via globs.
- 📝 `command-logger` (`command`) — appends every command invocation to `~/.openclaw/logs/commands.log`.
- 🧹 `compaction-notifier` (`session:compact:before`/`:after`) — visible chat notice on session compaction.
- 💾 `session-memory` (`command:new`, `command:reset`) — writes a dated memory file to the agent's workspace `memory/` dir.

## CLI backend / watchdog override

Raises the no-output watchdog from defaults that capped resume sessions at 180s (caused repeated CLI subprocess kills on long bash tool calls):

```json
"agents.defaults.cliBackends.claude-cli": {
  "command": "claude",
  "reliability": {
    "watchdog": {
      "fresh":  { "noOutputTimeoutMs": 600000, "maxMs": 600000 },
      "resume": { "noOutputTimeoutMs": 600000, "maxMs": 600000 }
    }
  }
}
```

`command: "claude"` is only here to satisfy strict schema validation; the runtime merge keeps the anthropic plugin's full backend definition (args, output mode, session config, etc.).

## Patches applied to the fork

Committed on `main`:

- `98fa5aefa7` — `fix(channels/discord): keep terminal status reaction visible on failure` (sticky-❌ on failure paths; ✅ stays transient).
- `703cc6540c` — `fix(channels/discord): await status reaction cleanup so restart drain catches it` (inline-await the post-success cleanup so a gateway restart drain finishes it before exit, preventing stranded reactions).
- `4c19adaa06` + follow-up `9ff5a3b69e` — `fix(agents,channels/discord): surface Claude CLI auth failures with re-auth message and ❌ reaction`. **Deployed and verified end-to-end 2026-07-30** via `claude auth logout` on this box: gateway posted `⚠️ Model login expired on the gateway for anthropic. Re-auth with 'openclaw models auth login --provider anthropic', then try again.` and ❌ landed on the user's Discord message; `claude auth login` restored normal ✅ replies. Structural + message-level detection of `FailoverError`/`FallbackSummaryError` with credential-expiry hints at the last-resort classifier position (after auth-profile, provider-request, missing-key, OAuth-refresh classifiers). Follow-up `9ff5a3b69e` was necessary because the initial `4c19adaa06` required `reason=auth` from the upstream classifier, but Claude CLI's actual logout error text `"Not logged in · Please run /login"` classifies as `reason=unknown` (`AUTH_INVALID_TOKEN_HINT_RE` in `src/agents/embedded-agent-helpers/errors.ts:355` doesn't match "logged in" phrasing), so the message-level detection now fires independently of upstream reason. New `runTerminalErrorSurface` metadata marker on `ReplyPayloadMetadata` (WeakMap-keyed; deliberately not `payload.isError` because WhatsApp filters that flag); Discord message-handler consults it at all three final-delivery sites (`onPreviewFinalized`, `onNormalDelivered`, standard-send tail) to flip the reaction to ❌. Marker folded into `markAgentRunFailureReplyPayload` so all terminal-failure copy — auth, billing, rate-limit, preflight compaction, context overflow, generic fallback, restart-lifecycle, fallback-backend-unreachable, memory-flush — flips ❌ on Discord. Slack/Telegram sibling status-reaction consumers still show ✅ for the same failed run — the metadata marker is generic, so wiring those is a small follow-up.

Both verified live by `grep "await statusReactions.clear" ~/projects/openclaw/dist/message-handler.process-*.js` returning 1+ match. Patches were authored against the source, built in the worktree, rsynced to live dist, and the gateway restarted to pick them up.

## State / migrations

- Agent state root: `~/.openclaw/`.
- Session store (per agent): `~/.openclaw/agents/<agentId>/sessions/sessions.json` — keys like `agent:<agentId>:discord:channel:<channelId>`.
- openclaw per-session jsonl: `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl` (often metadata-only when provider = claude-cli).
- Claude CLI session jsonls (real conversation when provider = claude-cli): `~/.claude/projects/<cwd-slug>/<claudeCliSessionId>.jsonl`.
- One-way migrations done first 2026.6.2 boot: plugin install index, task registry, task flow now in SQLite. Legacy sources archived alongside as `*.migrated`.

## Keeping this out of upstream

This `.matt/docs/` directory lives on this fork (`mattzyha/openclaw`) only and must never reach `openclaw/openclaw` upstream. To enforce:

1. **Commit normally on your fork's `main`** — pushing to `origin` keeps it on `mattzyha/openclaw`.
2. **When upstreaming a code change**, always branch from `upstream/main`, never from your own main:
   ```bash
   git fetch upstream
   git checkout -b feature-x upstream/main
   git cherry-pick <hash-of-code-commit>     # only the code change
   git push origin feature-x
   gh pr create --repo openclaw/openclaw --base main --head mattzyha:feature-x
   ```
3. PRs from `feature-x` diff against upstream/main — the `.matt/` directory was never there, so it can't appear in the PR.
4. **Optional belt+suspenders:** disable push to the upstream remote so the command physically can't go through:
   ```bash
   git remote set-url --push upstream DO_NOT_PUSH
   ```
