import { isNotification } from "../protocol/codec.ts";
import {
  INTERNAL_ERROR,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  RpcError,
} from "../protocol/errors.ts";
import type {
  Context,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
} from "./context.ts";
import { createContext } from "./context.ts";
import { MiddlewareRegistry } from "./middleware.ts";
import { Router } from "./router.ts";

type Handler<
  TParams extends Record<string, unknown> = Record<string, unknown>,
> = (c: Context<TParams>) => JsonRpcResponse | Promise<JsonRpcResponse>;
type Middleware = (
  c: Context,
  next: () => Promise<void>,
  // biome-ignore lint/suspicious/noConfusingVoidType: middleware may return void
) => JsonRpcResponse | Promise<JsonRpcResponse | undefined> | undefined | void;

type ExtractSuccess<T> = T extends JsonRpcSuccessResponse<infer R> ? R : never;

export type InferResult<H> = H extends (c: Context<infer _P>) => infer Return
  ? ExtractSuccess<Awaited<Return>>
  : never;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return (
    isPlainObject(value) &&
    (value as Record<string, unknown>).jsonrpc === "2.0" &&
    ("result" in value || "error" in value)
  );
}

// biome-ignore lint/complexity/noBannedTypes: {} is the correct default for an empty schema
export class Fractal<S extends Record<string, unknown> = {}> {
  private router: Router;
  private middleware: MiddlewareRegistry;

  constructor(router?: Router, middleware?: MiddlewareRegistry) {
    this.router = router ?? new Router();
    this.middleware = middleware ?? new MiddlewareRegistry();
  }

  method<
    TParams extends Record<string, unknown> = Record<string, unknown>,
    N extends string = string,
    H extends Handler<TParams> = Handler<TParams>,
  >(
    name: N,
    handler: H,
  ): Fractal<S & Record<N, { input: TParams; output: InferResult<H> }>> {
    this.router.add(name, handler as (...args: unknown[]) => unknown);
    return new Fractal<
      S & Record<N, { input: TParams; output: InferResult<H> }>
    >(this.router, this.middleware);
  }

  use(
    patternOrMiddleware: string | Middleware,
    middleware?: Middleware,
  ): Fractal<S> {
    if (typeof patternOrMiddleware === "function") {
      // Global middleware: use(middleware)
      this.middleware.addGlobal(patternOrMiddleware);
    } else {
      // Scoped middleware: use(pattern, middleware)
      if (typeof middleware !== "function") {
        throw new Error("middleware argument is required");
      }
      this.middleware.add(patternOrMiddleware, middleware);
    }
    return new Fractal<S>(this.router, this.middleware);
  }

  async dispatch(
    request: Record<string, unknown>,
    rawEvent?: MessageEvent,
  ): Promise<JsonRpcResponse | undefined> {
    const msg = request as Record<string, unknown>;
    const notification = isNotification(msg);

    // Validate params if present
    if ("params" in msg && msg.params !== undefined) {
      if (!isPlainObject(msg.params)) {
        if (notification) {
          console.error("Invalid params: expected object, got", msg.params);
          return undefined;
        }
        console.error("Invalid params: expected object, got", msg.params);
        return {
          jsonrpc: "2.0",
          error: { code: INVALID_REQUEST, message: "Invalid Request" },
          id: (msg.id ?? null) as string | number | null,
        };
      }
    }

    // Extract method, params, id
    const method = msg.method;
    const params = (msg.params as Record<string, unknown>) ?? {};
    const id = msg.id as string | number | null | undefined;

    // Look up handler
    const handler =
      typeof method === "string" ? this.router.find(method) : undefined;

    if (!handler) {
      if (notification) {
        return undefined;
      }
      return {
        jsonrpc: "2.0",
        error: { code: METHOD_NOT_FOUND, message: "Method not found" },
        id: id ?? null,
      } as JsonRpcResponse;
    }

    // Create context
    const ctx = createContext(
      typeof method === "string" ? method : "",
      params,
      id,
      rawEvent,
    );

    try {
      // Execute middleware chain + handler
      const response = await this.middleware.execute(
        typeof method === "string" ? method : "",
        ctx,
        handler as (c: Context) => JsonRpcResponse | Promise<JsonRpcResponse>,
      );

      // For notifications, log any error that was caught internally by middleware
      if (notification) {
        if (this.middleware._lastError !== undefined) {
          console.error(this.middleware._lastError);
        }
        return undefined;
      }

      if (isJsonRpcResponse(response)) {
        return response;
      }

      // Invalid response from handler/middleware
      return {
        jsonrpc: "2.0",
        error: { code: INTERNAL_ERROR, message: "Internal error" },
        id: id ?? null,
      } as JsonRpcResponse;
    } catch (err: unknown) {
      if (notification) {
        console.error(err);
        return undefined;
      }

      if (err instanceof RpcError) {
        const errorObj: { code: number; message: string; data?: unknown } = {
          code: err.code,
          message: err.message,
        };
        if (err.data !== undefined) {
          errorObj.data = err.data;
        }
        return {
          jsonrpc: "2.0",
          error: errorObj,
          id: id ?? null,
        } as JsonRpcResponse;
      }

      if (err instanceof Error) {
        return {
          jsonrpc: "2.0",
          error: { code: INTERNAL_ERROR, message: err.message },
          id: id ?? null,
        } as JsonRpcResponse;
      }

      return {
        jsonrpc: "2.0",
        error: { code: INTERNAL_ERROR, message: "Internal error" },
        id: id ?? null,
      } as JsonRpcResponse;
    }
  }
}
