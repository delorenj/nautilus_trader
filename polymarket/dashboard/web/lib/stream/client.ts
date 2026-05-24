import { StreamEvent as StreamEventSchema } from "./schemas";
import type { ClientMessage } from "./messages";
import type { StreamEvent } from "./types";

export type StreamStatus =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "connected"; sinceMs: number }
  | { phase: "reconnecting"; attempt: number; nextDelayMs: number }
  | { phase: "disconnected"; reason: string };

export type StreamClientOptions = {
  url: string | (() => string);
  onEvent: (event: StreamEvent) => void;
  onStatus: (status: StreamStatus) => void;
  onParseError?: (raw: string, error: unknown) => void;
  wsFactory?: (url: string) => WebSocketLike;
  now?: () => number;
  randomJitter?: () => number;
};

type WebSocketEventType = "open" | "message" | "close" | "error";
type WebSocketListener = (event: unknown) => void;

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: WebSocketEventType, listener: WebSocketListener): void;
}

export interface StreamClient {
  subscribeBooks(asset_ids: string[]): void;
  unsubscribeBooks(asset_ids: string[]): void;
  ping(): void;
  close(): void;
  readonly status: StreamStatus;
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;
const JITTER_SPREAD = 0.4;
const JITTER_FLOOR = 0.8;

export function createStreamClient(opts: StreamClientOptions): StreamClient {
  const wsFactory = opts.wsFactory ?? createBrowserWebSocket;
  const now = opts.now ?? Date.now;
  const randomJitter = opts.randomJitter ?? Math.random;

  let currentStatus: StreamStatus = { phase: "idle" };
  let socket: WebSocketLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let closedByClient = false;
  let hasOpened = false;
  let lastSeenT: number | null = null;
  let queuedMessages: ClientMessage[] = [];
  const activeBookAssetIds = new Set<string>();

  const setStatus = (status: StreamStatus): void => {
    if (sameStatus(currentStatus, status)) {
      return;
    }

    currentStatus = status;
    opts.onStatus(status);
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer === null) {
      return;
    }

    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const sendMessage = (message: ClientMessage): boolean => {
    if (socket === null) {
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  };

  const flushQueuedMessages = (): void => {
    const messages = queuedMessages;
    queuedMessages = [];

    for (const message of messages) {
      sendMessage(message);
    }
  };

  const sendResumeIfNeeded = (): void => {
    if (lastSeenT === null) {
      return;
    }

    sendMessage({ type: "resume", since_t: lastSeenT });
  };

  const sendReconnectSubscriptions = (): void => {
    if (!hasOpened || activeBookAssetIds.size === 0) {
      return;
    }

    const alreadyQueued = queuedSubscribeAssetIds(queuedMessages);
    const assetIds = Array.from(activeBookAssetIds).filter(
      (assetId) => !alreadyQueued.has(assetId),
    );

    if (assetIds.length === 0) {
      return;
    }

    sendMessage({ type: "subscribe.books", asset_ids: assetIds });
  };

  const connect = (): void => {
    if (closedByClient) {
      return;
    }

    clearReconnectTimer();
    setStatus({ phase: "connecting" });

    let nextSocket: WebSocketLike;
    try {
      nextSocket = wsFactory(resolveUrl(opts.url));
    } catch (error) {
      setStatus({ phase: "disconnected", reason: describeError(error) });
      scheduleReconnect();
      return;
    }

    socket = nextSocket;

    nextSocket.addEventListener("open", () => {
      if (socket !== nextSocket || closedByClient) {
        return;
      }

      reconnectAttempt = 0;
      setStatus({ phase: "connected", sinceMs: now() });
      sendResumeIfNeeded();
      sendReconnectSubscriptions();
      hasOpened = true;
      flushQueuedMessages();
    });

    nextSocket.addEventListener("message", (event) => {
      if (socket !== nextSocket || closedByClient) {
        return;
      }

      handleMessage(event);
    });

    nextSocket.addEventListener("close", (event) => {
      if (socket !== nextSocket) {
        return;
      }

      socket = null;
      setStatus({ phase: "disconnected", reason: describeCloseReason(event) });

      if (!closedByClient) {
        scheduleReconnect();
      }
    });

    nextSocket.addEventListener("error", () => {
      // Browsers follow socket errors with a close event; close drives recovery.
    });
  };

  const scheduleReconnect = (): void => {
    if (closedByClient) {
      return;
    }

    reconnectAttempt += 1;
    const nextDelayMs = reconnectDelayMs(reconnectAttempt, randomJitter());
    reconnectTimer = setTimeout(connect, nextDelayMs);
    setStatus({
      phase: "reconnecting",
      attempt: reconnectAttempt,
      nextDelayMs,
    });
  };

  const handleMessage = (event: unknown): void => {
    const raw = extractRawMessage(event);

    try {
      const parsed = JSON.parse(raw);
      const streamEvent = StreamEventSchema.parse(parsed);
      lastSeenT = streamEvent.t;
      opts.onEvent(streamEvent);
    } catch (error) {
      opts.onParseError?.(raw, error);
    }
  };

  const sendOrQueue = (message: ClientMessage): void => {
    if (currentStatus.phase === "connected" && sendMessage(message)) {
      return;
    }

    queuedMessages.push(message);
  };

  connect();

  return {
    subscribeBooks(asset_ids) {
      for (const assetId of asset_ids) {
        activeBookAssetIds.add(assetId);
      }

      sendOrQueue({ type: "subscribe.books", asset_ids });
    },
    unsubscribeBooks(asset_ids) {
      for (const assetId of asset_ids) {
        activeBookAssetIds.delete(assetId);
      }

      sendOrQueue({ type: "unsubscribe.books", asset_ids });
    },
    ping() {
      sendOrQueue({ type: "ping" });
    },
    close() {
      closedByClient = true;
      clearReconnectTimer();

      const currentSocket = socket;
      socket = null;

      if (currentSocket !== null) {
        currentSocket.close();
      }

      setStatus({ phase: "disconnected", reason: "closed" });
    },
    get status() {
      return currentStatus;
    },
  };
}

function createBrowserWebSocket(url: string): WebSocketLike {
  const browserWebSocket = new WebSocket(url);

  return {
    send(data) {
      browserWebSocket.send(data);
    },
    close() {
      browserWebSocket.close();
    },
    addEventListener(type, listener) {
      browserWebSocket.addEventListener(type, (event) => listener(event));
    },
  };
}

function resolveUrl(url: string | (() => string)): string {
  return typeof url === "function" ? url() : url;
}

function reconnectDelayMs(attempt: number, jitter: number): number {
  const baseDelay = Math.min(
    BASE_RECONNECT_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    MAX_RECONNECT_DELAY_MS,
  );
  const jitterRatio = JITTER_FLOOR + clamp01(jitter) * JITTER_SPREAD;

  return Math.round(baseDelay * jitterRatio);
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function queuedSubscribeAssetIds(messages: ClientMessage[]): Set<string> {
  const assetIds = new Set<string>();

  for (const message of messages) {
    if (message.type !== "subscribe.books") {
      continue;
    }

    for (const assetId of message.asset_ids) {
      assetIds.add(assetId);
    }
  }

  return assetIds;
}

function extractRawMessage(event: unknown): string {
  if (typeof event === "string") {
    return event;
  }

  if (typeof event === "object" && event !== null && "data" in event) {
    const data = event.data;

    if (typeof data === "string") {
      return data;
    }
  }

  return "";
}

function describeCloseReason(event: unknown): string {
  if (typeof event === "object" && event !== null && "reason" in event) {
    const reason = event.reason;

    if (typeof reason === "string" && reason.length > 0) {
      return reason;
    }
  }

  return "socket closed";
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "failed to connect";
}

function sameStatus(left: StreamStatus, right: StreamStatus): boolean {
  if (left.phase !== right.phase) {
    return false;
  }

  switch (left.phase) {
    case "idle":
    case "connecting":
      return true;
    case "connected":
      return right.phase === "connected" && left.sinceMs === right.sinceMs;
    case "reconnecting":
      return (
        right.phase === "reconnecting" &&
        left.attempt === right.attempt &&
        left.nextDelayMs === right.nextDelayMs
      );
    case "disconnected":
      return right.phase === "disconnected" && left.reason === right.reason;
  }
}
