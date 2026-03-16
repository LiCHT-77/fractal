/**
 * JSON-RPC 2.0 codec — type guards and message encoders.
 *
 * This module handles structural validation only. Semantic validation
 * (method name rules, id type constraints, etc.) belongs to the app layer.
 */

// ─── Helpers ───

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─── Type Guards ───

export function isJsonRpcMessage(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return (value as Record<string, unknown>).jsonrpc === "2.0";
}

export function isJsonRpcRequest(value: unknown): boolean {
  if (!isJsonRpcMessage(value)) return false;
  const msg = value as Record<string, unknown>;

  // Must have a string method
  if (typeof msg.method !== "string") return false;

  // Must not have result or error fields (those indicate a response)
  if ("result" in msg || "error" in msg) return false;

  // params, if present and not undefined, must be a plain object (not array, not null, not primitive)
  if ("params" in msg && msg.params !== undefined) {
    if (!isPlainObject(msg.params)) return false;
  }

  return true;
}

export function isJsonRpcResponse(value: unknown): boolean {
  if (!isJsonRpcMessage(value)) return false;
  const msg = value as Record<string, unknown>;

  // Must not have a method field (that indicates a request)
  if ("method" in msg) return false;

  // Must have "result" or "error" (via `in` operator)
  return "result" in msg || "error" in msg;
}

export function isNotification(value: Record<string, unknown>): boolean {
  return !("id" in value);
}

// ─── Encoders ───

export function encodeSuccess(
  result: unknown,
  id: string | number | null | undefined,
): { jsonrpc: "2.0"; result: unknown; id: string | number | null } {
  return {
    jsonrpc: "2.0",
    result,
    id: id === undefined ? null : id,
  } as { jsonrpc: "2.0"; result: unknown; id: string | number | null };
}

export function encodeError(
  code: number,
  message: string,
  id: string | number | null | undefined,
  data?: unknown,
): {
  jsonrpc: "2.0";
  error: { code: number; message: string; data?: unknown };
  id: string | number | null;
} {
  const error: { code: number; message: string; data?: unknown } = {
    code,
    message,
  };
  if (data !== undefined) {
    error.data = data;
  }
  return {
    jsonrpc: "2.0",
    error,
    id: id === undefined ? null : id,
  } as {
    jsonrpc: "2.0";
    error: { code: number; message: string; data?: unknown };
    id: string | number | null;
  };
}
