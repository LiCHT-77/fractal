/**
 * Shared mock factories and helpers for Fractal test suite.
 */

import type { MockInstance } from "vitest";

// ─── JSON-RPC Message Builders ───

export function makeRequest(
  method: string,
  params?: Record<string, unknown>,
  id?: string | number | null,
) {
  const msg: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (params !== undefined) msg.params = params;
  if (id !== undefined) msg.id = id;
  return msg;
}

export function makeNotification(
  method: string,
  params?: Record<string, unknown>,
) {
  const msg: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (params !== undefined) msg.params = params;
  return msg;
}

export function makeSuccessResponse(
  result: unknown,
  id: string | number | null,
) {
  return { jsonrpc: "2.0" as const, result, id };
}

export function makeErrorResponse(
  code: number,
  message: string,
  id: string | number | null,
  data?: unknown,
) {
  const error: Record<string, unknown> = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0" as const, error, id };
}

// ─── Endpoint Mock ───

export interface MockEndpoint {
  send: MockInstance<(message: unknown) => void>;
  onMessage: MockInstance<
    (handler: (message: unknown, event: MessageEvent) => void) => () => void
  >;
  /** Simulate receiving a message through the endpoint */
  receive(data: unknown, eventOverrides?: Partial<MessageEvent>): void;
  /** All registered message handlers */
  handlers: Array<(message: unknown, event: MessageEvent) => void>;
}

export function createMockEndpoint(): MockEndpoint {
  const handlers: Array<(message: unknown, event: MessageEvent) => void> = [];

  const send = vi.fn<(message: unknown) => void>();

  const onMessage = vi.fn<
    (handler: (message: unknown, event: MessageEvent) => void) => () => void
  >((handler) => {
    handlers.push(handler);
    return () => {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    };
  });

  const receive = (data: unknown, eventOverrides?: Partial<MessageEvent>) => {
    const event = { data, ...eventOverrides } as MessageEvent;
    for (const handler of [...handlers]) {
      handler(data, event);
    }
  };

  return { send, onMessage, receive, handlers };
}

// ─── Window Mock ───

export interface MockWindow {
  postMessage: MockInstance<(message: unknown, targetOrigin: string) => void>;
  addEventListener: MockInstance;
  removeEventListener: MockInstance;
  /** Simulate dispatching a message event on this window */
  dispatchMessage(
    data: unknown,
    options?: { origin?: string; source?: unknown },
  ): void;
  _listeners: Array<(event: MessageEvent) => void>;
}

