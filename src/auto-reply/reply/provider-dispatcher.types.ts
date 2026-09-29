// Shared provider dispatch type contracts for reply runtime execution.
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { GetReplyOptions } from "../get-reply-options.types.js";
import type { FinalizedMsgContext, MsgContext } from "../templating.js";
import type { DispatchFromConfigResult } from "./dispatch-from-config.types.js";
import type { GetReplyFromConfig } from "./get-reply.types.js";
import type {
  ReplyDispatcherOptions,
  ReplyDispatcherWithTypingOptions,
} from "./reply-dispatcher.js";

type DispatchReplyContext = MsgContext | FinalizedMsgContext;
type DispatchReplyOptions = Omit<GetReplyOptions, "onBlockReply">;

/** Buffered block dispatcher entry point used by provider reply flows. */
export type DispatchReplyWithBufferedBlockDispatcher = (params: {
  ctx: DispatchReplyContext;
  /**
   * Config to dispatch against. Omit to use the current runtime config
   * snapshot so agent-definition changes (workspace, per-agent settings)
   * hot-apply without a restart. Long-lived channel monitors should omit
   * this rather than thread a startup-captured config; explicit cfg stays
   * as a test-injection seam.
   */
  cfg?: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  toolsAllow?: string[];
  replyOptions?: DispatchReplyOptions;
  replyResolver?: GetReplyFromConfig;
}) => Promise<DispatchFromConfigResult>;

/** Plain dispatcher entry point used when block buffering is not needed. */
export type DispatchReplyWithDispatcher = (params: {
  ctx: DispatchReplyContext;
  /** See DispatchReplyWithBufferedBlockDispatcher.cfg: omit for runtime snapshot. */
  cfg?: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  toolsAllow?: string[];
  replyOptions?: DispatchReplyOptions;
  replyResolver?: GetReplyFromConfig;
}) => Promise<DispatchFromConfigResult>;
