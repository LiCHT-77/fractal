export type RequestId = string | number | null;

export interface JsonRpcRequest {
  method: string;
  params: Record<string, unknown>;
  id: RequestId | undefined;
  raw: MessageEvent | undefined;
}

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: "2.0";
  result: T;
  id: RequestId;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  error: { code: number; message: string; data?: unknown };
  id: RequestId;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export interface Context {
  req: JsonRpcRequest;
  res: JsonRpcResponse | undefined;
  // biome-ignore lint/complexity/noBannedTypes: {} excludes undefined while accepting all other non-nullish values
  json<T extends {} | null>(result: T): JsonRpcSuccessResponse<T>;
  error(code: number, message: string, data?: unknown): JsonRpcErrorResponse;
}

export function createContext(
  method: string,
  params?: Record<string, unknown>,
  id?: RequestId,
  raw?: MessageEvent,
): Context {
  const responseId: RequestId = id !== undefined ? id : null;

  return {
    req: {
      method,
      params: params ?? {},
      id,
      raw,
    },
    res: undefined,
    // biome-ignore lint/complexity/noBannedTypes: {} excludes undefined while accepting all other non-nullish values
    json<T extends {} | null>(result: T): JsonRpcSuccessResponse<T> {
      return {
        jsonrpc: "2.0",
        result,
        id: responseId,
      };
    },
    error(code: number, message: string, data?: unknown): JsonRpcErrorResponse {
      const errorObj: { code: number; message: string; data?: unknown } = {
        code,
        message,
      };
      if (data !== undefined) {
        errorObj.data = data;
      }
      return {
        jsonrpc: "2.0",
        error: errorObj,
        id: responseId,
      };
    },
  };
}
