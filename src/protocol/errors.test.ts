import {
  errorToResponse,
  FractalError,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  RpcError,
} from "./errors.ts";

describe("protocol/errors", () => {
  test("PARSE_ERROR is -32700", () => {
    expect(PARSE_ERROR).toBe(-32700);
  });

  test("INVALID_REQUEST is -32600", () => {
    expect(INVALID_REQUEST).toBe(-32600);
  });

  test("METHOD_NOT_FOUND is -32601", () => {
    expect(METHOD_NOT_FOUND).toBe(-32601);
  });

  test("INVALID_PARAMS is -32602", () => {
    expect(INVALID_PARAMS).toBe(-32602);
  });

  test("INTERNAL_ERROR is -32603", () => {
    expect(INTERNAL_ERROR).toBe(-32603);
  });

  // ─── RpcError class ───

  describe("RpcError class", () => {
    test("is instanceof Error", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err).toBeInstanceOf(Error);
    });

    test("has correct code property", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err.code).toBe(-32601);
    });

    test("has correct message property", () => {
      const err = new RpcError(-32601, "Method not found");
      expect(err.message).toBe("Method not found");
    });

    test("stores data when provided", () => {
      const err = new RpcError(-32602, "Bad", { field: "id" });
      expect(err.data).toEqual({ field: "id" });
    });

    test("data is undefined when not provided", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err.data).toBeUndefined();
    });

    test("name is 'RpcError'", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err.name).toBe("RpcError");
    });

    // §5.1: standard error codes with canonical messages
    test("Parse error: code -32700", () => {
      const err = new RpcError(-32700, "Parse error");
      expect(err.code).toBe(-32700);
      expect(err.message).toBe("Parse error");
    });

    test("Invalid Request: code -32600", () => {
      const err = new RpcError(-32600, "Invalid Request");
      expect(err.code).toBe(-32600);
      expect(err.message).toBe("Invalid Request");
    });

    test("Method not found: code -32601", () => {
      const err = new RpcError(-32601, "Method not found");
      expect(err.code).toBe(-32601);
      expect(err.message).toBe("Method not found");
    });

    test("Invalid params: code -32602", () => {
      const err = new RpcError(-32602, "Invalid params");
      expect(err.code).toBe(-32602);
      expect(err.message).toBe("Invalid params");
    });

    test("Internal error: code -32603", () => {
      const err = new RpcError(-32603, "Internal error");
      expect(err.code).toBe(-32603);
      expect(err.message).toBe("Internal error");
    });

    // .stack property inherited from Error
    test("has stack property (inherited from Error)", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err.stack).toBeDefined();
      expect(typeof err.stack).toBe("string");
    });
  });

  // ─── FractalError class ───

  describe("FractalError class", () => {
    test("is instanceof Error", () => {
      const err = new FractalError("DISPOSED");
      expect(err).toBeInstanceOf(Error);
    });

    test("has code 'DISPOSED'", () => {
      const err = new FractalError("DISPOSED");
      expect(err.code).toBe("DISPOSED");
    });

    test("has code 'TIMEOUT'", () => {
      const err = new FractalError("TIMEOUT");
      expect(err.code).toBe("TIMEOUT");
    });

    test("name is 'FractalError'", () => {
      const err = new FractalError("DISPOSED");
      expect(err.name).toBe("FractalError");
    });

    test("message includes the code", () => {
      const err = new FractalError("TIMEOUT");
      expect(err.message).toContain("TIMEOUT");
    });

    // .stack property inherited from Error
    test("has stack property (inherited from Error)", () => {
      const err = new FractalError("DISPOSED");
      expect(err.stack).toBeDefined();
      expect(typeof err.stack).toBe("string");
    });
  });

  // ─── error response data field ───

  describe("error response data field", () => {
    test("RpcError preserves data: null", () => {
      const err = new RpcError(-32603, "Err", null);
      expect(err.data).toBeNull();
    });

    test("RpcError does not inject stack trace into data", () => {
      const data = { detail: "something went wrong" };
      const err = new RpcError(-32603, "Internal error", data);
      expect(err.data).toEqual({ detail: "something went wrong" });
      expect(err.data).not.toHaveProperty("stack");
    });

    test("RpcError preserves data: string", () => {
      const err = new RpcError(-32602, "Bad params", "missing field");
      expect(err.data).toBe("missing field");
    });

    test("RpcError preserves data: number", () => {
      const err = new RpcError(-32602, "Bad params", 42);
      expect(err.data).toBe(42);
    });

    test("RpcError preserves data: boolean", () => {
      const err = new RpcError(-32602, "Bad params", true);
      expect(err.data).toBe(true);
    });

    test("RpcError preserves data: array", () => {
      const arr = [1, "two", { three: 3 }];
      const err = new RpcError(-32602, "Bad params", arr);
      expect(err.data).toEqual([1, "two", { three: 3 }]);
    });
  });

  // ─── server error reserved range ───

  describe("server error reserved range", () => {
    test("RpcError accepts code -32000 (start of reserved range)", () => {
      const err = new RpcError(-32000, "Server error");
      expect(err.code).toBe(-32000);
      expect(err.message).toBe("Server error");
    });

    test("RpcError accepts code -32099 (end of reserved range)", () => {
      const err = new RpcError(-32099, "Server error");
      expect(err.code).toBe(-32099);
      expect(err.message).toBe("Server error");
    });

    test("RpcError accepts code -32050 (mid reserved range)", () => {
      const err = new RpcError(-32050, "Custom server error", {
        reason: "overloaded",
      });
      expect(err.code).toBe(-32050);
      expect(err.data).toEqual({ reason: "overloaded" });
    });
  });

  // ─── FractalError exact message format ───

  describe("FractalError exact message format", () => {
    test("DISPOSED error has exact message string", () => {
      const err = new FractalError("DISPOSED");
      expect(err.message).toBe("DISPOSED");
    });

    test("TIMEOUT error has exact message string", () => {
      const err = new FractalError("TIMEOUT");
      expect(err.message).toBe("TIMEOUT");
    });

    test("DISPOSED message equals its code", () => {
      const err = new FractalError("DISPOSED");
      expect(err.message).toBe(err.code);
    });

    test("TIMEOUT message equals its code", () => {
      const err = new FractalError("TIMEOUT");
      expect(err.message).toBe(err.code);
    });
  });

  // ─── error inheritance chain ───

  describe("error inheritance chain", () => {
    test("RpcError.prototype.name is 'RpcError'", () => {
      expect(RpcError.prototype.name).toBe("RpcError");
    });

    test("FractalError.prototype.name is 'FractalError'", () => {
      expect(FractalError.prototype.name).toBe("FractalError");
    });

    test("RpcError constructor function name is 'RpcError'", () => {
      expect(RpcError.name).toBe("RpcError");
    });

    test("FractalError constructor function name is 'FractalError'", () => {
      expect(FractalError.name).toBe("FractalError");
    });

    test("RpcError is in the Error prototype chain", () => {
      expect(Object.getPrototypeOf(RpcError.prototype)).toBe(Error.prototype);
    });

    test("FractalError is in the Error prototype chain", () => {
      expect(Object.getPrototypeOf(FractalError.prototype)).toBe(
        Error.prototype,
      );
    });
  });

  // ─── cross-type instanceof ───

  describe("cross-type instanceof", () => {
    test("RpcError is NOT instanceof FractalError", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err).not.toBeInstanceOf(FractalError);
    });

    test("FractalError is NOT instanceof RpcError", () => {
      const err = new FractalError("TIMEOUT");
      expect(err).not.toBeInstanceOf(RpcError);
    });

    test("both are instanceof Error", () => {
      const rpcErr = new RpcError(-32601, "Not found");
      const fractalErr = new FractalError("DISPOSED");
      expect(rpcErr).toBeInstanceOf(Error);
      expect(fractalErr).toBeInstanceOf(Error);
    });
  });

  // ─── errorToResponse conversion (§5.1) ───

  describe("errorToResponse conversion", () => {
    test("Error instance uses error.message in response", () => {
      const err = new Error("something broke");
      const response = errorToResponse(err, 1);
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32603, message: "something broke" },
        id: 1,
      });
    });

    test("Error subclass (RpcError) uses error.message in response", () => {
      const err = new RpcError(-32601, "Method not found");
      const response = errorToResponse(err, 2);
      expect(response.error.message).toBe("Method not found");
      expect(response.error.code).toBe(-32603);
    });

    test("thrown string results in fixed 'Internal error' message", () => {
      const response = errorToResponse("some string", 1);
      expect(response.error.message).toBe("Internal error");
      expect(response.error.code).toBe(-32603);
    });

    test("thrown null results in fixed 'Internal error' message", () => {
      const response = errorToResponse(null, 1);
      expect(response.error.message).toBe("Internal error");
      expect(response.error.code).toBe(-32603);
    });

    test("thrown undefined results in fixed 'Internal error' message", () => {
      const response = errorToResponse(undefined, 1);
      expect(response.error.message).toBe("Internal error");
      expect(response.error.code).toBe(-32603);
    });

    test("thrown number results in fixed 'Internal error' message", () => {
      const response = errorToResponse(42, 1);
      expect(response.error.message).toBe("Internal error");
      expect(response.error.code).toBe(-32603);
    });

    test("thrown boolean results in fixed 'Internal error' message", () => {
      const response = errorToResponse(true, 1);
      expect(response.error.message).toBe("Internal error");
    });

    test("thrown object (non-Error) results in fixed 'Internal error' message", () => {
      const response = errorToResponse({ foo: "bar" }, 1);
      expect(response.error.message).toBe("Internal error");
    });

    test("no stack trace in data field when Error is thrown", () => {
      const err = new Error("boom");
      const response = errorToResponse(err, 1);
      expect(response.error).not.toHaveProperty("data");
    });

    test("no stack trace in data field when non-Error is thrown", () => {
      const response = errorToResponse("oops", 1);
      expect(response.error).not.toHaveProperty("data");
    });

    test("response preserves the provided id (number)", () => {
      const response = errorToResponse(new Error("x"), 42);
      expect(response.id).toBe(42);
    });

    test("response preserves the provided id (string)", () => {
      const response = errorToResponse(new Error("x"), "abc");
      expect(response.id).toBe("abc");
    });

    test("response preserves the provided id (null)", () => {
      const response = errorToResponse(new Error("x"), null);
      expect(response.id).toBeNull();
    });

    test("response always has jsonrpc: '2.0'", () => {
      const response = errorToResponse(new Error("x"), 1);
      expect(response.jsonrpc).toBe("2.0");
    });
  });

  // ─── RpcError constructor edge cases ───

  describe("RpcError constructor edge cases", () => {
    test("empty string message", () => {
      const err = new RpcError(-32603, "");
      expect(err.message).toBe("");
      expect(err.code).toBe(-32603);
    });

    test("message with newlines", () => {
      const err = new RpcError(-32603, "line1\nline2");
      expect(err.message).toBe("line1\nline2");
    });

    test("message with tabs", () => {
      const err = new RpcError(-32603, "field\terror");
      expect(err.message).toBe("field\terror");
    });

    test("message with mixed special characters (newlines, tabs, carriage returns)", () => {
      const msg = "error:\t'bad input'\r\ndetails:\tnone";
      const err = new RpcError(-32603, msg);
      expect(err.message).toBe(msg);
    });

    test("code 0", () => {
      const err = new RpcError(0, "Zero code");
      expect(err.code).toBe(0);
      expect(err.message).toBe("Zero code");
    });

    test("extreme positive code value (Number.MAX_SAFE_INTEGER)", () => {
      const err = new RpcError(Number.MAX_SAFE_INTEGER, "Max");
      expect(err.code).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("extreme negative code value (Number.MIN_SAFE_INTEGER)", () => {
      const err = new RpcError(Number.MIN_SAFE_INTEGER, "Min");
      expect(err.code).toBe(Number.MIN_SAFE_INTEGER);
    });

    test("positive code value", () => {
      const err = new RpcError(1, "Positive");
      expect(err.code).toBe(1);
    });

    test("fractional code value is preserved", () => {
      const err = new RpcError(1.5, "Fractional");
      expect(err.code).toBe(1.5);
    });
  });

  // ─── FractalError valid codes ───

  describe("FractalError valid codes", () => {
    test("'DISPOSED' is a valid code", () => {
      const err = new FractalError("DISPOSED");
      expect(err.code).toBe("DISPOSED");
      expect(err).toBeInstanceOf(FractalError);
    });

    test("'TIMEOUT' is a valid code", () => {
      const err = new FractalError("TIMEOUT");
      expect(err.code).toBe("TIMEOUT");
      expect(err).toBeInstanceOf(FractalError);
    });

    test("only 'DISPOSED' and 'TIMEOUT' are valid (type-level constraint)", () => {
      // This test verifies at runtime that the two known codes produce valid instances
      const validCodes = ["DISPOSED", "TIMEOUT"] as const;
      for (const code of validCodes) {
        const err = new FractalError(code);
        expect(err.code).toBe(code);
        expect(err.message).toBe(code);
        expect(err).toBeInstanceOf(FractalError);
        expect(err).toBeInstanceOf(Error);
      }
      // Verify exactly 2 valid codes
      expect(validCodes).toHaveLength(2);
    });
  });

  // ─── instanceof checks between RpcError and FractalError ───

  describe("instanceof isolation between RpcError and FractalError", () => {
    test("RpcError instance is not instanceof FractalError", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err instanceof FractalError).toBe(false);
    });

    test("FractalError instance is not instanceof RpcError", () => {
      const err = new FractalError("TIMEOUT");
      expect(err instanceof RpcError).toBe(false);
    });

    test("RpcError instance is instanceof Error but not FractalError", () => {
      const err = new RpcError(-32603, "Internal error");
      expect(err instanceof Error).toBe(true);
      expect(err instanceof FractalError).toBe(false);
    });

    test("FractalError instance is instanceof Error but not RpcError", () => {
      const err = new FractalError("DISPOSED");
      expect(err instanceof Error).toBe(true);
      expect(err instanceof RpcError).toBe(false);
    });

    test("plain Error is neither instanceof RpcError nor FractalError", () => {
      const err = new Error("plain");
      expect(err instanceof RpcError).toBe(false);
      expect(err instanceof FractalError).toBe(false);
    });
  });

  // ─── Error.stack existence and content ───

  describe("Error.stack existence and content", () => {
    test("RpcError stack trace is present and is a non-empty string", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err.stack).toBeDefined();
      expect(typeof err.stack).toBe("string");
      expect(err.stack!.length).toBeGreaterThan(0);
    });

    test("RpcError stack trace contains the error message", () => {
      const err = new RpcError(-32601, "Method not found");
      expect(err.stack).toContain("Method not found");
    });

    test("RpcError stack trace contains the error name", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err.stack).toContain("RpcError");
    });

    test("FractalError stack trace is present and is a non-empty string", () => {
      const err = new FractalError("DISPOSED");
      expect(err.stack).toBeDefined();
      expect(typeof err.stack).toBe("string");
      expect(err.stack!.length).toBeGreaterThan(0);
    });

    test("FractalError stack trace contains the error message", () => {
      const err = new FractalError("TIMEOUT");
      expect(err.stack).toContain("TIMEOUT");
    });

    test("FractalError stack trace contains the error name", () => {
      const err = new FractalError("DISPOSED");
      expect(err.stack).toContain("FractalError");
    });

    test("RpcError stack trace contains the test file reference", () => {
      const err = new RpcError(-32601, "Not found");
      expect(err.stack).toContain("errors.test.ts");
    });

    test("FractalError stack trace contains the test file reference", () => {
      const err = new FractalError("TIMEOUT");
      expect(err.stack).toContain("errors.test.ts");
    });
  });

  // ─── errorToResponse with RpcError: code and data handling ───

  describe("errorToResponse with RpcError: code and data handling", () => {
    test("RpcError(-32601) is converted to INTERNAL_ERROR code (-32603), not the original code", () => {
      const err = new RpcError(-32601, "Method not found", { detail: "x" });
      const response = errorToResponse(err, 1);
      expect(response.error.code).toBe(-32603);
    });

    test("RpcError data is not included in the error response", () => {
      const err = new RpcError(-32601, "Method not found", { detail: "x" });
      const response = errorToResponse(err, 1);
      expect(response.error).not.toHaveProperty("data");
    });
  });

  // ─── RpcError explicit undefined as data (arguments.length behavior) ───

  describe("RpcError explicit undefined as data", () => {
    test("new RpcError(-32603, 'err', undefined) has data in err (arguments.length >= 3)", () => {
      const err = new RpcError(-32603, "err", undefined);
      // arguments.length >= 3, so the constructor explicitly assigns data
      expect("data" in err).toBe(true);
      expect(err.data).toBeUndefined();
    });

    test("new RpcError(-32603, 'err') without third argument also has data in err due to class field initialization", () => {
      const err = new RpcError(-32603, "err");
      // The class field `readonly data?: unknown` causes TypeScript to initialize the property
      // to undefined on every instance, so "data" in err is true regardless of arguments.length.
      // The arguments.length guard only controls whether an explicit assignment happens in the
      // constructor body, but the class field initializer runs before it.
      expect("data" in err).toBe(true);
      expect(err.data).toBeUndefined();
    });
  });

  // ─── Error subclasses (TypeError, RangeError, etc.) with errorToResponse ───

  describe("Error subclasses with errorToResponse", () => {
    test("TypeError message is used in error response", () => {
      const err = new TypeError("invalid type");
      const response = errorToResponse(err, 1);
      expect(response.error.message).toBe("invalid type");
      expect(response.error.code).toBe(-32603);
    });

    test("RangeError message is used in error response", () => {
      const err = new RangeError("out of range");
      const response = errorToResponse(err, 2);
      expect(response.error.message).toBe("out of range");
      expect(response.error.code).toBe(-32603);
    });

    test("SyntaxError message is used in error response", () => {
      const err = new SyntaxError("unexpected token");
      const response = errorToResponse(err, 3);
      expect(response.error.message).toBe("unexpected token");
      expect(response.error.code).toBe(-32603);
    });
  });

  // ─── errorToResponse response structure strict validation ───

  describe("errorToResponse response structure strict validation", () => {
    test("error object has exactly code and message properties (no data)", () => {
      const err = new Error("something broke");
      const response = errorToResponse(err, 1);
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toEqual(["code", "message"]);
    });

    test("error object from non-Error thrown value has exactly code and message properties", () => {
      const response = errorToResponse("oops", 1);
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toEqual(["code", "message"]);
    });

    test("error object from RpcError with data still has exactly code and message (no data leak)", () => {
      const err = new RpcError(-32601, "Method not found", { detail: "x" });
      const response = errorToResponse(err, 1);
      const errorKeys = Object.keys(response.error);
      expect(errorKeys).toEqual(["code", "message"]);
    });
  });

  // ─── Out-of-range custom error codes for RpcError ───

  describe("out-of-range custom error codes for RpcError", () => {
    test("RpcError accepts code -1", () => {
      const err = new RpcError(-1, "Custom error");
      expect(err.code).toBe(-1);
      expect(err.message).toBe("Custom error");
    });

    test("RpcError accepts code 100", () => {
      const err = new RpcError(100, "Custom error");
      expect(err.code).toBe(100);
      expect(err.message).toBe("Custom error");
    });

    test("RpcError accepts code -33000 (outside reserved range)", () => {
      const err = new RpcError(-33000, "Custom error");
      expect(err.code).toBe(-33000);
      expect(err.message).toBe("Custom error");
    });

    test("RpcError accepts code 999999", () => {
      const err = new RpcError(999999, "Large positive code");
      expect(err.code).toBe(999999);
      expect(err.message).toBe("Large positive code");
    });

    test("RpcError accepts code -999999", () => {
      const err = new RpcError(-999999, "Large negative code");
      expect(err.code).toBe(-999999);
      expect(err.message).toBe("Large negative code");
    });
  });

  // ─── errorToResponse top-level structure ───

  describe("errorToResponse top-level structure", () => {
    test("response has exactly jsonrpc, error, and id keys (no result)", () => {
      const response = errorToResponse(new Error("boom"), 1);
      expect(Object.keys(response).sort()).toEqual(["error", "id", "jsonrpc"]);
      expect("result" in response).toBe(false);
    });

    test("response from non-Error thrown value has exactly jsonrpc, error, and id keys (no result)", () => {
      const response = errorToResponse("oops", 42);
      expect(Object.keys(response).sort()).toEqual(["error", "id", "jsonrpc"]);
      expect("result" in response).toBe(false);
    });
  });

  // ─── errorToResponse with FractalError ───

  describe("errorToResponse with FractalError", () => {
    test("FractalError uses error.message in response", () => {
      const err = new FractalError("DISPOSED");
      const response = errorToResponse(err, 1);
      expect(response.error.message).toBe("DISPOSED");
    });

    test("FractalError TIMEOUT uses error.message in response", () => {
      const err = new FractalError("TIMEOUT");
      const response = errorToResponse(err, 2);
      expect(response.error.message).toBe("TIMEOUT");
    });

    test("FractalError is converted with INTERNAL_ERROR code (-32603)", () => {
      const err = new FractalError("DISPOSED");
      const response = errorToResponse(err, 1);
      expect(response.error.code).toBe(-32603);
    });
  });

  // ─── errorToResponse with notification (id absent) ───

  describe("errorToResponse with notification (id absent)", () => {
    test("id=null produces response with id: null", () => {
      const response = errorToResponse(new Error("fail"), null);
      expect(response.id).toBeNull();
      expect(response.error.code).toBe(-32603);
      expect(response.error.message).toBe("fail");
      expect(response.jsonrpc).toBe("2.0");
    });

    test("non-Error thrown with id=null produces 'Internal error' message and id: null", () => {
      const response = errorToResponse("oops", null);
      expect(response.id).toBeNull();
      expect(response.error.message).toBe("Internal error");
    });

    test("response structure with id=null has exactly jsonrpc, error, and id keys", () => {
      const response = errorToResponse(new Error("x"), null);
      expect(Object.keys(response).sort()).toEqual(["error", "id", "jsonrpc"]);
    });
  });

  // ─── errorToResponse with Error having unusual message values ───

  describe("errorToResponse with Error having unusual message values", () => {
    test("Error with empty string message uses empty string", () => {
      const err = new Error("");
      const response = errorToResponse(err, 1);
      expect(response.error.message).toBe("");
    });

    test("Error with message containing only whitespace preserves it", () => {
      const err = new Error("   ");
      const response = errorToResponse(err, 1);
      expect(response.error.message).toBe("   ");
    });

    test("Error constructed without arguments uses default empty message", () => {
      const err = new Error();
      const response = errorToResponse(err, 1);
      // Error() without arguments has message === ""
      expect(response.error.message).toBe("");
    });

    test("Error with very long message preserves it", () => {
      const longMsg = "x".repeat(10000);
      const err = new Error(longMsg);
      const response = errorToResponse(err, 1);
      expect(response.error.message).toBe(longMsg);
    });

    test("Error with newlines in message preserves them", () => {
      const err = new Error("line1\nline2\nline3");
      const response = errorToResponse(err, 1);
      expect(response.error.message).toBe("line1\nline2\nline3");
    });
  });

  // ─── errorToResponse with non-Error objects ───

  describe("errorToResponse with non-Error objects", () => {
    test("Object.create(null) (no prototype) results in 'Internal error'", () => {
      const obj = Object.create(null);
      obj.message = "should be ignored";
      const response = errorToResponse(obj, 1);
      expect(response.error.message).toBe("Internal error");
      expect(response.error.code).toBe(-32603);
    });

    test("plain object with message property results in 'Internal error'", () => {
      const response = errorToResponse({ message: "not an error" }, 1);
      expect(response.error.message).toBe("Internal error");
    });

    test("thrown Symbol results in 'Internal error'", () => {
      const response = errorToResponse(Symbol("test"), 1);
      expect(response.error.message).toBe("Internal error");
    });

    test("thrown BigInt results in 'Internal error'", () => {
      const response = errorToResponse(BigInt(42), 1);
      expect(response.error.message).toBe("Internal error");
    });

    test("thrown array results in 'Internal error'", () => {
      const response = errorToResponse([1, 2, 3], 1);
      expect(response.error.message).toBe("Internal error");
    });

    test("thrown function results in 'Internal error'", () => {
      const response = errorToResponse(() => {}, 1);
      expect(response.error.message).toBe("Internal error");
    });
  });

  // ─── Review: errorToResponse に RpcError を渡した場合の data フィールド処理 ───

  describe("errorToResponse does not propagate RpcError data field", () => {
    test("RpcError(-32601, 'msg', {detail: 'x'}) → response.error has no data property", () => {
      const err = new RpcError(-32601, "msg", { detail: "x" });
      const response = errorToResponse(err, 1);
      expect("data" in response.error).toBe(false);
    });

    test("RpcError with complex data object → response.error has no data property", () => {
      const err = new RpcError(-32602, "Bad params", {
        nested: { a: 1 },
        list: [1, 2],
      });
      const response = errorToResponse(err, 5);
      expect("data" in response.error).toBe(false);
    });

    test("RpcError with null data → response.error has no data property", () => {
      const err = new RpcError(-32603, "Internal", null);
      const response = errorToResponse(err, 10);
      expect("data" in response.error).toBe(false);
    });
  });

  // ─── Review: FractalError の message フォーマット ───

  describe("FractalError message is exactly equal to its code", () => {
    test("DISPOSED: message === code (strict equality)", () => {
      const err = new FractalError("DISPOSED");
      expect(err.message).toStrictEqual(err.code);
    });

    test("TIMEOUT: message === code (strict equality)", () => {
      const err = new FractalError("TIMEOUT");
      expect(err.message).toStrictEqual(err.code);
    });

    test("DISPOSED: message is exactly the string 'DISPOSED'", () => {
      const err = new FractalError("DISPOSED");
      expect(err.message).toBe("DISPOSED");
    });

    test("TIMEOUT: message is exactly the string 'TIMEOUT'", () => {
      const err = new FractalError("TIMEOUT");
      expect(err.message).toBe("TIMEOUT");
    });
  });

  // ─── Review: errorToResponse の id 正規化 ───

  describe("errorToResponse normalizes undefined id to null", () => {
    test("id=undefined is normalized to null in the response", () => {
      // c.req.id can be undefined for notifications; errorToResponse should normalize to null
      const response = errorToResponse(
        new Error("fail"),
        undefined as unknown as null,
      );
      expect(response.id).toBeNull();
    });

    test("id=undefined with non-Error thrown value is normalized to null", () => {
      const response = errorToResponse("oops", undefined as unknown as null);
      expect(response.id).toBeNull();
    });
  });

  // ─── Review: 非Error値のthrow全バリエーション ───

  describe("non-Error throw: Symbol, BigInt, array, function all produce 'Internal error'", () => {
    test("thrown Symbol produces fixed 'Internal error' message", () => {
      const response = errorToResponse(Symbol("test"), 1);
      expect(response.error.message).toBe("Internal error");
      expect(response.error.code).toBe(INTERNAL_ERROR);
    });

    test("thrown BigInt produces fixed 'Internal error' message", () => {
      const response = errorToResponse(BigInt(123), 2);
      expect(response.error.message).toBe("Internal error");
      expect(response.error.code).toBe(INTERNAL_ERROR);
    });

    test("thrown array produces fixed 'Internal error' message", () => {
      const response = errorToResponse([1, "two", { three: 3 }], 3);
      expect(response.error.message).toBe("Internal error");
      expect(response.error.code).toBe(INTERNAL_ERROR);
    });

    test("thrown function produces fixed 'Internal error' message", () => {
      const response = errorToResponse(() => "hello", 4);
      expect(response.error.message).toBe("Internal error");
      expect(response.error.code).toBe(INTERNAL_ERROR);
    });
  });

  // ─── RpcError data with special values ───

  describe("RpcError data with special values", () => {
    test("RpcError preserves data: Symbol", () => {
      const sym = Symbol("test");
      const err = new RpcError(-32603, "Err", sym);
      expect(err.data).toBe(sym);
    });

    test("RpcError preserves data: BigInt", () => {
      const big = BigInt(9007199254740991);
      const err = new RpcError(-32603, "Err", big);
      expect(err.data).toBe(big);
    });

    test("RpcError preserves data: undefined (explicit third argument)", () => {
      const err = new RpcError(-32603, "Err", undefined);
      expect("data" in err).toBe(true);
      expect(err.data).toBeUndefined();
    });

    test("RpcError preserves data: nested object", () => {
      const nested = { a: { b: { c: [1, 2, 3] } } };
      const err = new RpcError(-32603, "Err", nested);
      expect(err.data).toEqual({ a: { b: { c: [1, 2, 3] } } });
    });

    test("RpcError preserves data: function", () => {
      const fn = () => "hello";
      const err = new RpcError(-32603, "Err", fn);
      expect(err.data).toBe(fn);
    });

    test("RpcError preserves data: Map", () => {
      const map = new Map([["key", "value"]]);
      const err = new RpcError(-32603, "Err", map);
      expect(err.data).toBe(map);
      expect((err.data as Map<string, string>).get("key")).toBe("value");
    });
  });

  // ─── Round 2 Review: additional missing tests ───

  describe("errorToResponse with FractalError('TIMEOUT')", () => {
    test("FractalError('TIMEOUT') produces code -32603 and uses FractalError's message", () => {
      const err = new FractalError("TIMEOUT");
      const response = errorToResponse(err, 7);
      expect(response.error.code).toBe(-32603);
      expect(response.error.message).toBe(err.message);
    });
  });

  describe("errorToResponse response structure completeness", () => {
    test("response has exactly { jsonrpc, error: { code, message }, id } with no extra fields", () => {
      const response = errorToResponse(new Error("test"), 1);
      // Top-level keys: exactly jsonrpc, error, id
      expect(Object.keys(response).sort()).toEqual(["error", "id", "jsonrpc"]);
      // Nested error keys: exactly code, message (no data, no stack, etc.)
      expect(Object.keys(response.error).sort()).toEqual(["code", "message"]);
    });

    test("response from non-Error has exactly { jsonrpc, error: { code, message }, id } with no extra fields", () => {
      const response = errorToResponse(42, "req-abc");
      expect(Object.keys(response).sort()).toEqual(["error", "id", "jsonrpc"]);
      expect(Object.keys(response.error).sort()).toEqual(["code", "message"]);
    });

    test("response from FractalError has exactly { jsonrpc, error: { code, message }, id } with no extra fields", () => {
      const response = errorToResponse(new FractalError("DISPOSED"), null);
      expect(Object.keys(response).sort()).toEqual(["error", "id", "jsonrpc"]);
      expect(Object.keys(response.error).sort()).toEqual(["code", "message"]);
    });
  });

  describe("standard Error subclass message extraction via errorToResponse", () => {
    test("TypeError('type error') message is extracted correctly", () => {
      const err = new TypeError("type error");
      const response = errorToResponse(err, 10);
      expect(response.error.message).toBe("type error");
      expect(response.error.code).toBe(-32603);
    });

    test("RangeError('range') message is extracted correctly", () => {
      const err = new RangeError("range");
      const response = errorToResponse(err, 11);
      expect(response.error.message).toBe("range");
      expect(response.error.code).toBe(-32603);
    });
  });
});
