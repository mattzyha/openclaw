#!/usr/bin/env bash
# Fork deploy: build in the worktree, rsync BOTH dist trees to the live checkout, verify, restart.
# Spec: .matt/docs/spec.md ("TL;DR build & deploy flow"). Never run `pnpm build` in the live checkout.
#
# Usage: .matt/scripts/deploy.sh [--sha <ref>] [--skip-build] [--no-restart] [--dry-run]
#                                [--reason "<why>"] [--channel <discord-id>] [--marker <substr>]...
#   --sha        ref to build (default: main HEAD of the live checkout)
#   --skip-build reuse the worktree's existing dist/ + dist-runtime/ (no reset/install/build)
#   --marker     substring that must appear in live dist/*.js after rsync (repeatable)
#   --reason     text for ~/.openclaw/workspace/RESTART_REASON.md (BOOT.md protocol); restart is
#                scheduled via systemd-run --on-active=30 unless --no-restart
#   --dry-run    print what would happen; only read-only checks run
set -euo pipefail

SRC=/home/minimatt/projects/openclaw
BUILD=/home/minimatt/projects/openclaw-build
PNPM=/home/minimatt/.npm-global/bin/pnpm
OPENCLAW=/home/minimatt/.npm-global/bin/openclaw
BACKUP_ROOT=/home/minimatt/dist-backups
REASON_FILE=/home/minimatt/.openclaw/workspace/RESTART_REASON.md
BUILD_TIMEOUT=600
CHANNEL=1509056381460811879   # #openclaw

sha=""; skip_build=0; no_restart=0; dry_run=0; reason=""; markers=()
while [ $# -gt 0 ]; do
  case "$1" in
    --sha) sha="$2"; shift 2 ;;
    --skip-build) skip_build=1; shift ;;
    --no-restart) no_restart=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    --reason) reason="$2"; shift 2 ;;
    --channel) CHANNEL="$2"; shift 2 ;;
    --marker) markers+=("$2"); shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

log() { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
run() { if [ "$dry_run" = 1 ]; then echo "  (dry-run) $*"; else "$@"; fi; }

[ "$(pwd -P)" = "$BUILD" ] || [ -d "$BUILD/.git" ] || [ -f "$BUILD/.git" ] || { echo "build worktree missing: $BUILD" >&2; exit 1; }
sha=${sha:-$(git -C "$SRC" rev-parse main)}
short=$(git -C "$SRC" rev-parse --short "$sha")
log "deploying $short ($(git -C "$SRC" log -1 --format=%s "$sha"))"

# 1. Build in the worktree (detached: survives the caller, avoids the CLI no-output watchdog).
if [ "$skip_build" = 0 ]; then
  run git -C "$BUILD" reset --hard "$sha" --quiet
  log "pnpm install --silent in $BUILD (hard-links from the pnpm store; installs no new packages)"
  run "$PNPM" -C "$BUILD" install --silent
  unit="openclaw-build-$(date +%H%M%S)"
  started=$(date +%s)
  run systemd-run --user --unit="$unit" --working-directory="$BUILD" \
    --setenv=PATH=/home/minimatt/.npm-global/bin:/usr/local/bin:/usr/bin:/bin \
    -- "$PNPM" build
  if [ "$dry_run" = 0 ]; then
    log "build unit $unit running (~5 min); polling up to ${BUILD_TIMEOUT}s"
    timeout "$BUILD_TIMEOUT" bash -c "while systemctl --user is-active --quiet $unit; do sleep 15; done" || {
      echo "build still running after ${BUILD_TIMEOUT}s; check: systemctl --user status $unit" >&2; exit 1; }
    result=$(systemctl --user show "$unit" -p Result --value)
    [ "$result" = success ] || { echo "build failed: Result=$result (journalctl --user -u $unit)" >&2; exit 1; }
    [ "$(stat -c %Y "$BUILD/dist/index.js")" -ge "$started" ] || { echo "dist/index.js not refreshed by build" >&2; exit 1; }
    log "build ok in $(( $(date +%s) - started ))s"
  fi
fi
[ -d "$BUILD/dist/extensions" ] && [ -d "$BUILD/dist-runtime/extensions" ] || { echo "worktree lacks dist/ or dist-runtime/" >&2; exit 1; }

# 2. Back up the live trees, then rsync BOTH (dist-runtime symlinks point into dist/; a stale
#    overlay yields boot-time "Cannot find module '../../../dist/extensions/...'" errors).
backup="$BACKUP_ROOT/$(date +%F-%H%M)-pre-$short"
log "backup -> $backup"
run mkdir -p "$backup"
run rsync -a "$SRC/dist/" "$backup/dist/"
run rsync -a "$SRC/dist-runtime/" "$backup/dist-runtime/"
log "rsync dist/ + dist-runtime/ -> live"
run rsync -a --delete "$BUILD/dist/" "$SRC/dist/"
run rsync -a --delete "$BUILD/dist-runtime/" "$SRC/dist-runtime/"

# 3. Post-deploy assertions (read-only; run even in dry-run against the current live trees).
missing=0
for f in "$SRC"/dist-runtime/extensions/*/*.js; do
  t=$(\grep -oP 'from "\K[^"]+' "$f" | head -1) || true
  [ -z "$t" ] && continue
  [ -e "$(dirname "$f")/$t" ] || { echo "MISSING $f -> $t" >&2; missing=1; }
done
[ "$missing" = 0 ] && log "dist-runtime import targets resolve" || { [ "$dry_run" = 1 ] || exit 1; }
for m in "${markers[@]:-}"; do
  [ -z "$m" ] && continue
  n=$(\grep -lF -- "$m" "$SRC"/dist/*.js | wc -l)
  [ "$n" -gt 0 ] && log "marker '$m' in $n live chunk(s)" || { echo "marker '$m' missing from live dist" >&2; [ "$dry_run" = 1 ] || exit 1; }
done

# 4. Restart (BOOT.md: the boot hook reads RESTART_REASON.md and posts to the channel it names).
if [ "$no_restart" = 1 ]; then
  log "restart skipped (--no-restart); run: $OPENCLAW gateway restart"
else
  if [ -n "$reason" ] && [ "$dry_run" = 0 ]; then
    printf '# Restart reason\n\n- **When:** %s\n- **Channel to notify:** %s\n- **Why:** deployed fork commit %s — %s\n- **Ask:** confirm the gateway is back and that `openclaw gateway status` is clean.\n' \
      "$(date '+%F %H:%M %Z')" "$CHANNEL" "$short" "$reason" > "$REASON_FILE"
  fi
  run systemd-run --user --on-active=30 --unit="openclaw-restart-$(date +%H%M%S)" -- "$OPENCLAW" gateway restart
  log "gateway restart scheduled in 30s"
fi
log "rollback: rsync -a --delete $backup/dist/ $SRC/dist/ && rsync -a --delete $backup/dist-runtime/ $SRC/dist-runtime/ && $OPENCLAW gateway restart"
