import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type {
  ReplyDispatcherOptions,
  ReplyDispatcherWithTypingOptions,
} from "./reply-dispatcher.js";

type BufferedDispatchFn =
  typeof import("../dispatch.js").dispatchInboundMessageWithBufferedDispatcher;
type PlainDispatchFn = typeof import("../dispatch.js").dispatchInboundMessageWithDispatcher;

const hoisted = vi.hoisted(() => ({
  bufferedDispatchMock: vi.fn(),
  plainDispatchMock: vi.fn(),
}));

vi.mock("../dispatch.js", () => ({
  dispatchInboundMessageWithBufferedDispatcher: (...args: Parameters<BufferedDispatchFn>) =>
    hoisted.bufferedDispatchMock(...args),
  dispatchInboundMessageWithDispatcher: (...args: Parameters<PlainDispatchFn>) =>
    hoisted.plainDispatchMock(...args),
}));

const { dispatchReplyWithBufferedBlockDispatcher, dispatchReplyWithDispatcher } =
  await import("./provider-dispatcher.js");
const { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } =
  await import("../../config/runtime-snapshot.js");

const dispatchResult = {
  queuedFinal: false,
  counts: { tool: 0, block: 0, final: 0 },
};

describe("provider dispatcher wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.bufferedDispatchMock.mockResolvedValue(dispatchResult);
    hoisted.plainDispatchMock.mockResolvedValue(dispatchResult);
  });

  it("forwards runtime toolsAllow through the buffered wrapper", async () => {
    const dispatcherOptions = {
      deliver: async () => ({ visibleReplySent: false }),
    } satisfies ReplyDispatcherWithTypingOptions;

    await dispatchReplyWithBufferedBlockDispatcher({
      ctx: { Body: "hello" },
      cfg: {} as OpenClawConfig,
      dispatcherOptions,
      toolsAllow: ["message"],
    });

    expect(hoisted.bufferedDispatchMock).toHaveBeenCalledTimes(1);
    expect(hoisted.bufferedDispatchMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        dispatcherOptions,
        toolsAllow: ["message"],
      }),
    );
  });

  it("forwards runtime toolsAllow through the plain wrapper", async () => {
    const dispatcherOptions = {
      deliver: async () => ({ visibleReplySent: false }),
    } satisfies ReplyDispatcherOptions;

    await dispatchReplyWithDispatcher({
      ctx: { Body: "hello" },
      cfg: {} as OpenClawConfig,
      dispatcherOptions,
      toolsAllow: ["message"],
    });

    expect(hoisted.plainDispatchMock).toHaveBeenCalledTimes(1);
    expect(hoisted.plainDispatchMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        dispatcherOptions,
        toolsAllow: ["message"],
      }),
    );
  });
});

describe("hot-apply: omitted cfg resolves against the runtime snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.bufferedDispatchMock.mockResolvedValue(dispatchResult);
    hoisted.plainDispatchMock.mockResolvedValue(dispatchResult);
  });
  afterEach(() => {
    clearRuntimeConfigSnapshot();
  });

  it("buffered wrapper defaults omitted cfg to the pinned snapshot (#47138 follow-up)", async () => {
    const snapshot = { agents: { list: [{ id: "hot" }] } } as OpenClawConfig;
    setRuntimeConfigSnapshot(snapshot);
    await dispatchReplyWithBufferedBlockDispatcher({
      ctx: { Body: "hello" },
      dispatcherOptions: {
        deliver: async () => ({ visibleReplySent: false }),
      } satisfies ReplyDispatcherWithTypingOptions,
    });
    expect(hoisted.bufferedDispatchMock.mock.calls[0]?.[0]?.cfg).toBe(snapshot);
  });

  it("plain wrapper defaults omitted cfg to the pinned snapshot", async () => {
    const snapshot = { agents: { list: [{ id: "hot" }] } } as OpenClawConfig;
    setRuntimeConfigSnapshot(snapshot);
    await dispatchReplyWithDispatcher({
      ctx: { Body: "hello" },
      dispatcherOptions: {
        deliver: async () => ({ visibleReplySent: false }),
      } satisfies ReplyDispatcherOptions,
    });
    expect(hoisted.plainDispatchMock.mock.calls[0]?.[0]?.cfg).toBe(snapshot);
  });

  it("explicit cfg still wins over the snapshot (test-injection seam)", async () => {
    const snapshot = { agents: { list: [{ id: "hot" }] } } as OpenClawConfig;
    const explicit = { agents: { list: [{ id: "pinned" }] } } as OpenClawConfig;
    setRuntimeConfigSnapshot(snapshot);
    await dispatchReplyWithBufferedBlockDispatcher({
      ctx: { Body: "hello" },
      cfg: explicit,
      dispatcherOptions: {
        deliver: async () => ({ visibleReplySent: false }),
      } satisfies ReplyDispatcherWithTypingOptions,
    });
    expect(hoisted.bufferedDispatchMock.mock.calls[0]?.[0]?.cfg).toBe(explicit);
  });
});