export function createMockWindow(): MockWindow {
  const listeners: Array<(event: MessageEvent) => void> = [];

  const postMessage = vi.fn<(message: unknown, targetOrigin: string) => void>();

  const addEventListener = vi.fn(
    (type: string, handler: (event: MessageEvent) => void) => {
      if (type === "message") listeners.push(handler);
    },
  );

  const removeEventListener = vi.fn(
    (type: string, handler: (event: MessageEvent) => void) => {
      if (type === "message") {
        const idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    },
  );

  const dispatchMessage = (
    data: unknown,
    options?: { origin?: string; source?: unknown },
  ) => {
    const event = {
      data,
      origin: options?.origin ?? "https://example.com",
      source: options?.source,
    } as MessageEvent;
    for (const listener of [...listeners]) {
      listener(event);
    }
  };

  return {
    postMessage,
    addEventListener,
    removeEventListener,
    dispatchMessage,
    _listeners: listeners,
  };
}

// ─── MessagePort Mock ───

export interface MockMessagePort {
  postMessage: MockInstance<(message: unknown) => void>;
  addEventListener: MockInstance;
  removeEventListener: MockInstance;
  start: MockInstance;
  close: MockInstance;
  /** Simulate dispatching a message event on this port */
  dispatchMessage(data: unknown): void;
  _listeners: Array<(event: MessageEvent) => void>;
}

export function createMockMessagePort(): MockMessagePort {
  const listeners: Array<(event: MessageEvent) => void> = [];

  const postMessage = vi.fn<(message: unknown) => void>();
  const start = vi.fn();
  const close = vi.fn();

  const addEventListener = vi.fn(
    (type: string, handler: (event: MessageEvent) => void) => {
      if (type === "message") listeners.push(handler);
    },
  );

  const removeEventListener = vi.fn(
    (type: string, handler: (event: MessageEvent) => void) => {
      if (type === "message") {
        const idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    },
  );

  const dispatchMessage = (data: unknown) => {
    const event = { data } as MessageEvent;
    for (const listener of [...listeners]) {
      listener(event);
    }
  };

  return {
    postMessage,
    addEventListener,
    removeEventListener,
    start,
    close,
    dispatchMessage,
    _listeners: listeners,
  };
}

// ─── Worker Mock ───

export interface MockWorker {
  postMessage: MockInstance<(message: unknown) => void>;
  addEventListener: MockInstance;
  removeEventListener: MockInstance;
  /** Simulate dispatching a message event on this worker */
  dispatchMessage(data: unknown): void;
  _listeners: Array<(event: MessageEvent) => void>;
}

export function createMockWorker(): MockWorker {
  const listeners: Array<(event: MessageEvent) => void> = [];

  const postMessage = vi.fn<(message: unknown) => void>();

  const addEventListener = vi.fn(
    (type: string, handler: (event: MessageEvent) => void) => {
      if (type === "message") listeners.push(handler);
    },
  );

  const removeEventListener = vi.fn(
    (type: string, handler: (event: MessageEvent) => void) => {
      if (type === "message") {
        const idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    },
  );

  const dispatchMessage = (data: unknown) => {
    const event = { data } as MessageEvent;
    for (const listener of [...listeners]) {
      listener(event);
    }
  };

  return {
    postMessage,
    addEventListener,
    removeEventListener,
    dispatchMessage,
    _listeners: listeners,
  };
}

// ─── ServiceWorker Mock ───

export interface MockServiceWorker {
  postMessage: MockInstance<
    (message: unknown, transfer?: Transferable[]) => void
  >;
}

export function createMockServiceWorker(): MockServiceWorker {
  return {
    postMessage: vi.fn<(message: unknown, transfer?: Transferable[]) => void>(),
  };
}

// ─── ServiceWorkerContainer Mock ───

export interface MockServiceWorkerContainer {
  ready: Promise<{ active: MockServiceWorker | null }>;
  _resolveReady: (reg: { active: MockServiceWorker | null }) => void;
  _rejectReady: (error: Error) => void;
}

export function createMockServiceWorkerContainer(): MockServiceWorkerContainer {
  let resolveReady!: (reg: { active: MockServiceWorker | null }) => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<{ active: MockServiceWorker | null }>(
    (resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    },
  );
  return { ready, _resolveReady: resolveReady, _rejectReady: rejectReady };
}

// ─── ServiceWorkerGlobalScope Mock ───

export interface MockServiceWorkerGlobalScope {
  addEventListener: MockInstance;
  removeEventListener: MockInstance;
  /** Simulate dispatching a message event with optional ports (as in ExtendableMessageEvent) */
  dispatchMessage(data: unknown, ports?: MockMessagePort[]): void;
  _listeners: Array<(event: MessageEvent) => void>;
}

export function createMockServiceWorkerGlobalScope(): MockServiceWorkerGlobalScope {
  const listeners: Array<(event: MessageEvent) => void> = [];

  const addEventListener = vi.fn(
    (type: string, handler: (event: MessageEvent) => void) => {
      if (type === "message") listeners.push(handler);
    },
  );

  const removeEventListener = vi.fn(
    (type: string, handler: (event: MessageEvent) => void) => {
      if (type === "message") {
        const idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    },
  );

  const dispatchMessage = (data: unknown, ports?: MockMessagePort[]) => {
    const event = {
      data,
      ports: ports ?? [],
    } as unknown as MessageEvent;
    for (const listener of [...listeners]) {
      listener(event);
    }
  };

  return {
    addEventListener,
    removeEventListener,
    dispatchMessage,
    _listeners: listeners,
  };
}
