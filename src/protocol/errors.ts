// JSON-RPC 2.0 standard error codes
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
RpcError.prototype.name = "RpcError";

export class FractalError extends Error {
  readonly code: "DISPOSED" | "TIMEOUT";

  constructor(code: "DISPOSED" | "TIMEOUT") {
    super(code);
    this.code = code;
  }
}
FractalError.prototype.name = "FractalError";

export function errorToResponse(
  error: unknown,
  id: string | number | null,
): {
  jsonrpc: "2.0";
  error: { code: number; message: string };
  id: string | number | null;
} {
  const message = error instanceof Error ? error.message : "Internal error";
  return {
    jsonrpc: "2.0",
    error: { code: INTERNAL_ERROR, message },
    id: id ?? null,
  };
}
