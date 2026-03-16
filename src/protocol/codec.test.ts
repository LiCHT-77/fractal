import { isJsonRpcMessage, isJsonRpcRequest, isJsonRpcResponse, isNotification, encodeSuccess, encodeError } from "./codec.ts";
import { makeRequest, makeNotification, makeSuccessResponse, makeErrorResponse } from "../test-helpers.ts";

describe("protocol/codec", () => {
  // ─── isJsonRpcMessage ───

  describe("isJsonRpcMessage", () => {
    test("accepts object with jsonrpc: '2.0'", () => {
      expect(isJsonRpcMessage({ jsonrpc: "2.0" })).toBe(true);
    });

    test("rejects null", () => {
      expect(isJsonRpcMessage(null)).toBe(false);
    });

    test("rejects undefined", () => {
      expect(isJsonRpcMessage(undefined)).toBe(false);
    });

    test("rejects primitive string", () => {
      expect(isJsonRpcMessage("hello")).toBe(false);
    });

    test("rejects number", () => {
      expect(isJsonRpcMessage(42)).toBe(false);
    });

    test("rejects array", () => {
      expect(isJsonRpcMessage([{ jsonrpc: "2.0" }])).toBe(false);
    });

    test("rejects object with wrong jsonrpc version", () => {
      expect(isJsonRpcMessage({ jsonrpc: "1.0" })).toBe(false);
    });

    test("rejects object without jsonrpc field", () => {
      expect(isJsonRpcMessage({ method: "ping" })).toBe(false);
    });

    // §4.1: batch requests (arrays) are not supported and must be rejected
    test("rejects batch request (array of valid requests)", () => {
      const batch = [
        { jsonrpc: "2.0", method: "ping", id: 1 },
        { jsonrpc: "2.0", method: "pong", id: 2 },
      ];
      expect(isJsonRpcMessage(batch)).toBe(false);
    });

    // jsonrpc as number 2.0 (not the string "2.0") must be rejected
    test("rejects jsonrpc as number 2.0", () => {
      expect(isJsonRpcMessage({ jsonrpc: 2.0 })).toBe(false);
    });

    // jsonrpc: null must be rejected
    test("rejects jsonrpc: null", () => {
      expect(isJsonRpcMessage({ jsonrpc: null })).toBe(false);
    });

    // jsonrpc: undefined must be rejected (same as missing field)
    test("rejects jsonrpc: undefined", () => {
      expect(isJsonRpcMessage({ jsonrpc: undefined })).toBe(false);
    });

    // jsonrpc: "" (empty string) must be rejected
    test("rejects jsonrpc as empty string", () => {
      expect(isJsonRpcMessage({ jsonrpc: "" })).toBe(false);
    });

    // jsonrpc: "1.0" must be rejected (only "2.0" is valid)
    test("rejects jsonrpc: '1.0'", () => {
      expect(isJsonRpcMessage({ jsonrpc: "1.0" })).toBe(false);
    });
  });

  // ─── isJsonRpcRequest ───

  describe("isJsonRpcRequest", () => {
    test("accepts request with method string", () => {
      expect(isJsonRpcRequest(makeRequest("ping", undefined, 1))).toBe(true);
    });

    test("accepts notification (no id)", () => {
      expect(isJsonRpcRequest(makeNotification("ping"))).toBe(true);
    });

    test("rejects message without method", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", id: 1 })).toBe(false);
    });

    test("rejects message with non-string method", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: 123, id: 1 })).toBe(false);
    });

    test("rejects response (has result)", () => {
      expect(isJsonRpcRequest(makeSuccessResponse("ok", 1))).toBe(false);
    });

    test("rejects response (has error)", () => {
      expect(isJsonRpcRequest(makeErrorResponse(-32601, "Not found", 1))).toBe(false);
    });

    test("rejects request with array params", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: [1, 2], id: 1 })).toBe(false);
    });

    test("accepts request with object params", () => {
      expect(isJsonRpcRequest(makeRequest("ping", { a: 1 }, 1))).toBe(true);
    });

    // §2.1 dispatch: params omitted → {} normalization (valid request)
    test("accepts request with params omitted", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: 1 })).toBe(true);
    });

    // §2.1 dispatch: params: undefined → {} normalization (valid request)
    test("accepts request with params: undefined", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: undefined, id: 1 })).toBe(true);
    });

    // §5.1 note 3: params as null is invalid (not a plain object)
    test("rejects request with params: null", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: null, id: 1 })).toBe(false);
    });

    // §5.1 note 3: params as primitive string is invalid
    test("rejects request with params as string", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: "bad", id: 1 })).toBe(false);
    });

    // §5.1 note 3: params as number is invalid
    test("rejects request with params as number", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: 42, id: 1 })).toBe(false);
    });

    // §5.1 note 3: params as boolean is invalid
    test("rejects request with params as boolean", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: true, id: 1 })).toBe(false);
    });

    // §5.1 note 3(a): method as null is invalid (not a string)
    test("rejects request with method: null", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: null, id: 1 })).toBe(false);
    });

    // §5.1 note 3(a): method as boolean is invalid
    test("rejects request with method: true", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: true, id: 1 })).toBe(false);
    });

    // §5.1 note 3(a): method as object is invalid
    test("rejects request with method as object", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: { name: "ping" }, id: 1 })).toBe(false);
    });

    // §5.1 note 3(a): method as array is invalid
    test("rejects request with method as array", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: ["ping"], id: 1 })).toBe(false);
    });

    // Empty string method: codec accepts any string (app-level validation is separate)
    test("accepts request with empty string method", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "", id: 1 })).toBe(true);
    });

    // §5.1 note 3: params: {} (empty object) is a valid plain object
    test("accepts request with params: {} (empty object)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: {}, id: 1 })).toBe(true);
    });

    // id edge cases: negative id is valid
    test("accepts request with id: -1", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: -1 })).toBe(true);
    });

    // id edge cases: fractional id is valid (JSON-RPC spec allows number)
    test("accepts request with id: 0.5 (fractional)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: 0.5 })).toBe(true);
    });

    // id edge cases: string "0" is a valid id
    test("accepts request with id: '0' (string zero)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: "0" })).toBe(true);
    });

    // Non-ASCII method names: codec accepts any string (§2.1 allows non-ASCII characters)
    test("accepts request with Japanese method name", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ユーザー.取得", id: 1 })).toBe(true);
    });

    test("accepts request with emoji method name", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "🚀.launch", id: 1 })).toBe(true);
    });

    test("accepts request with mixed non-ASCII method name", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "données.créer", id: 1 })).toBe(true);
    });
  });

  // ─── isJsonRpcResponse ───

  describe("isJsonRpcResponse", () => {
    test("accepts success response", () => {
      expect(isJsonRpcResponse(makeSuccessResponse("ok", 1))).toBe(true);
    });

    test("accepts error response", () => {
      expect(isJsonRpcResponse(makeErrorResponse(-32601, "Not found", 1))).toBe(true);
    });

    test("rejects request message", () => {
      expect(isJsonRpcResponse(makeRequest("ping", undefined, 1))).toBe(false);
    });

    test("rejects notification", () => {
      expect(isJsonRpcResponse(makeNotification("ping"))).toBe(false);
    });

    // §2.4: response with both result and error — error takes priority, still a valid response
    test("accepts response with both result and error (error takes priority)", () => {
      const msg = {
        jsonrpc: "2.0",
        result: "ok",
        error: { code: -32600, message: "Invalid Request" },
        id: 1,
      };
      expect(isJsonRpcResponse(msg)).toBe(true);
    });

    // result: undefined — key exists via "in", so it's still a response
    test("accepts response with result: undefined (key present)", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", result: undefined, id: 1 })).toBe(true);
    });

    // error: null — key exists via "in", still recognized as a response
    test("accepts response with error: null (key present)", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", error: null, id: 1 })).toBe(true);
    });

    // error as empty object — structurally invalid but isJsonRpcResponse only checks field presence
    test("accepts response with error as empty object", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", error: {}, id: 1 })).toBe(true);
    });

    // error as string — structurally invalid but isJsonRpcResponse only checks field presence
    test("accepts response with error as string", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", error: "bad", id: 1 })).toBe(true);
    });

    // error as number — structurally invalid but isJsonRpcResponse only checks field presence
    test("accepts response with error as number", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", error: 42, id: 1 })).toBe(true);
    });

    // response without id — still a valid response shape (id is required per spec, but codec only checks result/error presence)
    test("accepts response without id field", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", result: "ok" })).toBe(true);
    });

    // response with error but without id
    test("accepts error response without id field", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid" } })).toBe(true);
    });
  });

  // ─── isNotification ───

  describe("isNotification", () => {
    test("returns true when id is absent", () => {
      expect(isNotification(makeNotification("log.info"))).toBe(true);
    });

    test("returns false when id is present (number)", () => {
      expect(isNotification(makeRequest("ping", undefined, 1))).toBe(false);
    });

    test("returns false when id is null", () => {
      expect(isNotification(makeRequest("ping", undefined, null))).toBe(false);
    });

    test("returns false when id is 0", () => {
      expect(isNotification(makeRequest("ping", undefined, 0))).toBe(false);
    });

    test("returns false when id is empty string", () => {
      expect(isNotification(makeRequest("ping", undefined, ""))).toBe(false);
    });

    // §4.5: "id" in request is true for id: undefined in JS, so NOT a notification
    test("id: undefined is NOT a notification (key exists in object)", () => {
      expect(isNotification({ jsonrpc: "2.0", method: "ping", id: undefined })).toBe(false);
    });

    // §4.5: id: 0 is a valid id, NOT a notification
    test("returns false when id is 0 (falsy but present)", () => {
      expect(isNotification({ jsonrpc: "2.0", method: "ping", id: 0 })).toBe(false);
    });

    // §4.5: id: "" is a valid id, NOT a notification
    test("returns false when id is empty string (falsy but present)", () => {
      expect(isNotification({ jsonrpc: "2.0", method: "ping", id: "" })).toBe(false);
    });

    // id type edge cases: boolean id is questionable
    test("returns false when id is boolean (key exists)", () => {
      expect(isNotification({ jsonrpc: "2.0", method: "ping", id: true })).toBe(false);
    });

    // id type edge cases: object id is questionable
    test("returns false when id is object (key exists)", () => {
      expect(isNotification({ jsonrpc: "2.0", method: "ping", id: {} })).toBe(false);
    });
  });

  // ─── encodeSuccess ───

  describe("encodeSuccess", () => {
    test("encodes success response with numeric id", () => {
      const response = encodeSuccess("pong", 1);
      expect(response).toEqual({ jsonrpc: "2.0", result: "pong", id: 1 });
    });

    test("encodes success response with string id", () => {
      const response = encodeSuccess({ data: true }, "abc");
      expect(response).toEqual({ jsonrpc: "2.0", result: { data: true }, id: "abc" });
    });

    test("encodes success response with null id", () => {
      const response = encodeSuccess(null, null);
      expect(response).toEqual({ jsonrpc: "2.0", result: null, id: null });
    });

    // Falsy result values must be preserved, not dropped
    test("encodes success response with result: null", () => {
      const response = encodeSuccess(null, 1);
      expect(response).toEqual({ jsonrpc: "2.0", result: null, id: 1 });
    });

    test("encodes success response with result: 0", () => {
      const response = encodeSuccess(0, 1);
      expect(response).toEqual({ jsonrpc: "2.0", result: 0, id: 1 });
    });

    test("encodes success response with result: false", () => {
      const response = encodeSuccess(false, 1);
      expect(response).toEqual({ jsonrpc: "2.0", result: false, id: 1 });
    });

    test("encodes success response with result: empty string", () => {
      const response = encodeSuccess("", 1);
      expect(response).toEqual({ jsonrpc: "2.0", result: "", id: 1 });
    });

    // §3.2: undefined id is normalized to null (Notification context)
    test("normalizes undefined id to null", () => {
      const response = encodeSuccess("pong", undefined);
      expect(response).toEqual({ jsonrpc: "2.0", result: "pong", id: null });
    });
  });

  // ─── encodeError ───

  describe("encodeError", () => {
    test("encodes error response with code and message", () => {
      const response = encodeError(-32601, "Method not found", 1);
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("encodes error response with data", () => {
      const response = encodeError(-32602, "Invalid params", 2, { field: "id" });
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32602, message: "Invalid params", data: { field: "id" } },
        id: 2,
      });
    });

    test("encodes error response with null id", () => {
      const response = encodeError(-32603, "Internal error", null);
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: null,
      });
    });

    test("encodes error with null data", () => {
      const response = encodeError(-32603, "Err", 1, null);
      expect(response.error.data).toBeNull();
    });

    test("omits data when undefined", () => {
      const response = encodeError(-32603, "Err", 1, undefined);
      expect("data" in response.error).toBe(false);
    });

    test("omits data when not provided", () => {
      const response = encodeError(-32603, "Err", 1);
      expect("data" in response.error).toBe(false);
    });

    test("encodes error with string data", () => {
      const response = encodeError(-32000, "Custom", 1, "detail");
      expect(response.error.data).toBe("detail");
    });

    test("encodes error with numeric data", () => {
      const response = encodeError(-32000, "Custom", 1, 42);
      expect(response.error.data).toBe(42);
    });

    test("encodes error with boolean data", () => {
      const response = encodeError(-32000, "Custom", 1, false);
      expect(response.error.data).toBe(false);
    });

    test("encodes error with array data", () => {
      const response = encodeError(-32000, "Custom", 1, [1, "two", 3]);
      expect(response.error.data).toEqual([1, "two", 3]);
    });

    test("encodes error with zero as data", () => {
      const response = encodeError(-32000, "Custom", 1, 0);
      expect(response.error.data).toBe(0);
    });

    test("encodes error with empty string as data", () => {
      const response = encodeError(-32000, "Custom", 1, "");
      expect(response.error.data).toBe("");
    });

    // §3.2: undefined id is normalized to null (Notification context)
    test("normalizes undefined id to null", () => {
      const response = encodeError(-32601, "Method not found", undefined);
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32601, message: "Method not found" },
        id: null,
      });
    });
  });

  // ─── Error object schema validation ───

  describe("encodeError error object schema", () => {
    // error.code is always a number
    test("error.code is a number type", () => {
      const response = encodeError(-32600, "Invalid Request", 1);
      expect(typeof response.error.code).toBe("number");
    });

    // error.message is always a string
    test("error.message is a string type", () => {
      const response = encodeError(-32600, "Invalid Request", 1);
      expect(typeof response.error.message).toBe("string");
    });

    // error.code preserves the exact numeric value
    test("error.code preserves exact value", () => {
      const response = encodeError(-32000, "Server error", 1);
      expect(response.error.code).toBe(-32000);
    });

    // error.message preserves the exact string
    test("error.message preserves exact value", () => {
      const response = encodeError(-32601, "Method not found", 1);
      expect(response.error.message).toBe("Method not found");
    });

    // Verify the error object structure conforms to JsonRpcError shape
    test("error object has only code and message when data is omitted", () => {
      const response = encodeError(-32603, "Internal error", 1);
      expect(Object.keys(response.error).sort()).toEqual(["code", "message"]);
    });

    test("error object has code, message, and data when data is provided", () => {
      const response = encodeError(-32603, "Internal error", 1, { detail: "x" });
      expect(Object.keys(response.error).sort()).toEqual(["code", "data", "message"]);
    });
  });

  // ─── Params normalization at codec level ───

  describe("params normalization (codec guard behavior)", () => {
    // isJsonRpcRequest accepts params: undefined and params omitted,
    // because dispatch() normalizes these to {} at the core layer.
    test("params omitted is accepted (dispatch normalizes to {})", () => {
      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      expect(isJsonRpcRequest(msg)).toBe(true);
      // The key "params" should not exist in the message
      expect("params" in msg).toBe(false);
    });

    test("params: undefined is accepted (dispatch normalizes to {})", () => {
      const msg = { jsonrpc: "2.0", method: "ping", params: undefined, id: 1 };
      expect(isJsonRpcRequest(msg)).toBe(true);
    });

    test("params: {} (empty object) is accepted as-is", () => {
      const msg = { jsonrpc: "2.0", method: "ping", params: {}, id: 1 };
      expect(isJsonRpcRequest(msg)).toBe(true);
    });

    test("params: { key: 'value' } (populated object) is accepted", () => {
      const msg = { jsonrpc: "2.0", method: "ping", params: { key: "value" }, id: 1 };
      expect(isJsonRpcRequest(msg)).toBe(true);
    });

    // Invalid params types that would NOT be normalized — they are rejected at codec level
    test("params: null is rejected (not a plain object)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: null, id: 1 })).toBe(false);
    });

    test("params: [] (empty array) is rejected", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: [], id: 1 })).toBe(false);
    });
  });

  // ─── Additional coverage tests ───

  describe("method + result coexistence", () => {
    // A message with both "method" and "result" is ambiguous:
    // isJsonRpcRequest rejects because "result" is present (response field),
    // isJsonRpcResponse rejects because "method" is present (request field).
    test("message with both method and result is rejected by isJsonRpcRequest", () => {
      const msg = { jsonrpc: "2.0", method: "ping", result: "ok", id: 1 };
      expect(isJsonRpcRequest(msg)).toBe(false);
    });

    test("message with both method and result is rejected by isJsonRpcResponse", () => {
      const msg = { jsonrpc: "2.0", method: "ping", result: "ok", id: 1 };
      expect(isJsonRpcResponse(msg)).toBe(false);
    });
  });

  describe("isJsonRpcResponse with string id", () => {
    test("accepts success response with string id", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", result: "ok", id: "abc" })).toBe(true);
    });
  });

  describe("encodeSuccess with deeply nested objects", () => {
    test("preserves deep nested structure in result", () => {
      const deepResult = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: "deep",
                list: [1, { nested: true }, [2, 3]],
              },
            },
          },
          siblings: ["a", "b"],
        },
      };
      const response = encodeSuccess(deepResult, 1);
      expect(response).toEqual({ jsonrpc: "2.0", result: deepResult, id: 1 });
    });

    test("preserves array as result", () => {
      const arrayResult = [{ id: 1, items: [{ name: "a" }] }, { id: 2, items: [] }];
      const response = encodeSuccess(arrayResult, 1);
      expect(response).toEqual({ jsonrpc: "2.0", result: arrayResult, id: 1 });
    });
  });

  describe("encodeError with string id", () => {
    test("encodes error response with string id", () => {
      const response = encodeError(-32601, "Method not found", "request-abc");
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32601, message: "Method not found" },
        id: "request-abc",
      });
    });

    test("encodes error response with string id and data", () => {
      const response = encodeError(-32602, "Invalid params", "req-1", { detail: "missing field" });
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32602, message: "Invalid params", data: { detail: "missing field" } },
        id: "req-1",
      });
    });
  });

  describe("encodeSuccess with result: undefined", () => {
    test("result field is present with value undefined", () => {
      const response = encodeSuccess(undefined, 1);
      expect(response.id).toBe(1);
      expect(response.jsonrpc).toBe("2.0");
      // The "result" key exists in the object
      expect("result" in response).toBe(true);
      // The value is undefined
      expect(response.result).toBeUndefined();
    });
  });

  describe("extra properties on isJsonRpcMessage", () => {
    test("accepts object with jsonrpc: '2.0' and extra fields", () => {
      expect(isJsonRpcMessage({ jsonrpc: "2.0", extraField: "something" })).toBe(true);
    });

    test("accepts object with jsonrpc: '2.0' and multiple extra fields", () => {
      expect(isJsonRpcMessage({ jsonrpc: "2.0", foo: 1, bar: "baz", nested: { a: true } })).toBe(true);
    });
  });

  describe("batch request array rejected by guards", () => {
    // §4.1: batch requests (arrays) are not supported
    test("isJsonRpcMessage rejects a single-element batch array", () => {
      expect(isJsonRpcMessage([{ jsonrpc: "2.0", method: "ping", id: 1 }])).toBe(false);
    });

    test("isJsonRpcRequest rejects a single-element batch array", () => {
      expect(isJsonRpcRequest([{ jsonrpc: "2.0", method: "ping", id: 1 }])).toBe(false);
    });

    test("isJsonRpcRequest rejects a multi-element batch array", () => {
      expect(isJsonRpcRequest([
        { jsonrpc: "2.0", method: "ping", id: 1 },
        { jsonrpc: "2.0", method: "pong", id: 2 },
      ])).toBe(false);
    });

    test("isJsonRpcResponse rejects a batch array of responses", () => {
      expect(isJsonRpcResponse([
        { jsonrpc: "2.0", result: "ok", id: 1 },
        { jsonrpc: "2.0", result: "ok", id: 2 },
      ])).toBe(false);
    });
  });

  // ─── isJsonRpcRequest with non-plain object params (documentation test) ───

  // ─── Codec internal consistency: encode → guard round-trip ───

  describe("encode → guard round-trip consistency", () => {
    // Verify that encodeSuccess output always passes isJsonRpcResponse
    test("encodeSuccess output is recognized by isJsonRpcResponse", () => {
      expect(isJsonRpcResponse(encodeSuccess("ok", 1))).toBe(true);
    });

    test("encodeSuccess with null id is recognized by isJsonRpcResponse", () => {
      expect(isJsonRpcResponse(encodeSuccess("ok", null))).toBe(true);
    });

    test("encodeSuccess with undefined id (normalized to null) is recognized by isJsonRpcResponse", () => {
      expect(isJsonRpcResponse(encodeSuccess("ok", undefined))).toBe(true);
    });

    test("encodeSuccess with string id is recognized by isJsonRpcResponse", () => {
      expect(isJsonRpcResponse(encodeSuccess({ data: true }, "req-1"))).toBe(true);
    });

    // Verify that encodeError output always passes isJsonRpcResponse
    test("encodeError output is recognized by isJsonRpcResponse", () => {
      expect(isJsonRpcResponse(encodeError(-32601, "Method not found", 1))).toBe(true);
    });

    test("encodeError with null id is recognized by isJsonRpcResponse", () => {
      expect(isJsonRpcResponse(encodeError(-32603, "Internal error", null))).toBe(true);
    });

    test("encodeError with undefined id (normalized to null) is recognized by isJsonRpcResponse", () => {
      expect(isJsonRpcResponse(encodeError(-32601, "Method not found", undefined))).toBe(true);
    });

    test("encodeError with data is recognized by isJsonRpcResponse", () => {
      expect(isJsonRpcResponse(encodeError(-32602, "Invalid params", 1, { field: "x" }))).toBe(true);
    });

    // Verify that encoded responses are NOT classified as requests
    test("encodeSuccess output is rejected by isJsonRpcRequest", () => {
      expect(isJsonRpcRequest(encodeSuccess("ok", 1))).toBe(false);
    });

    test("encodeError output is rejected by isJsonRpcRequest", () => {
      expect(isJsonRpcRequest(encodeError(-32601, "Method not found", 1))).toBe(false);
    });
  });

  // ─── Encoded responses always contain id field (JSON-RPC 2.0 §3.2 compliance) ───

  describe("encoded responses always have id field", () => {
    // encodeSuccess always includes "id" key, even when input id is undefined (normalized to null)
    test("encodeSuccess always produces an object with 'id' key", () => {
      const withNumber = encodeSuccess("ok", 1);
      const withString = encodeSuccess("ok", "abc");
      const withNull = encodeSuccess("ok", null);
      const withUndefined = encodeSuccess("ok", undefined);

      expect("id" in withNumber).toBe(true);
      expect("id" in withString).toBe(true);
      expect("id" in withNull).toBe(true);
      expect("id" in withUndefined).toBe(true);
    });

    test("encodeError always produces an object with 'id' key", () => {
      const withNumber = encodeError(-32601, "Not found", 1);
      const withString = encodeError(-32601, "Not found", "abc");
      const withNull = encodeError(-32601, "Not found", null);
      const withUndefined = encodeError(-32601, "Not found", undefined);

      expect("id" in withNumber).toBe(true);
      expect("id" in withString).toBe(true);
      expect("id" in withNull).toBe(true);
      expect("id" in withUndefined).toBe(true);
    });

    // Verify that undefined id is normalized to null (not kept as undefined)
    test("encodeSuccess normalizes undefined id to null (not undefined)", () => {
      const response = encodeSuccess("ok", undefined);
      expect(response.id).toBeNull();
      expect(response.id).not.toBeUndefined();
    });

    test("encodeError normalizes undefined id to null (not undefined)", () => {
      const response = encodeError(-32601, "Not found", undefined);
      expect(response.id).toBeNull();
      expect(response.id).not.toBeUndefined();
    });
  });

  // ─── isNotification combined with encode: notification-originated responses ───

  describe("isNotification and response encoding interaction", () => {
    // When a notification is received, isNotification returns true.
    // If a handler still encodes a response (for internal use), the id should be null.
    test("notification has no id → encodeSuccess with undefined id normalizes to null", () => {
      const notification = makeNotification("log.info", { msg: "hello" });
      expect(isNotification(notification)).toBe(true);
      // Handler would use notification's id (undefined since no "id" key)
      const response = encodeSuccess("ok", notification.id as undefined);
      expect(response.id).toBeNull();
    });

    test("notification has no id → encodeError with undefined id normalizes to null", () => {
      const notification = makeNotification("log.info");
      expect(isNotification(notification)).toBe(true);
      const response = encodeError(-32603, "Internal error", notification.id as undefined);
      expect(response.id).toBeNull();
    });

    // Regular request with id → isNotification returns false, response preserves the id
    test("request with id → isNotification is false, encodeSuccess preserves id", () => {
      const request = makeRequest("ping", {}, 42);
      expect(isNotification(request)).toBe(false);
      const response = encodeSuccess("pong", request.id as number);
      expect(response.id).toBe(42);
    });

    test("request with id → isNotification is false, encodeError preserves id", () => {
      const request = makeRequest("ping", {}, "req-7");
      expect(isNotification(request)).toBe(false);
      const response = encodeError(-32601, "Not found", request.id as string);
      expect(response.id).toBe("req-7");
    });
  });

  // ─── encodeError data inclusion edge case: explicit undefined as 4th argument ───

  describe("encodeError data argument boundary", () => {
    // When exactly 4 arguments are passed but data is undefined, data is omitted
    test("data is omitted when 4th argument is explicitly undefined", () => {
      const response = encodeError(-32603, "Err", 1, undefined);
      expect("data" in response.error).toBe(false);
    });

    // When null is passed as data (4 arguments, data !== undefined), data is included
    test("data is included when 4th argument is null", () => {
      const response = encodeError(-32603, "Err", 1, null);
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBeNull();
    });

    // When 0 is passed as data, data is included (falsy but not undefined)
    test("data is included when 4th argument is 0", () => {
      const response = encodeError(-32603, "Err", 1, 0);
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBe(0);
    });

    // When false is passed as data, data is included
    test("data is included when 4th argument is false", () => {
      const response = encodeError(-32603, "Err", 1, false);
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBe(false);
    });

    // When empty string is passed as data, data is included
    test("data is included when 4th argument is empty string", () => {
      const response = encodeError(-32603, "Err", 1, "");
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBe("");
    });
  });

  describe("isJsonRpcRequest with non-plain object params (isPlainObject behavior)", () => {
    test("accepts params containing a Date instance (isPlainObject returns false for Date, but params itself is a plain object)", () => {
      // A plain object that happens to contain a Date value — the params object itself is a plain object
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: { ts: new Date() }, id: 1 })).toBe(true);
    });

    test("rejects params that IS a Date instance (not a plain object)", () => {
      // Date itself is typeof "object", not null, not an array — but isPlainObject checks those same conditions,
      // so a Date actually passes isPlainObject. This documents that behavior.
      const dateAsParams = new Date();
      // isPlainObject: typeof === "object" ✓, !== null ✓, !Array.isArray ✓ → true
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: dateAsParams, id: 1 })).toBe(true);
    });

    test("accepts params that IS a Map instance (isPlainObject returns true for Map)", () => {
      // Map: typeof === "object" ✓, !== null ✓, !Array.isArray ✓ → isPlainObject returns true
      const mapAsParams = new Map([["key", "value"]]);
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: mapAsParams, id: 1 })).toBe(true);
    });

    test("accepts params that IS a Set instance (isPlainObject returns true for Set)", () => {
      // Set: typeof === "object" ✓, !== null ✓, !Array.isArray ✓ → isPlainObject returns true
      const setAsParams = new Set([1, 2, 3]);
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: setAsParams, id: 1 })).toBe(true);
    });
  });

  // ─── isPlainObject boundary tests ───

  describe("isPlainObject boundary tests (via isJsonRpcRequest params)", () => {
    // Object.create(null) produces a prototype-less object.
    // isPlainObject: typeof === "object" ✓, !== null ✓, !Array.isArray ✓ → true
    test("accepts params created with Object.create(null)", () => {
      const nullProto = Object.create(null);
      nullProto.key = "value";
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: nullProto, id: 1 })).toBe(true);
    });

    test("accepts empty Object.create(null) as params", () => {
      const nullProto = Object.create(null);
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: nullProto, id: 1 })).toBe(true);
    });

    // Class instances: typeof === "object" ✓, !== null ✓, !Array.isArray ✓ → isPlainObject returns true
    // This documents that isPlainObject does NOT distinguish class instances from plain objects.
    test("accepts class instance as params (isPlainObject does not check prototype chain)", () => {
      class MyParams {
        key: string;
        constructor(key: string) {
          this.key = key;
        }
      }
      const instance = new MyParams("value");
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: instance, id: 1 })).toBe(true);
    });

    test("accepts class instance with methods as params", () => {
      class ParamsWithMethod {
        data = 42;
        getData() { return this.data; }
      }
      const instance = new ParamsWithMethod();
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: instance, id: 1 })).toBe(true);
    });

    // Proxy wrapping a plain object: typeof === "object" ✓, !== null ✓, !Array.isArray ✓ → true
    test("accepts Proxy wrapping a plain object as params", () => {
      const target = { key: "value" };
      const proxy = new Proxy(target, {});
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: proxy, id: 1 })).toBe(true);
    });

    test("accepts Proxy with custom handler as params", () => {
      const target = { key: "value" };
      const proxy = new Proxy(target, {
        get(t, prop) {
          if (prop === "intercepted") return true;
          return Reflect.get(t, prop);
        },
      });
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: proxy, id: 1 })).toBe(true);
    });

    // Proxy wrapping an array: Array.isArray sees through Proxy → isPlainObject returns false
    test("rejects Proxy wrapping an array as params", () => {
      const proxy = new Proxy([1, 2, 3], {});
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", params: proxy, id: 1 })).toBe(false);
    });

    // Also test via isJsonRpcMessage for Object.create(null) as the top-level message
    test("isJsonRpcMessage accepts Object.create(null) with jsonrpc: '2.0'", () => {
      const msg = Object.create(null);
      msg.jsonrpc = "2.0";
      expect(isJsonRpcMessage(msg)).toBe(true);
    });

    test("isJsonRpcMessage accepts Proxy wrapping a valid message", () => {
      const target = { jsonrpc: "2.0" as const, method: "ping" };
      const proxy = new Proxy(target, {});
      expect(isJsonRpcMessage(proxy)).toBe(true);
    });
  });

  // ─── Structured clone incompatible values in encodeSuccess/encodeError ───

  describe("structurally non-cloneable values (codec layer does not validate)", () => {
    // The codec layer is a pure data encoder — it does NOT validate whether values
    // are structured-clone-compatible. That responsibility belongs to the transport
    // layer (endpoint.send). These tests document that functions, Symbols, etc.
    // pass through the codec without error.

    test("encodeSuccess accepts a function as result (codec does not validate)", () => {
      const fn = () => "hello";
      const response = encodeSuccess(fn, 1);
      expect(response.jsonrpc).toBe("2.0");
      expect(response.result).toBe(fn);
      expect(response.id).toBe(1);
    });

    test("encodeSuccess accepts a Symbol as result (codec does not validate)", () => {
      const sym = Symbol("test");
      const response = encodeSuccess(sym, 1);
      expect(response.jsonrpc).toBe("2.0");
      expect(response.result).toBe(sym);
      expect(response.id).toBe(1);
    });

    test("encodeSuccess accepts an object containing a function (codec does not validate)", () => {
      const data = { handler: () => {}, name: "test" };
      const response = encodeSuccess(data, 1);
      expect(response.result).toBe(data);
      expect(typeof (response.result as any).handler).toBe("function");
    });

    test("encodeSuccess accepts an object containing a Symbol value (codec does not validate)", () => {
      const sym = Symbol("key");
      const data = { value: sym, label: "test" };
      const response = encodeSuccess(data, 1);
      expect((response.result as any).value).toBe(sym);
    });

    test("encodeError accepts a function as data (codec does not validate)", () => {
      const fn = () => "detail";
      const response = encodeError(-32603, "Internal error", 1, fn);
      expect(response.error.data).toBe(fn);
    });

    test("encodeError accepts a Symbol as data (codec does not validate)", () => {
      const sym = Symbol("detail");
      const response = encodeError(-32603, "Internal error", 1, sym);
      expect(response.error.data).toBe(sym);
    });

    test("encodeError accepts an object with function values as data (codec does not validate)", () => {
      const data = { callback: () => {}, info: "test" };
      const response = encodeError(-32000, "Custom", 1, data);
      expect(typeof (response.error.data as any).callback).toBe("function");
    });
  });

  // ─── Request/Response判定の境界ケース: method + result/error の共存 (双方向確認) ───

  describe("Request/Response boundary: method + result/error coexistence (bidirectional)", () => {
    // method + result: isJsonRpcRequest rejects (result present), isJsonRpcResponse rejects (method present)
    test("message with method + result: isJsonRpcRequest → false", () => {
      const msg = { jsonrpc: "2.0", method: "ping", result: "ok", id: 1 };
      expect(isJsonRpcRequest(msg)).toBe(false);
    });

    test("message with method + result: isJsonRpcResponse → false", () => {
      const msg = { jsonrpc: "2.0", method: "ping", result: "ok", id: 1 };
      expect(isJsonRpcResponse(msg)).toBe(false);
    });

    // method + error: isJsonRpcRequest rejects (error present), isJsonRpcResponse rejects (method present)
    test("message with method + error: isJsonRpcRequest → false", () => {
      const msg = { jsonrpc: "2.0", method: "ping", error: { code: -32600, message: "Invalid" }, id: 1 };
      expect(isJsonRpcRequest(msg)).toBe(false);
    });

    test("message with method + error: isJsonRpcResponse → false", () => {
      const msg = { jsonrpc: "2.0", method: "ping", error: { code: -32600, message: "Invalid" }, id: 1 };
      expect(isJsonRpcResponse(msg)).toBe(false);
    });

    // method + result + error: isJsonRpcRequest rejects, isJsonRpcResponse rejects
    test("message with method + result + error: isJsonRpcRequest → false", () => {
      const msg = { jsonrpc: "2.0", method: "ping", result: "ok", error: { code: -32600, message: "Invalid" }, id: 1 };
      expect(isJsonRpcRequest(msg)).toBe(false);
    });

    test("message with method + result + error: isJsonRpcResponse → false", () => {
      const msg = { jsonrpc: "2.0", method: "ping", result: "ok", error: { code: -32600, message: "Invalid" }, id: 1 };
      expect(isJsonRpcResponse(msg)).toBe(false);
    });

    // Confirm that without method, result/error messages are valid responses
    test("message with result only (no method): isJsonRpcResponse → true", () => {
      const msg = { jsonrpc: "2.0", result: "ok", id: 1 };
      expect(isJsonRpcResponse(msg)).toBe(true);
    });

    test("message with error only (no method): isJsonRpcResponse → true", () => {
      const msg = { jsonrpc: "2.0", error: { code: -32600, message: "Invalid" }, id: 1 };
      expect(isJsonRpcResponse(msg)).toBe(true);
    });

    // Confirm that without result/error, method messages are valid requests
    test("message with method only (no result/error): isJsonRpcRequest → true", () => {
      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      expect(isJsonRpcRequest(msg)).toBe(true);
    });
  });

  // ─── §5.1 note3: id の型チェックを行わないことの明示テスト ───

  describe("id type is not validated (§5.1 note 3)", () => {
    // isJsonRpcRequest accepts non-standard id types (object, array, boolean)
    test("isJsonRpcRequest accepts id as object", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: { key: "value" } })).toBe(true);
    });

    test("isJsonRpcRequest accepts id as array", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: [1, 2, 3] })).toBe(true);
    });

    test("isJsonRpcRequest accepts id as boolean true", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: true })).toBe(true);
    });

    test("isJsonRpcRequest accepts id as boolean false", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: false })).toBe(true);
    });

    test("isJsonRpcRequest accepts id as nested object", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: { a: { b: 1 } } })).toBe(true);
    });

    test("isJsonRpcRequest accepts id as empty array", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: [] })).toBe(true);
    });

    test("isJsonRpcRequest accepts id as empty object", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: {} })).toBe(true);
    });

    // isJsonRpcResponse accepts non-standard id types (object, array, boolean)
    test("isJsonRpcResponse accepts id as object", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", result: "ok", id: { key: "value" } })).toBe(true);
    });

    test("isJsonRpcResponse accepts id as array", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", result: "ok", id: [1, 2, 3] })).toBe(true);
    });

    test("isJsonRpcResponse accepts id as boolean true", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", result: "ok", id: true })).toBe(true);
    });

    test("isJsonRpcResponse accepts id as boolean false", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", result: "ok", id: false })).toBe(true);
    });

    test("isJsonRpcResponse accepts id as nested object", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", error: { code: -1, message: "err" }, id: { a: { b: 1 } } })).toBe(true);
    });

    test("isJsonRpcResponse accepts id as empty array", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", error: { code: -1, message: "err" }, id: [] })).toBe(true);
    });

    test("isJsonRpcResponse accepts id as empty object", () => {
      expect(isJsonRpcResponse({ jsonrpc: "2.0", result: null, id: {} })).toBe(true);
    });
  });

  // ─── encodeError error object 構造の完全性テスト ───

  describe("encodeError error object structural completeness", () => {
    // Without data: error object has exactly {code, message}, no extra fields
    test("error object without data has exactly 'code' and 'message' keys (no extras)", () => {
      const response = encodeError(-32601, "Method not found", 1);
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toHaveLength(2);
      expect(errorKeys.sort()).toEqual(["code", "message"]);
    });

    // With data: error object has exactly {code, message, data}, no extra fields
    test("error object with data has exactly 'code', 'message', and 'data' keys (no extras)", () => {
      const response = encodeError(-32602, "Invalid params", 1, { field: "id" });
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toHaveLength(3);
      expect(errorKeys.sort()).toEqual(["code", "data", "message"]);
    });

    // With null data: error object has exactly {code, message, data}
    test("error object with null data has exactly 'code', 'message', and 'data' keys", () => {
      const response = encodeError(-32603, "Internal error", 1, null);
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toHaveLength(3);
      expect(errorKeys.sort()).toEqual(["code", "data", "message"]);
    });

    // With falsy data (0): error object has exactly {code, message, data}
    test("error object with 0 as data has exactly 'code', 'message', and 'data' keys", () => {
      const response = encodeError(-32000, "Server error", 1, 0);
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toHaveLength(3);
      expect(errorKeys.sort()).toEqual(["code", "data", "message"]);
    });

    // With false data: error object has exactly {code, message, data}
    test("error object with false as data has exactly 'code', 'message', and 'data' keys", () => {
      const response = encodeError(-32000, "Server error", 1, false);
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toHaveLength(3);
      expect(errorKeys.sort()).toEqual(["code", "data", "message"]);
    });

    // With empty string data: error object has exactly {code, message, data}
    test("error object with empty string data has exactly 'code', 'message', and 'data' keys", () => {
      const response = encodeError(-32000, "Server error", 1, "");
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toHaveLength(3);
      expect(errorKeys.sort()).toEqual(["code", "data", "message"]);
    });

    // Verify the top-level response object also has no extra fields
    test("response object without data has exactly 'jsonrpc', 'error', and 'id' keys", () => {
      const response = encodeError(-32601, "Method not found", 1);
      const responseKeys = Object.keys(response);
      expect(responseKeys).toHaveLength(3);
      expect(responseKeys.sort()).toEqual(["error", "id", "jsonrpc"]);
    });

    test("response object with data has exactly 'jsonrpc', 'error', and 'id' keys", () => {
      const response = encodeError(-32602, "Invalid params", 1, { detail: "x" });
      const responseKeys = Object.keys(response);
      expect(responseKeys).toHaveLength(3);
      expect(responseKeys.sort()).toEqual(["error", "id", "jsonrpc"]);
    });

    // With undefined data (explicitly passed): data key must NOT exist
    test("error object with explicitly passed undefined data omits 'data' key entirely", () => {
      const response = encodeError(-32603, "Internal error", 1, undefined);
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toHaveLength(2);
      expect(errorKeys.sort()).toEqual(["code", "message"]);
      expect("data" in response.error).toBe(false);
    });

    // Without data argument: data key must NOT exist
    test("error object without data argument omits 'data' key entirely", () => {
      const response = encodeError(-32603, "Internal error", 1);
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toHaveLength(2);
      expect(errorKeys.sort()).toEqual(["code", "message"]);
      expect("data" in response.error).toBe(false);
    });
  });

  // ─── Codec layer responsibility separation (method name validation is app-layer) ───

  describe("codec layer responsibility separation (method validation deferred to app layer)", () => {
    // The codec layer only checks that method is a string. Semantic validation
    // (empty string, "rpc." prefix, reserved names, etc.) is the responsibility
    // of the app layer (Fractal.method() / dispatch()). These tests explicitly
    // document this boundary.

    test("accepts empty string method (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "", id: 1 })).toBe(true);
    });

    test("accepts method with rpc. prefix (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "rpc.discover", id: 1 })).toBe(true);
    });

    test("accepts method with rpc. prefix and sub-namespace (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "rpc.system.listMethods", id: 1 })).toBe(true);
    });

    test("accepts method with leading dot (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: ".user", id: 1 })).toBe(true);
    });

    test("accepts method with trailing dot (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "user.", id: 1 })).toBe(true);
    });

    test("accepts method with consecutive dots (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "user..get", id: 1 })).toBe(true);
    });

    test("accepts reserved client property names as method (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "then", id: 1 })).toBe(true);
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "$notify", id: 1 })).toBe(true);
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "dispose", id: 1 })).toBe(true);
    });

    test("accepts reserved names as namespace prefix (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "then.check", id: 1 })).toBe(true);
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "$notify.log", id: 1 })).toBe(true);
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "dispose.all", id: 1 })).toBe(true);
    });

    // Also verify these work as notifications (no id)
    test("accepts empty string method as notification (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "" })).toBe(true);
    });

    test("accepts rpc. prefix method as notification (app layer validates, not codec)", () => {
      expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "rpc.discover" })).toBe(true);
    });
  });
});
