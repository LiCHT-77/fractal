export { FractalError, RpcError } from "../protocol/errors.ts";

import type { Fractal } from "../core/app.ts";
import { FractalError, RpcError } from "../protocol/errors.ts";
import type { FractalClient, InferSchema } from "../types.ts";

interface Endpoint {
  send(message: unknown): void;
  onMessage(
    handler: (message: unknown, event: MessageEvent) => void,
  ): () => void;
}

interface ClientOptions {
  defaultTimeout?: number;
}

interface CallOptions {
  timeout?: number;
}

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

const RESERVED_PROPS = new Set<string | symbol>([
  "then",
  "toString",
  "valueOf",
  "toJSON",
  "constructor",
  "__proto__",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
]);

function isReserved(prop: string | symbol): boolean {
  if (typeof prop === "symbol") return true;
  return RESERVED_PROPS.has(prop);
}

function validateTimeout(value: unknown, name: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new TypeError(`${name} must be non-negative`);
  }
  if (value < 0) {
    throw new TypeError(`${name} must be non-negative`);
  }
}

export function createClient<F extends Fractal<Record<string, unknown>>>(
  endpoint: Endpoint,
  options?: ClientOptions,
): FractalClient<InferSchema<F>>;
// biome-ignore lint/suspicious/noExplicitAny: untyped fallback overload
export function createClient(endpoint: Endpoint, options?: ClientOptions): any;
// biome-ignore lint/suspicious/noExplicitAny: implementation signature
export function createClient(endpoint: Endpoint, options?: ClientOptions): any {
  const defaultTimeout = options?.defaultTimeout;
  validateTimeout(defaultTimeout, "defaultTimeout");

  let nextId = 1;
  let disposed = false;
  const pending = new Map<number, PendingEntry>();

  const unsubscribe = endpoint.onMessage((message: unknown) => {
    if (
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    ) {
      return;
    }

    const msg = message as Record<string, unknown>;

    // Must have either "result" or "error" key to be a response
    const hasResult = "result" in msg;
    const hasError = "error" in msg;
    if (!hasResult && !hasError) return;

    const id = msg.id;
    if (typeof id !== "number") return;

    const entry = pending.get(id);
    if (!entry) return;

    // Delete the pending entry before resolving/rejecting
    pending.delete(id);
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
    }

    if (hasError) {
      const err = msg.error as Record<string, unknown>;
      entry.reject(
        new RpcError(err.code as number, err.message as string, err.data),
      );
    } else {
      entry.resolve(msg.result);
    }
  });

  let unsubscribeCalled = false;

  function dispose(): void {
    if (disposed) return;
    disposed = true;

    if (!unsubscribeCalled) {
      unsubscribeCalled = true;
      unsubscribe();
    }

    const error = new FractalError("DISPOSED");
    for (const [, entry] of pending) {
      if (entry.timer !== undefined) {
        clearTimeout(entry.timer);
      }
      entry.reject(error);
    }
    pending.clear();
  }

  function sendRequest(
    method: string,
    params: unknown,
    callOptions?: CallOptions,
  ): Promise<unknown> {
    if (disposed) {
      throw new FractalError("DISPOSED");
    }

    const timeout =
      callOptions?.timeout !== undefined ? callOptions.timeout : defaultTimeout;
    validateTimeout(timeout, "timeout");

    const id = nextId++;
    const request: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
      id,
    };
    if (params !== undefined) {
      request.params = params;
    }

    const promise = new Promise<unknown>((resolve, reject) => {
      const entry: PendingEntry = { resolve, reject };

      if (timeout !== undefined && timeout !== Number.POSITIVE_INFINITY) {
        entry.timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new FractalError("TIMEOUT"));
          }
        }, timeout);
      }

      pending.set(id, entry);

      try {
        endpoint.send(request);
      } catch (err) {
        pending.delete(id);
        if (entry.timer !== undefined) {
          clearTimeout(entry.timer);
        }
        reject(err);
      }
    });

    return promise;
  }

  function sendNotification(method: string, params: unknown): void {
    if (disposed) {
      throw new FractalError("DISPOSED");
    }

    const request: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
    };
    if (params !== undefined) {
      request.params = params;
    }

    endpoint.send(request);
  }

  function createNamespaceProxy(path: string[], isNotify: boolean): unknown {
    const target = () => {};
    return new Proxy(target, {
      get(_target, prop) {
        if (typeof prop === "symbol") return undefined;
        if (isReserved(prop)) return undefined;

        const newPath = [...path, prop];
        return createNamespaceProxy(newPath, isNotify);
      },
      apply(_target, _thisArg, args) {
        const method = path.join(".");
        if (isNotify) {
          sendNotification(method, args[0]);
          return undefined;
        }
        return sendRequest(method, args[0], args[1] as CallOptions | undefined);
      },
    });
  }

  const clientProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") {
          if (prop === Symbol.dispose) return dispose;
          return undefined;
        }

        if (prop === "dispose") return dispose;
        if (prop === "$notify") {
          return createNamespaceProxy([], true);
        }

        if (prop === "then") return undefined;
        if (prop === "toString") {
          return () => "[object FractalClient]";
        }
        if (prop === "valueOf") {
          return () => clientProxy;
        }
        if (RESERVED_PROPS.has(prop)) return undefined;

        return createNamespaceProxy([prop], false);
      },
    },
  );

  return clientProxy;
}
