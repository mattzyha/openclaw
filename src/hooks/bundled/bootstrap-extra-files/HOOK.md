---
name: bootstrap-extra-files
description: "Inject additional workspace bootstrap files via glob/path patterns"
homepage: https://docs.openclaw.ai/automation/hooks#bootstrap-extra-files
metadata:
  {
    "openclaw":
      {
        "emoji": "📎",
        "events": ["agent:bootstrap"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Bootstrap Extra Files Hook

Loads additional bootstrap files into `Project Context` during `agent:bootstrap`.

## Why

Use this when your workspace has multiple context roots (for example monorepos) and
you want to include extra `AGENTS.md`/`TOOLS.md`-class files without changing the
workspace root.

## Configuration

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "bootstrap-extra-files": {
          "enabled": true,
          "paths": ["packages/*/AGENTS.md", "packages/*/TOOLS.md"]
        }
      }
    }
  }
}
```

## Options

- `paths` (string[]): preferred list of glob/path patterns.
- `patterns` (string[]): alias of `paths`.
- `files` (string[]): alias of `paths`.

Relative paths are resolved from the workspace and must stay inside it (including
realpath checks). Absolute and `~/` paths are operator-trusted — they come from
`openclaw.json`, so they may point outside the workspace (for example a global
`AGENTS.md` shared by every agent). They are read literally (no glob expansion),
keep the per-file size cap, and must be regular files in their configured
directory — a symlink resolving elsewhere is rejected. Only recognized bootstrap
basenames are loaded
(`AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`,
`BOOTSTRAP.md`, `MEMORY.md`).

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "bootstrap-extra-files": {
          "enabled": true,
          "paths": ["~/.openclaw/shared/AGENTS.md"]
        }
      }
    }
  }
}
```
