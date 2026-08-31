# Openclaw Fork — Roadmap

Forward-looking ideas, in no particular order. Items here haven't been committed to — they're things worth doing if/when they become relevant.

## Operational hardening

- **Disable push to `upstream`** — done 2026-06-09 (`git remote set-url --push upstream DO_NOT_PUSH`).
- **Pre-push hook** that blocks pushes containing `.matt/` paths to any remote other than `origin`. Belt-and-suspenders.
- **Status-message behavior, source-level:** consider patching the gateway so the post-restart status message workflow is native rather than relying on the BOOT.md convention. Lower-priority since BOOT.md works today.

## Channel/agent bindings

- Current bindings: `main` (default), `claudedevtools`, `todoistautomations`, `obsidianvaultcleaner`, `openclaw`. See `spec.md` for the full table.
- _(Add more as new project channels go live.)_

## Source-level patches worth considering

- Sticky-❌ + inline-await fixes — already landed in our fork (`98fa5aefa7`, `703cc6540c`). Worth a PR upstream eventually once we've battle-tested them in production.
- If/when we patch any additional Discord plugin behavior, follow the same pattern: write the patch, build in the worktree, rsync, restart, verify.

## Auth migration (contingency)

- If Anthropic disables OAuth for openclaw, switch `auth.profiles.anthropic:claude-cli.mode` from `"oauth"` to API-key mode. Most operational config stays the same; billing switches from flat-rate subscription to per-token.

## Memory architecture

- Consider a shared cross-agent memory location for things that should apply to every project agent (e.g. user preferences, feedback rules). Today these live only in the `main` agent's auto-memory and don't carry over to project agents.

## Documentation

- Fill in `status.md` and this `roadmap.md` over time as the fork evolves.
- Add per-project specs in `.matt/docs/` for projects that grow large enough to warrant them.
- Fold remaining config surfaces into `spec.md`: `auth.profiles`, Discord channel-adapter config (guild/account/token source), provider/model defaults, memory provider (openai embeddings), and per-agent `tools.profile` values.

## Memory

- Build the openclaw memory search index per workspace (`openclaw memory status --index --agent <id>`) so cross-session semantic recall actually works. Current state: `Dirty: yes` on both `main` and `claudedevtools`; unbuilt on the new project agents.
