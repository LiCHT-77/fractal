import { test, expect, describe, vi, beforeEach } from "bun:test";
import { createContext } from "./context.ts";

describe("core/context", () => {
  // ─── Context creation ───

  describe("createContext", () => {
    test("creates context with method, params, and id", () => {
      const ctx = createContext("user.get", { id: "123" }, 1);
      expect(ctx.req.method).toBe("user.get");
      expect(ctx.req.params).toEqual({ id: "123" });
      expect(ctx.req.id).toBe(1);
    });

    test("creates context with default empty params when omitted", () => {
      const ctx = createContext("ping", undefined, 1);
      expect(ctx.req.params).toEqual({});
    });

    test("creates context with string id", () => {
      const ctx = createContext("ping", {}, "abc-123");
      expect(ctx.req.id).toBe("abc-123");
    });

    test("creates context with null id", () => {
      const ctx = createContext("ping", {}, null);
      expect(ctx.req.id).toBe(null);
    });

    test("creates context without id (notification)", () => {
      const ctx = createContext("log.info", {});
      expect(ctx.req.id).toBeUndefined();
    });

    test("creates context with raw MessageEvent", () => {
      const raw = { data: {} } as MessageEvent;
      const ctx = createContext("ping", {}, 1, raw);
      expect(ctx.req.raw).toBe(raw);
    });

    test("raw is undefined when not provided", () => {
      const ctx = createContext("ping", {}, 1);
      expect(ctx.req.raw).toBeUndefined();
    });

    test("c.res is initially undefined", () => {
      const ctx = createContext("ping", {}, 1);
      expect(ctx.res).toBeUndefined();
    });
  });

  // ─── c.json() ───

  describe("c.json()", () => {
    test("returns a success response with result", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json("pong");
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: "pong",
        id: 1,
      });
    });

    test("returns success response with object data", () => {
      const ctx = createContext("user.get", {}, 1);
      const response = ctx.json({ id: "123", name: "Alice" });
      expect(response.result).toEqual({ id: "123", name: "Alice" });
    });

    test("returns success response with null result", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json(null);
      expect(response.result).toBeNull();
    });

    test("uses request id in response", () => {
      const ctx = createContext("ping", {}, 42);
      const response = ctx.json("pong");
      expect(response.id).toBe(42);
    });

    test("normalizes id to null for notification", () => {
      const ctx = createContext("ping", {});
      const response = ctx.json("pong");
      expect(response.id).toBeNull();
    });

    test("preserves null id", () => {
      const ctx = createContext("ping", {}, null);
      const response = ctx.json("pong");
      expect(response.id).toBeNull();
    });

    test("returns success with array result", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json([1, 2, 3]);
      expect(response.result).toEqual([1, 2, 3]);
    });

    test("returns success with nested object", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json({ a: { b: 1 } });
      expect(response.result).toEqual({ a: { b: 1 } });
    });

    test("returns success with empty object", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json({});
      expect(response.result).toEqual({});
    });

    test("returns success with numeric result", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json(42);
      expect(response.result).toBe(42);
    });

    test("repeated calls are independent", () => {
      const ctx = createContext("ping", {}, 1);
      const r1 = ctx.json("first");
      const r2 = ctx.json("second");
      expect(r1.result).toBe("first");
      expect(r2.result).toBe("second");
    });

    test("returns success with falsy result 0", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json(0);
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: 0,
        id: 1,
      });
    });

    test("returns success with falsy result empty string", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json("");
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: "",
        id: 1,
      });
    });

    test("returns success with falsy result false", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json(false);
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: false,
        id: 1,
      });
    });

    test("returns success with boolean true", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json(true);
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: true,
        id: 1,
      });
    });

    test("uses large numeric id", () => {
      const ctx = createContext("ping", {}, Number.MAX_SAFE_INTEGER);
      const response = ctx.json("pong");
      expect(response.id).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("response has exactly jsonrpc, result, and id fields", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json("pong");
      expect(Object.keys(response).sort()).toEqual(["id", "jsonrpc", "result"]);
    });

    test("preserves id: 0 (falsy but present)", () => {
      const ctx = createContext("ping", {}, 0);
      const response = ctx.json("pong");
      expect(response.id).toBe(0);
    });

    test('preserves id: "" (empty string, falsy but present)', () => {
      const ctx = createContext("ping", {}, "");
      const response = ctx.json("pong");
      expect(response.id).toBe("");
    });

    test("does not contain error field", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json("pong");
      expect("error" in response).toBe(false);
    });

    test("uses negative id -1", () => {
      const ctx = createContext("ping", {}, -1);
      const response = ctx.json("pong");
      expect(response.id).toBe(-1);
    });

    test("uses negative id -999", () => {
      const ctx = createContext("ping", {}, -999);
      const response = ctx.json("pong");
      expect(response.id).toBe(-999);
    });

    test("uses Infinity as id", () => {
      const ctx = createContext("ping", {}, Infinity);
      const response = ctx.json("pong");
      expect(response.id).toBe(Infinity);
    });

    test("uses -Infinity as id", () => {
      const ctx = createContext("ping", {}, -Infinity);
      const response = ctx.json("pong");
      expect(response.id).toBe(-Infinity);
    });

    test("uses NaN as id", () => {
      const ctx = createContext("ping", {}, NaN);
      const response = ctx.json("pong");
      expect(response.id).toBeNaN();
    });

    test("returns success with Date result", () => {
      const date = new Date("2026-01-01T00:00:00Z");
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json(date);
      expect(response.result).toBe(date);
    });

    test("returns success with RegExp result", () => {
      const regex = /test-[0-9]+/gi;
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json(regex);
      expect(response.result).toBe(regex);
    });

    test("returns success with nested objects of mixed types", () => {
      const mixed = {
        str: "hello",
        num: 42,
        bool: true,
        nil: null,
        arr: [1, "two", { three: 3 }],
        nested: { a: { b: { c: "deep" } } },
      };
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json(mixed);
      expect(response.result).toEqual(mixed);
    });
  });

  // ─── c.error() ───

  describe("c.error()", () => {
    test("returns an error response", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32601, "Method not found");
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("includes data field when provided", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32602, "Invalid params", { field: "id" });
      expect(response.error.data).toEqual({ field: "id" });
    });

    test("uses request id in error response", () => {
      const ctx = createContext("ping", {}, "req-1");
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBe("req-1");
    });

    test("normalizes id to null for notification error", () => {
      const ctx = createContext("ping", {});
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBeNull();
    });

    test("error with data=null includes data field", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "Err", null);
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBeNull();
    });

    test("error without data omits data field", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "Err");
      expect("data" in response.error).toBe(false);
    });

    test("error with data=undefined omits data field", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "Err", undefined);
      expect("data" in response.error).toBe(false);
    });

    test("accepts zero as error code", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(0, "zero code");
      expect(response.error.code).toBe(0);
      expect(response.error.message).toBe("zero code");
    });

    test("accepts positive error code", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(1, "positive code");
      expect(response.error.code).toBe(1);
      expect(response.error.message).toBe("positive code");
    });

    test("response has exactly jsonrpc, error, and id fields when data is omitted", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "Err");
      expect(Object.keys(response).sort()).toEqual(["error", "id", "jsonrpc"]);
      expect(Object.keys(response.error).sort()).toEqual(["code", "message"]);
    });

    test("preserves id: 0 (falsy but present)", () => {
      const ctx = createContext("ping", {}, 0);
      const response = ctx.error(-32603, "Err");
      expect(response.id).toBe(0);
    });

    test('preserves id: "" (empty string, falsy but present)', () => {
      const ctx = createContext("ping", {}, "");
      const response = ctx.error(-32603, "Err");
      expect(response.id).toBe("");
    });

    test("does not contain result field", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32601, "Method not found");
      expect("result" in response).toBe(false);
    });

    test("uses negative id -1", () => {
      const ctx = createContext("ping", {}, -1);
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBe(-1);
    });

    test("uses negative id -999", () => {
      const ctx = createContext("ping", {}, -999);
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBe(-999);
    });

    test("uses Infinity as id", () => {
      const ctx = createContext("ping", {}, Infinity);
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBe(Infinity);
    });

    test("uses -Infinity as id", () => {
      const ctx = createContext("ping", {}, -Infinity);
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBe(-Infinity);
    });

    test("uses NaN as id", () => {
      const ctx = createContext("ping", {}, NaN);
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBeNaN();
    });

    test("accepts empty message string", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "");
      expect(response.error.code).toBe(-32603);
      expect(response.error.message).toBe("");
    });

    test("accepts message with newlines", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "line1\nline2\nline3");
      expect(response.error.message).toBe("line1\nline2\nline3");
    });

    test("accepts message with tabs", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "col1\tcol2\tcol3");
      expect(response.error.message).toBe("col1\tcol2\tcol3");
    });

    test("accepts message with quotes", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, 'He said "hello" and she said \'hi\'');
      expect(response.error.message).toBe(
        'He said "hello" and she said \'hi\'',
      );
    });

    test("accepts message with mixed special characters", () => {
      const ctx = createContext("ping", {}, 1);
      const msg = 'Error:\n\t"invalid\\path"';
      const response = ctx.error(-32603, msg);
      expect(response.error.message).toBe(msg);
    });

    test("accepts decimal error code", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(0.5, "decimal code");
      expect(response.error.code).toBe(0.5);
    });

    test("accepts MAX_SAFE_INTEGER as error code", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(Number.MAX_SAFE_INTEGER, "max code");
      expect(response.error.code).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("accepts MIN_SAFE_INTEGER as error code", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(Number.MIN_SAFE_INTEGER, "min code");
      expect(response.error.code).toBe(Number.MIN_SAFE_INTEGER);
    });
  });

  // ─── c.res reassignment ───

  describe("c.res", () => {
    test("can be assigned and read back", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.json("pong");
      ctx.res = response;
      expect(ctx.res).toBe(response);
    });

    test("can be reassigned multiple times", () => {
      const ctx = createContext("ping", {}, 1);
      const first = ctx.json("first");
      const second = ctx.json("second");
      const third = ctx.error(-32603, "Err");
      ctx.res = first;
      expect(ctx.res).toBe(first);
      ctx.res = second;
      expect(ctx.res).toBe(second);
      ctx.res = third;
      expect(ctx.res).toBe(third);
    });

    test("two contexts do not interfere with each other's c.res", () => {
      const ctx1 = createContext("method.a", {}, 1);
      const ctx2 = createContext("method.b", {}, 2);

      const res1 = ctx1.json("result-a");
      const res2 = ctx2.error(-32601, "Not found");

      ctx1.res = res1;
      ctx2.res = res2;

      // Each context retains its own response
      expect(ctx1.res).toBe(res1);
      expect(ctx2.res).toBe(res2);
      expect(ctx1.res).not.toBe(ctx2.res);

      // Reassigning one does not affect the other
      ctx1.res = ctx1.error(-32603, "Err");
      expect(ctx1.res).toEqual({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Err" },
        id: 1,
      });
      expect(ctx2.res).toBe(res2);
    });
  });

  // ─── Context immutability / independence ───

  describe("context independence", () => {
    test("mutating params on one context does not affect another", () => {
      const params1 = { id: "1" };
      const params2 = { id: "2" };
      const ctx1 = createContext("a", params1, 1);
      const ctx2 = createContext("b", params2, 2);

      // Mutate ctx1's params
      ctx1.req.params.id = "mutated";

      expect(ctx2.req.params.id).toBe("2");
    });

    test("c.json() uses each context's own id", () => {
      const ctx1 = createContext("a", {}, 1);
      const ctx2 = createContext("b", {}, 2);

      const res1 = ctx1.json("result-a");
      const res2 = ctx2.json("result-b");

      expect(res1.id).toBe(1);
      expect(res2.id).toBe(2);
      expect(res1.result).toBe("result-a");
      expect(res2.result).toBe("result-b");
    });

    test("c.error() uses each context's own id", () => {
      const ctx1 = createContext("a", {}, 10);
      const ctx2 = createContext("b", {}, 20);

      const err1 = ctx1.error(-32600, "err-a");
      const err2 = ctx2.error(-32601, "err-b");

      expect(err1.id).toBe(10);
      expect(err2.id).toBe(20);
      expect(err1.error.message).toBe("err-a");
      expect(err2.error.message).toBe("err-b");
    });

    test("contexts created from different requests have independent req objects", () => {
      const ctx1 = createContext("method.a", { key: "val1" }, 1);
      const ctx2 = createContext("method.b", { key: "val2" }, 2);

      expect(ctx1.req).not.toBe(ctx2.req);
      expect(ctx1.req.method).toBe("method.a");
      expect(ctx2.req.method).toBe("method.b");
      expect(ctx1.req.params).not.toBe(ctx2.req.params);
    });
  });

  // ─── Explicit undefined id ───

  describe("explicit undefined id", () => {
    test("c.req.id is undefined when undefined is passed explicitly", () => {
      const ctx = createContext("ping", {}, undefined);
      expect(ctx.req.id).toBeUndefined();
    });

    test("c.json() normalizes undefined id to null in response", () => {
      const ctx = createContext("ping", {}, undefined);
      const response = ctx.json("pong");
      expect(response.id).toBeNull();
    });

    test("c.error() normalizes undefined id to null in response", () => {
      const ctx = createContext("ping", {}, undefined);
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBeNull();
    });
  });

  // ─── c.json() does not auto-set c.res ───

  describe("c.json() does not auto-set c.res", () => {
    test("c.res remains undefined after calling c.json()", () => {
      const ctx = createContext("ping", {}, 1);
      ctx.json("pong");
      expect(ctx.res).toBeUndefined();
    });
  });

  // ─── c.json(undefined) runtime behavior ───

  describe("c.json(undefined) runtime behavior", () => {
    test("produces a response with result: undefined at runtime", () => {
      const ctx = createContext("ping", {}, 1);
      // @ts-expect-error - undefined is prohibited at the type level, testing runtime behavior
      const response = ctx.json(undefined);
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: undefined,
        id: 1,
      });
    });
  });

  // ─── createContext return value structure ───

  describe("createContext return value structure", () => {
    test("returned object has req, json, and error properties", () => {
      const ctx = createContext("ping", {}, 1);
      expect(ctx).toHaveProperty("req");
      expect(ctx).toHaveProperty("json");
      expect(ctx).toHaveProperty("error");
    });

    test("json and error are functions", () => {
      const ctx = createContext("ping", {}, 1);
      expect(typeof ctx.json).toBe("function");
      expect(typeof ctx.error).toBe("function");
    });

    test("res is writable", () => {
      const ctx = createContext("ping", {}, 1);
      const descriptor = Object.getOwnPropertyDescriptor(ctx, "res");
      expect(descriptor?.writable).toBe(true);
    });
  });

  // ─── c.error() does not auto-set c.res ───

  describe("c.error() does not auto-set c.res", () => {
    test("c.res remains undefined after calling c.error()", () => {
      const ctx = createContext("ping", {}, 1);
      ctx.error(-32601, "Method not found");
      expect(ctx.res).toBeUndefined();
    });
  });

  // ─── c.json(undefined) type-level prohibition ───

  describe("c.json(undefined) type-level prohibition", () => {
    test("@ts-expect-error confirms undefined is rejected at the type level", () => {
      const ctx = createContext("ping", {}, 1);
      // @ts-expect-error - undefined is prohibited by the type constraint T extends {} | null
      const response = ctx.json(undefined);
      // At runtime, the function still executes and produces result: undefined
      expect(response.jsonrpc).toBe("2.0");
      expect(response.result).toBeUndefined();
      expect(response.id).toBe(1);
    });
  });

  // ─── middleware連携パターンのcontext動作 ───

  describe("middleware integration pattern: c.res is not auto-set by c.json()/c.error()", () => {
    test("c.res remains undefined after c.json() — middleware must assign c.res explicitly", () => {
      const ctx = createContext("user.get", { id: "123" }, 1);

      // Simulating middleware calling next() where handler runs c.json()
      const handlerResponse = ctx.json({ id: "123", name: "Alice" });

      // c.res is NOT auto-set by c.json()
      expect(ctx.res).toBeUndefined();

      // Middleware or framework must explicitly assign c.res
      ctx.res = handlerResponse;
      expect(ctx.res).toBe(handlerResponse);
    });

    test("c.res remains undefined after c.error() — middleware must assign c.res explicitly", () => {
      const ctx = createContext("admin.delete", {}, 1);

      // Simulating middleware early-return with c.error()
      const errorResponse = ctx.error(-32000, "Authentication required");

      // c.res is NOT auto-set by c.error()
      expect(ctx.res).toBeUndefined();

      // Middleware must explicitly assign c.res
      ctx.res = errorResponse;
      expect(ctx.res).toBe(errorResponse);
    });

    test("middleware can replace c.res after handler execution", () => {
      const ctx = createContext("user.get", { id: "123" }, 1);

      // Handler produces a response
      const handlerResponse = ctx.json({ id: "123", name: "Alice" });
      ctx.res = handlerResponse;

      // Middleware replaces c.res after next()
      const overriddenResponse = ctx.json({ id: "123", name: "Alice", cached: true });
      ctx.res = overriddenResponse;

      expect(ctx.res).toBe(overriddenResponse);
      expect(ctx.res).not.toBe(handlerResponse);
    });

    test("middleware can replace success response with error response via c.res", () => {
      const ctx = createContext("user.get", { id: "123" }, 1);

      // Handler produces success
      const handlerResponse = ctx.json({ id: "123", name: "Alice" });
      ctx.res = handlerResponse;
      expect("result" in ctx.res).toBe(true);

      // Post-processing middleware replaces with error
      ctx.res = ctx.error(-32000, "Rate limited");
      expect("error" in ctx.res).toBe(true);
    });
  });

  // ─── c.req.raw is undefined for dispatch() direct call ───

  describe("c.req.raw is undefined for dispatch() direct call", () => {
    test("c.req.raw is undefined when raw parameter is omitted (dispatch scenario)", () => {
      // dispatch() calls createContext without raw parameter
      const ctx = createContext("ping", {}, 1);
      expect(ctx.req.raw).toBeUndefined();
    });

    test("c.req.raw is undefined when raw parameter is explicitly undefined", () => {
      const ctx = createContext("ping", {}, 1, undefined);
      expect(ctx.req.raw).toBeUndefined();
    });

    test("c.req.raw is defined when raw MessageEvent is provided (serve scenario)", () => {
      const raw = new MessageEvent("message", { data: {} });
      const ctx = createContext("ping", {}, 1, raw);
      expect(ctx.req.raw).toBe(raw);
      expect(ctx.req.raw).toBeInstanceOf(MessageEvent);
    });
  });

  // ─── id edge cases: NaN, Infinity ───

  describe("id edge cases: NaN and Infinity normalization", () => {
    test("c.json() preserves NaN id as-is (no normalization to null)", () => {
      const ctx = createContext("ping", {}, NaN);
      const response = ctx.json("pong");
      expect(response.id).toBeNaN();
      // NaN is not normalized — it is a number, so responseId = reqId (NaN)
    });

    test("c.error() preserves NaN id as-is (no normalization to null)", () => {
      const ctx = createContext("ping", {}, NaN);
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBeNaN();
    });

    test("c.json() preserves Infinity id as-is", () => {
      const ctx = createContext("ping", {}, Infinity);
      const response = ctx.json("pong");
      expect(response.id).toBe(Infinity);
    });

    test("c.error() preserves Infinity id as-is", () => {
      const ctx = createContext("ping", {}, Infinity);
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBe(Infinity);
    });

    test("c.json() preserves -Infinity id as-is", () => {
      const ctx = createContext("ping", {}, -Infinity);
      const response = ctx.json("pong");
      expect(response.id).toBe(-Infinity);
    });

    test("c.error() preserves -Infinity id as-is", () => {
      const ctx = createContext("ping", {}, -Infinity);
      const response = ctx.error(-32603, "Internal error");
      expect(response.id).toBe(-Infinity);
    });

    test("NaN id: c.req.id is NaN", () => {
      const ctx = createContext("ping", {}, NaN);
      expect(ctx.req.id).toBeNaN();
    });

    test("Infinity id: c.req.id is Infinity", () => {
      const ctx = createContext("ping", {}, Infinity);
      expect(ctx.req.id).toBe(Infinity);
    });

    test("NaN id is not normalized to null (NaN !== undefined)", () => {
      const ctx = createContext("ping", {}, NaN);
      // responseId logic: reqId !== undefined → true (NaN !== undefined is true)
      // So responseId = NaN, not null
      const response = ctx.json("pong");
      expect(response.id).not.toBeNull();
      expect(response.id).toBeNaN();
    });

    test("NaN and Infinity ids produce independent responses in json() and error()", () => {
      const ctxNaN = createContext("a", {}, NaN);
      const ctxInf = createContext("b", {}, Infinity);

      const jsonNaN = ctxNaN.json("result");
      const jsonInf = ctxInf.json("result");
      const errorNaN = ctxNaN.error(-32603, "Err");
      const errorInf = ctxInf.error(-32603, "Err");

      expect(jsonNaN.id).toBeNaN();
      expect(jsonInf.id).toBe(Infinity);
      expect(errorNaN.id).toBeNaN();
      expect(errorInf.id).toBe(Infinity);
    });
  });

  // ─── c.error() with complex data types ───

  describe("c.error() with complex data types", () => {
    test("preserves array as data", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32000, "err", [1, 2, 3]);
      expect(response.error.data).toEqual([1, 2, 3]);
    });

    test("preserves deeply nested object as data", () => {
      const ctx = createContext("ping", {}, 1);
      const deepData = {
        level1: {
          level2: {
            level3: {
              value: "deep",
              items: [{ id: 1 }, { id: 2 }],
            },
          },
        },
      };
      const response = ctx.error(-32000, "err", deepData);
      expect(response.error.data).toEqual(deepData);
    });

    test("preserves mixed array with nested objects as data", () => {
      const ctx = createContext("ping", {}, 1);
      const mixedData = [1, "two", { three: { nested: true } }, [4, 5]];
      const response = ctx.error(-32000, "err", mixedData);
      expect(response.error.data).toEqual(mixedData);
    });

    test("includes data field when data is 0 (falsy primitive)", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "err", 0);
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBe(0);
    });

    test("includes data field when data is false (falsy primitive)", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "err", false);
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBe(false);
    });

    test("includes data field when data is empty string (falsy primitive)", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "err", "");
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBe("");
    });

    test("includes data field when data is a string", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "err", "additional info");
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBe("additional info");
    });

    test("includes data field when data is NaN", () => {
      const ctx = createContext("ping", {}, 1);
      const response = ctx.error(-32603, "err", NaN);
      expect("data" in response.error).toBe(true);
      expect(response.error.data).toBeNaN();
    });
  });

  // ─── c.json() type-level rejection with no arguments ───

  describe("c.json() with no arguments type-level rejection", () => {
    test("@ts-expect-error confirms c.json() with zero arguments is rejected at the type level", () => {
      const ctx = createContext("ping", {}, 1);
      // @ts-expect-error - c.json() requires at least one argument
      const response = ctx.json();
      // At runtime, data parameter is undefined, producing result: undefined
      expect(response.jsonrpc).toBe("2.0");
      expect(response.result).toBeUndefined();
      expect(response.id).toBe(1);
    });
  });
});
