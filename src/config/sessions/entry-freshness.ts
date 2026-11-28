// Session entry reset freshness resolves the same lifecycle rule used by reply setup.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import type { SessionConfig, SessionResetConfig } from "../types.base.js";
import { getCliSessionBinding } from "./cli-session-binding.js";
import { resolveSessionLifecycleTimestamps } from "./lifecycle.js";
import { resolveStorePath as resolveSessionStorePath } from "./paths.js";
import {
  evaluateSessionFreshness,
  resolveSessionResetPolicy,
  type SessionFreshness,
  type SessionResetPolicy,
  type SessionResetType,
} from "./reset.js";
import { loadSessionEntry, type SessionAccessScope } from "./session-accessor.js";
import type { SessionEntry } from "./types.js";

export type ResolveSessionEntryResetFreshnessParams = SessionAccessScope & {
  now?: number;
  resetOverride?: SessionResetConfig;
  resetType: SessionResetType;
  sessionCfg?: SessionConfig;
};

export type SessionEntryLifecycleTimestamps = {
  sessionStartedAt?: number;
  lastInteractionAt?: number;
};

export type ResolvedSessionEntryResetFreshness =
  | {
      state: "missing";
      entry: undefined;
      freshness: undefined;
      lifecycleTimestamps: SessionEntryLifecycleTimestamps;
      resetPolicy: SessionResetPolicy;
      resetType: SessionResetType;
    }
  | {
      state: "fresh" | "stale";
      entry: SessionEntry;
      freshness: SessionFreshness;
      lifecycleTimestamps: SessionEntryLifecycleTimestamps;
      resetPolicy: SessionResetPolicy;
      resetType: SessionResetType;
    };

/**
 * True when a CLI backend owns the conversation behind this entry, which exempts it from
 * implicit (unconfigured) daily/idle expiry.
 */
export function hasProviderOwnedSession(entry: SessionEntry | undefined): boolean {
  // CLI bindings are filed under the runtime provider that ran the turn (modelProvider, e.g.
  // "claude-cli"). A model override, including the automatic model-fallback pin, names the
  // canonical provider instead (e.g. "anthropic") while the same CLI backend keeps running the
  // session. Check both ids: reading only the override made a fallback drop the exemption and
  // reset the session on its next message.
  return [entry?.providerOverride, entry?.modelProvider].some((candidate) => {
    const provider = normalizeOptionalString(candidate);
    return Boolean(provider && getCliSessionBinding(entry, provider));
  });
}

/** Resolves one session entry's reset freshness using the runtime lifecycle rules. */
export function resolveSessionEntryResetFreshness(
  params: ResolveSessionEntryResetFreshnessParams,
): ResolvedSessionEntryResetFreshness {
  const agentId = params.agentId ?? resolveAgentIdFromSessionKey(params.sessionKey);
  const sessionCfg = params.sessionCfg;
  const storePath =
    params.storePath ??
    resolveSessionStorePath(sessionCfg?.store, {
      agentId,
      env: params.env,
    });
  const entry = loadSessionEntry({
    ...params,
    agentId,
    storePath,
  });
  const resetType = params.resetType;
  const resetPolicy = resolveSessionResetPolicy({
    sessionCfg,
    resetType,
    resetOverride: params.resetOverride,
  });
  const lifecycleTimestamps = resolveSessionLifecycleTimestamps({
    entry,
    agentId,
    storePath,
  });
  const base = {
    lifecycleTimestamps,
    resetPolicy,
    resetType,
  };
  if (!entry) {
    return {
      state: "missing",
      entry: undefined,
      freshness: undefined,
      ...base,
    };
  }
  const freshness =
    resetPolicy.configured !== true && hasProviderOwnedSession(entry)
      ? ({ fresh: true } satisfies SessionFreshness)
      : evaluateSessionFreshness({
          updatedAt: entry.updatedAt,
          sessionStartedAt: lifecycleTimestamps.sessionStartedAt,
          lastInteractionAt: lifecycleTimestamps.lastInteractionAt,
          now: params.now ?? Date.now(),
          policy: resetPolicy,
        });
  return {
    state: freshness.fresh ? "fresh" : "stale",
    entry,
    freshness,
    ...base,
  };
}
