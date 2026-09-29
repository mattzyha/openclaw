// Dispatch adapters that bridge provider reply resolution into inbound dispatchers.
import { getRuntimeConfig } from "../../config/io.js";
import {
  dispatchInboundMessageWithBufferedDispatcher,
  dispatchInboundMessageWithDispatcher,
} from "../dispatch.js";
import type {
  DispatchReplyWithBufferedBlockDispatcher,
  DispatchReplyWithDispatcher,
} from "./provider-dispatcher.types.js";

export type {
  DispatchReplyWithBufferedBlockDispatcher,
  DispatchReplyWithDispatcher,
} from "./provider-dispatcher.types.js";

/** Dispatch a reply using the buffered block dispatcher path. */
export const dispatchReplyWithBufferedBlockDispatcher: DispatchReplyWithBufferedBlockDispatcher =
  async (params) => {
    return await dispatchInboundMessageWithBufferedDispatcher({
      ctx: params.ctx,
      // Omitted cfg resolves against the live runtime snapshot so agent
      // definitions hot-apply; a startup-captured cfg here would pin
      // workspace/per-agent reads until restart (fork #47138 follow-up).
      cfg: params.cfg ?? getRuntimeConfig(),
      dispatcherOptions: params.dispatcherOptions,
      toolsAllow: params.toolsAllow,
      replyResolver: params.replyResolver,
      replyOptions: params.replyOptions,
    });
  };

/** Dispatch a reply using the standard dispatcher path. */
export const dispatchReplyWithDispatcher: DispatchReplyWithDispatcher = async (params) => {
  return await dispatchInboundMessageWithDispatcher({
    ctx: params.ctx,
    cfg: params.cfg ?? getRuntimeConfig(),
    dispatcherOptions: params.dispatcherOptions,
    toolsAllow: params.toolsAllow,
    replyResolver: params.replyResolver,
    replyOptions: params.replyOptions,
  });
};
