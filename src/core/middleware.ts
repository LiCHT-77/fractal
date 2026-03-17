import type { Context, JsonRpcResponse } from "./context.ts";
import { createContext } from "./context.ts";

type Next = () => Promise<void>;
type MiddlewareFn = (
  c: Context,
  next: Next,
  // biome-ignore lint/suspicious/noConfusingVoidType: middleware may return void
) => JsonRpcResponse | Promise<JsonRpcResponse | undefined> | undefined | void;

/**
 * Match a dot-separated pattern against a dot-separated method name.
 * - "*" matches exactly one segment
 * - "**" matches one or more segments
 * - A segment containing "*" as part of a longer string (e.g. "admin*") is treated as a literal.
 * - Exact literal segments must match exactly.
 */
export function matchPattern(pattern: string, method: string): boolean {
  const pParts = pattern.split(".");
  const mParts = method.split(".");
  return match(pParts, 0, mParts, 0);
}

function match(
  pParts: string[],
  pi: number,
  mParts: string[],
  mi: number,
): boolean {
  // Both exhausted → success
  if (pi === pParts.length && mi === mParts.length) return true;
  // Pattern exhausted but method remaining → fail
  if (pi === pParts.length) return false;

  const seg = pParts[pi] as string;

  if (seg === "**") {
    // "**" matches 1+ segments
    // Try consuming 1..N method segments for this "**"
    for (let take = 1; take <= mParts.length - mi; take++) {
      if (match(pParts, pi + 1, mParts, mi + take)) return true;
    }
    return false;
  }

  // Method exhausted but pattern remaining (and current is not "**") → fail
  if (mi === mParts.length) return false;

  if (seg === "*") {
    // "*" matches exactly one segment
    return match(pParts, pi + 1, mParts, mi + 1);
  }

  // Literal match
  if (seg === mParts[mi]) {
    return match(pParts, pi + 1, mParts, mi + 1);
  }

  return false;
}

const RESERVED_NAMES = new Set(["$notify", "dispose", "then"]);

function validatePattern(pattern: string): void {
  if (pattern === "") {
    throw new Error("Invalid pattern: empty string");
  }

  if (pattern.startsWith(".")) {
    throw new Error(`Invalid pattern: leading dot in "${pattern}"`);
  }

  if (pattern.endsWith(".")) {
    throw new Error(`Invalid pattern: trailing dot in "${pattern}"`);
  }

  if (pattern.includes("..")) {
    throw new Error(`Invalid pattern: consecutive dots in "${pattern}"`);
  }

  const segments = pattern.split(".");
  const firstSegment = segments[0] as string;

  // Check reserved prefix "rpc."
  if (firstSegment === "rpc" && segments.length > 1) {
    throw new Error('Invalid pattern: "rpc." prefix is reserved');
  }

  // Check reserved first-segment names (but not if it's a wildcard)
  if (firstSegment !== "*" && firstSegment !== "**") {
    if (RESERVED_NAMES.has(firstSegment)) {
      throw new Error(`Invalid pattern: "${firstSegment}" is a reserved name`);
    }
  }
}

interface MiddlewareEntry {
  pattern: string | null; // null = global
  fn: MiddlewareFn;
}

function isContext(obj: unknown): obj is Context {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "json" in obj &&
    typeof (obj as Context).json === "function"
  );
}

export class MiddlewareRegistry {
  private entries: MiddlewareEntry[] = [];
  _lastError: unknown = undefined;

  addGlobal(fn: MiddlewareFn): void {
    this.entries.push({ pattern: null, fn });
  }

  add(pattern: string, fn: MiddlewareFn): void {
    validatePattern(pattern);
    this.entries.push({ pattern, fn });
  }

  async execute(
    method: string,
    contextOrReq: Context | Record<string, unknown>,
    handler: (c: Context) => JsonRpcResponse | Promise<JsonRpcResponse>,
  ): Promise<JsonRpcResponse> {
    // Reset _lastError
    this._lastError = undefined;

    // Determine context: if it already has a `json` method it's a Context; otherwise create one
    let ctx: Context;
    if (isContext(contextOrReq)) {
      ctx = contextOrReq;
    } else {
      ctx = createContext(method, contextOrReq as Record<string, unknown>);
    }

    // Build the middleware chain for this method: global always included,
    // scoped only if pattern matches
    const chain: MiddlewareFn[] = [];
    for (const entry of this.entries) {
      if (entry.pattern === null) {
        chain.push(entry.fn);
      } else if (matchPattern(entry.pattern, method)) {
        chain.push(entry.fn);
      }
    }

    try {
      let index = 0;

      const dispatch = async (): Promise<void> => {
        if (index < chain.length) {
          const mw = chain[index] as MiddlewareFn;
          index++;
          let called = false;

          const next: Next = () => {
            if (called) {
              return Promise.reject(new Error("next() called multiple times"));
            }
            called = true;
            return dispatch();
          };

          const result = await mw(ctx, next);

          // If middleware returned a JsonRpcResponse (has jsonrpc field), treat as short-circuit
          if (
            result !== undefined &&
            result !== null &&
            typeof result === "object" &&
            "jsonrpc" in result
          ) {
            ctx.res = result;
          }
        } else {
          // End of middleware chain — call the handler
          const result = await handler(ctx);
          ctx.res = result;
        }
      };

      await dispatch();

      // If c.res was set (by handler, middleware, or short-circuit), return it
      if (ctx.res !== undefined) {
        return ctx.res;
      }

      // No response produced → -32603
      return makeInternalError(ctx, "Internal error");
    } catch (err: unknown) {
      this._lastError = err;
      if (err instanceof Error) {
        return makeInternalError(ctx, err.message);
      }
      return makeInternalError(ctx, "Internal error");
    }
  }
}

function makeInternalError(ctx: Context, message: string): JsonRpcResponse {
  // Use ctx.error if available to get the correct id, but we need to build
  // the error object without data field
  const id = ctx.req?.id !== undefined ? ctx.req.id : null;
  return {
    jsonrpc: "2.0",
    error: { code: -32603, message },
    id: id ?? null,
  };
}
