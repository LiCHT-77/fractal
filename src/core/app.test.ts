import { makeNotification, makeRequest } from "../test-helpers.ts";
import { Fractal } from "./app.ts";

describe("core/app (Fractal class)", () => {
  // ─── Constructor & builder pattern ───

  describe("builder pattern", () => {
    test("new Fractal() creates an instance", () => {
      const app = new Fractal();
      expect(app).toBeInstanceOf(Fractal);
    });

    test(".method() returns a Fractal instance (builder pattern)", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      expect(app).toBeInstanceOf(Fractal);
    });

    test(".use() returns a Fractal instance (builder pattern)", () => {
      const app = new Fractal().use(async (_c, next) => {
        await next();
      });
      expect(app).toBeInstanceOf(Fractal);
    });

    test("chained .method() calls share the route registry", () => {
      const app = new Fractal()
        .method("a", (c) => c.json(1))
        .method("b", (c) => c.json(2));

      // Both methods should be callable via dispatch
      expect(app.dispatch(makeRequest("a", {}, 1))).resolves.toMatchObject({
        result: 1,
      });
      expect(app.dispatch(makeRequest("b", {}, 2))).resolves.toMatchObject({
        result: 2,
      });
    });
  });

  // ─── Method name validation ───

  describe("method name validation", () => {
    test("rejects empty method name", () => {
      const app = new Fractal();
      expect(() => app.method("", (c) => c.json("ok"))).toThrow();
    });

    test("rejects leading dot", () => {
      const app = new Fractal();
      expect(() => app.method(".user", (c) => c.json("ok"))).toThrow();
    });

    test("rejects trailing dot", () => {
      const app = new Fractal();
      expect(() => app.method("user.", (c) => c.json("ok"))).toThrow();
    });

    test("rejects consecutive dots", () => {
      const app = new Fractal();
      expect(() => app.method("user..get", (c) => c.json("ok"))).toThrow();
    });

    test("rejects rpc. prefix", () => {
      const app = new Fractal();
      expect(() => app.method("rpc.discover", (c) => c.json("ok"))).toThrow();
    });

    test('method name "*" is allowed (spec says avoid, not prohibit)', () => {
      const app = new Fractal();
      expect(() => app.method("*", (c) => c.json("ok"))).not.toThrow();
    });

    test('method name "**" is allowed (spec says avoid, not prohibit)', () => {
      const app = new Fractal();
      expect(() => app.method("**", (c) => c.json("ok"))).not.toThrow();
    });
  });

  // ─── Duplicate method registration ───

  describe("duplicate method registration", () => {
    test("throws on duplicate method name", () => {
      const app = new Fractal();
      app.method("ping", (c) => c.json("pong"));
      expect(() => app.method("ping", (c) => c.json("pong2"))).toThrow(
        /already registered/,
      );
    });

    test('throws with exact message: Method "<name>" is already registered', () => {
      const app = new Fractal();
      app.method("ping", (c) => c.json("pong"));
      expect(() => app.method("ping", (c) => c.json("pong2"))).toThrow(
        'Method "ping" is already registered',
      );
    });

    test("exact duplicate error message includes the method name for namespaced methods", () => {
      const app = new Fractal();
      app.method("user.get", (c) => c.json("ok"));
      expect(() => app.method("user.get", (c) => c.json("ok2"))).toThrow(
        'Method "user.get" is already registered',
      );
    });
  });

  // ─── Namespace conflict detection ───

  describe("namespace conflict detection", () => {
    test("throws when leaf conflicts with namespace", () => {
      const app = new Fractal();
      app.method("user.get", (c) => c.json("ok"));
      expect(() => app.method("user", (c) => c.json("ok"))).toThrow(
        /conflicts/,
      );
    });

    test("throws when namespace extends existing leaf", () => {
      const app = new Fractal();
      app.method("user", (c) => c.json("ok"));
      expect(() => app.method("user.get", (c) => c.json("ok"))).toThrow(
        /conflicts/,
      );
    });

    test('exact conflict message: Method "user.get" conflicts with existing method "user"', () => {
      const app = new Fractal();
      app.method("user", (c) => c.json("ok"));
      expect(() => app.method("user.get", (c) => c.json("ok"))).toThrow(
        'Method "user.get" conflicts with existing method "user"',
      );
    });

    test('exact conflict message (reverse): Method "user" conflicts with existing method "user.get"', () => {
      const app = new Fractal();
      app.method("user.get", (c) => c.json("ok"));
      expect(() => app.method("user", (c) => c.json("ok"))).toThrow(
        'Method "user" conflicts with existing method "user.get"',
      );
    });
  });

  // ─── Reserved name detection ───

  describe("reserved name detection", () => {
    test("rejects '$notify'", () => {
      const app = new Fractal();
      expect(() => app.method("$notify", (c) => c.json("ok"))).toThrow(
        /reserved/,
      );
    });

    test("rejects 'dispose'", () => {
      const app = new Fractal();
      expect(() => app.method("dispose", (c) => c.json("ok"))).toThrow(
        /reserved/,
      );
    });

    test("rejects 'then'", () => {
      const app = new Fractal();
      expect(() => app.method("then", (c) => c.json("ok"))).toThrow(/reserved/);
    });

    test("rejects 'then.check'", () => {
      const app = new Fractal();
      expect(() => app.method("then.check", (c) => c.json("ok"))).toThrow(
        /reserved/,
      );
    });

    test('exact reserved message: Method "then" conflicts with reserved client property "then"', () => {
      const app = new Fractal();
      expect(() => app.method("then", (c) => c.json("ok"))).toThrow(
        'Method "then" conflicts with reserved client property "then"',
      );
    });

    test('exact reserved message for dotted form: Method "then.check" conflicts with reserved client property "then"', () => {
      const app = new Fractal();
      expect(() => app.method("then.check", (c) => c.json("ok"))).toThrow(
        'Method "then.check" conflicts with reserved client property "then"',
      );
    });

    test('exact reserved message for $notify: Method "$notify" conflicts with reserved client property "$notify"', () => {
      const app = new Fractal();
      expect(() => app.method("$notify", (c) => c.json("ok"))).toThrow(
        'Method "$notify" conflicts with reserved client property "$notify"',
      );
    });

    test('exact reserved message for dispose: Method "dispose" conflicts with reserved client property "dispose"', () => {
      const app = new Fractal();
      expect(() => app.method("dispose", (c) => c.json("ok"))).toThrow(
        'Method "dispose" conflicts with reserved client property "dispose"',
      );
    });
  });

  // ─── dispatch: basic ───

  describe("dispatch", () => {
    test("dispatches to registered handler and returns success response", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: "pong",
        id: 1,
      });
    });

    test("passes params to handler via context", async () => {
      const app = new Fractal().method("echo", (c) => c.json(c.req.params));
      const response = await app.dispatch(
        makeRequest("echo", { hello: "world" }, 1),
      );
      expect(response).toMatchObject({ result: { hello: "world" } });
    });

    test("returns Method not found for unknown method", async () => {
      const app = new Fractal();
      const response = await app.dispatch(makeRequest("unknown", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("handler can return c.error()", async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32000, "Custom error", { detail: "test" }),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toMatchObject({
        error: {
          code: -32000,
          message: "Custom error",
          data: { detail: "test" },
        },
      });
    });

    test("async handler is supported", async () => {
      const app = new Fractal().method("async", async (c) => {
        await Promise.resolve();
        return c.json("async-result");
      });
      const response = await app.dispatch(makeRequest("async", {}, 1));
      expect(response).toMatchObject({ result: "async-result" });
    });

    test("non-ASCII method names (Japanese characters, hyphens) work through dispatch", async () => {
      const app = new Fractal()
        .method("ユーザー.取得", (c) => c.json("found"))
        .method("my-service.health-check", (c) => c.json("healthy"));

      const response1 = await app.dispatch(makeRequest("ユーザー.取得", {}, 1));
      expect(response1).toMatchObject({ result: "found", id: 1 });

      const response2 = await app.dispatch(
        makeRequest("my-service.health-check", {}, 2),
      );
      expect(response2).toMatchObject({ result: "healthy", id: 2 });
    });

    test("c.req.raw is undefined via dispatch()", async () => {
      let capturedRaw: unknown = "not-checked";
      const app = new Fractal().method("ping", (c) => {
        capturedRaw = c.req.raw;
        return c.json("pong");
      });
      await app.dispatch(makeRequest("ping", {}, 1));
      expect(capturedRaw).toBeUndefined();
    });
  });

  // ─── dispatch: concurrent ───

  describe("concurrent dispatch", () => {
    test("multiple concurrent dispatch calls execute independently", async () => {
      const app = new Fractal().method("slow", async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return c.json(c.req.params.value);
      });

      const [r1, r2, r3] = await Promise.all([
        app.dispatch(makeRequest("slow", { value: "a" }, 1)),
        app.dispatch(makeRequest("slow", { value: "b" }, 2)),
        app.dispatch(makeRequest("slow", { value: "c" }, 3)),
      ]);

      expect(r1).toMatchObject({ result: "a", id: 1 });
      expect(r2).toMatchObject({ result: "b", id: 2 });
      expect(r3).toMatchObject({ result: "c", id: 3 });
    });
  });

  // ─── dispatch: params normalization & validation ───

  describe("dispatch params handling", () => {
    test("normalizes undefined params to {}", async () => {
      const app = new Fractal().method("ping", (c) => c.json(c.req.params));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        id: 1,
      });
      expect(response).toMatchObject({ result: {} });
    });

    test("normalizes missing params to {}", async () => {
      const app = new Fractal().method("ping", (c) => c.json(c.req.params));
      const response = await app.dispatch(makeRequest("ping", undefined, 1));
      expect(response).toMatchObject({ result: {} });
    });

    test("rejects array params with Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2, 3] as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32600, message: "Invalid Request" },
      });
    });

    test("rejects null params with Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: null as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32600 },
      });
    });

    test("rejects primitive params with Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: "string" as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32600 },
      });
    });

    test("invalid array params triggers console.error", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2, 3] as any,
        id: 1,
      });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── dispatch: notifications ───

  describe("dispatch notifications", () => {
    test("returns void for notification", async () => {
      const handler = vi.fn((c: any) => c.json("pong"));
      const app = new Fractal().method("ping", handler);
      const result = await app.dispatch(makeNotification("ping"));
      expect(result).toBeUndefined();
      expect(handler).toHaveBeenCalled();
    });

    test("handler is still executed for notification", async () => {
      const spy = vi.fn();
      const app = new Fractal().method("log", (c) => {
        spy(c.req.params);
        return c.json("ok");
      });
      await app.dispatch(makeNotification("log", { message: "hello" }));
      expect(spy).toHaveBeenCalledWith({ message: "hello" });
    });

    test("returns void for notification to unknown method", async () => {
      const app = new Fractal();
      const result = await app.dispatch(makeNotification("unknown"));
      expect(result).toBeUndefined();
    });

    test("notification handler receives c.req.id as undefined", async () => {
      let capturedId: unknown = "not-checked";
      const app = new Fractal().method("log", (c) => {
        capturedId = c.req.id;
        return c.json("ok");
      });
      const result = await app.dispatch(
        makeNotification("log", { msg: "hello" }),
      );
      expect(result).toBeUndefined();
      expect(capturedId).toBeUndefined();
    });

    test("handler throwing during notification outputs error to console.error", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("boom", () => {
        throw new Error("notification failure");
      });
      const result = await app.dispatch(makeNotification("boom"));
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("returns void for notification with invalid params", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const result = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2] as any,
      });
      expect(result).toBeUndefined();
    });

    test("notification with invalid array params returns void and logs to console.error", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const result = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2, 3] as any,
      });
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("middleware throwing during notification returns void and logs to console.error", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal()
        .use(async (_c, _next) => {
          throw new Error("middleware notification failure");
        })
        .method("ping", (c) => c.json("pong"));

      const result = await app.dispatch(makeNotification("ping"));
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── dispatch: error handling ───

  describe("dispatch error handling", () => {
    test("handler throwing Error returns Internal error", async () => {
      const app = new Fractal().method("boom", () => {
        throw new Error("something broke");
      });
      const response = await app.dispatch(makeRequest("boom", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "something broke" },
        id: 1,
      });
    });

    test("handler throwing non-Error returns generic Internal error message", async () => {
      const app = new Fractal().method("boom", () => {
        throw "string error";
      });
      const response = await app.dispatch(makeRequest("boom", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "Internal error" },
      });
    });

    test("handler throwing null returns generic Internal error message", async () => {
      const app = new Fractal().method("boom", () => {
        throw null;
      });
      const response = await app.dispatch(makeRequest("boom", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "Internal error" },
      });
    });

    test("handler returning undefined results in Internal error", async () => {
      const app = new Fractal().method("bad", (() => {}) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
      });
    });

    test("error response does not include stack trace in data", async () => {
      const app = new Fractal().method("boom", () => {
        throw new Error("something broke");
      });
      const response = await app.dispatch(makeRequest("boom", {}, 1));
      const data = (response as any)?.error?.data;
      if (data !== undefined) {
        expect(String(data)).not.toContain("at ");
      }
    });
  });

  // ─── dispatch with middleware ───

  describe("dispatch with middleware", () => {
    test("global middleware runs for all methods", async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use(async (_c, next) => {
          spy();
          await next();
        })
        .method("a", (c) => c.json("a"))
        .method("b", (c) => c.json("b"));

      await app.dispatch(makeRequest("a", {}, 1));
      await app.dispatch(makeRequest("b", {}, 2));
      expect(spy).toHaveBeenCalledTimes(2);
    });

    test('.use("*", middleware) matches single-segment methods only', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*", async (_c, next) => {
          spy();
          await next();
        })
        .method("ping", (c) => c.json("pong"))
        .method("user.get", (c) => c.json("user"));

      await app.dispatch(makeRequest("ping", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("user.get", {}, 2));
      expect(spy).toHaveBeenCalledTimes(1); // not called for multi-segment
    });

    test('.use("**", middleware) matches all methods (equivalent to global)', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("**", async (_c, next) => {
          spy();
          await next();
        })
        .method("ping", (c) => c.json("pong"))
        .method("user.get", (c) => c.json("user"))
        .method("admin.user.delete", (c) => c.json("deleted"));

      await app.dispatch(makeRequest("ping", {}, 1));
      await app.dispatch(makeRequest("user.get", {}, 2));
      await app.dispatch(makeRequest("admin.user.delete", {}, 3));
      expect(spy).toHaveBeenCalledTimes(3);
    });

    test('.use("admin.*", middleware) matches admin.X but not admin.X.Y', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("admin.*", async (_c, next) => {
          spy();
          await next();
        })
        .method("admin.delete", (c) => c.json("deleted"))
        .method("admin.user.delete", (c) => c.json("deep-deleted"));

      await app.dispatch(makeRequest("admin.delete", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("admin.user.delete", {}, 2));
      expect(spy).toHaveBeenCalledTimes(1); // not called for admin.user.delete
    });

    test('.use("admin.**", middleware) matches admin.X and admin.X.Y', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("admin.**", async (_c, next) => {
          spy();
          await next();
        })
        .method("admin.delete", (c) => c.json("deleted"))
        .method("admin.user.delete", (c) => c.json("deep-deleted"));

      await app.dispatch(makeRequest("admin.delete", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("admin.user.delete", {}, 2));
      expect(spy).toHaveBeenCalledTimes(2);
    });

    test('.use("*.get", middleware) matches X.get but not X.Y.get', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*.get", async (_c, next) => {
          spy();
          await next();
        })
        .method("user.get", (c) => c.json("user"))
        .method("user.detail.get", (c) => c.json("detail"));

      await app.dispatch(makeRequest("user.get", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("user.detail.get", {}, 2));
      expect(spy).toHaveBeenCalledTimes(1); // not called for user.detail.get
    });

    test('.use("**.get", middleware) matches X.get and X.Y.get', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("**.get", async (_c, next) => {
          spy();
          await next();
        })
        .method("user.get", (c) => c.json("user"))
        .method("user.detail.get", (c) => c.json("detail"));

      await app.dispatch(makeRequest("user.get", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("user.detail.get", {}, 2));
      expect(spy).toHaveBeenCalledTimes(2);
    });

    test('.use("*.*", middleware) matches two-segment methods but not single or three-segment', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*.*", async (_c, next) => {
          spy();
          await next();
        })
        .method("ping", (c) => c.json("pong"))
        .method("user.get", (c) => c.json("user"))
        .method("item.delete", (c) => c.json("deleted"))
        .method("admin.user.delete", (c) => c.json("deep-deleted"));

      await app.dispatch(makeRequest("user.get", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("item.delete", {}, 2));
      expect(spy).toHaveBeenCalledTimes(2);

      await app.dispatch(makeRequest("ping", {}, 3));
      expect(spy).toHaveBeenCalledTimes(2); // not called for single-segment

      await app.dispatch(makeRequest("admin.user.delete", {}, 4));
      expect(spy).toHaveBeenCalledTimes(2); // not called for three-segment
    });

    test('.use("**.*", middleware) matches multi-segment methods but not single-segment', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("**.*", async (_c, next) => {
          spy();
          await next();
        })
        .method("ping", (c) => c.json("pong"))
        .method("user.get", (c) => c.json("user"))
        .method("admin.user.delete", (c) => c.json("deep-deleted"));

      await app.dispatch(makeRequest("user.get", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("admin.user.delete", {}, 2));
      expect(spy).toHaveBeenCalledTimes(2);

      await app.dispatch(makeRequest("ping", {}, 3));
      expect(spy).toHaveBeenCalledTimes(2); // not called for single-segment
    });

    test('.use("*.*.*", middleware) matches exactly 3-segment methods', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*.*.*", async (_c, next) => {
          spy();
          await next();
        })
        .method("x.y.z", (c) => c.json("three"))
        .method("p.q", (c) => c.json("two"))
        .method("w.x.y.z", (c) => c.json("four"));

      await app.dispatch(makeRequest("x.y.z", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("p.q", {}, 2));
      expect(spy).toHaveBeenCalledTimes(1); // not called for two-segment

      await app.dispatch(makeRequest("w.x.y.z", {}, 3));
      expect(spy).toHaveBeenCalledTimes(1); // not called for four-segment
    });

    test('.use("**.*.get", middleware) matches multi-segment methods ending in .get with at least 2 segments before', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("**.*.get", async (_c, next) => {
          spy();
          await next();
        })
        .method("a.b.get", (c) => c.json("ok"))
        .method("a.b.c.get", (c) => c.json("ok"));

      await app.dispatch(makeRequest("a.b.get", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("a.b.c.get", {}, 2));
      expect(spy).toHaveBeenCalledTimes(2);
    });

    test("scoped middleware runs only for matching methods", async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("admin.*", async (_c, next) => {
          spy();
          await next();
        })
        .method("admin.delete", (c) => c.json("deleted"))
        .method("user.get", (c) => c.json("user"));

      await app.dispatch(makeRequest("admin.delete", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      await app.dispatch(makeRequest("user.get", {}, 2));
      expect(spy).toHaveBeenCalledTimes(1); // not called again
    });

    test("middleware can short-circuit request", async () => {
      const handler = vi.fn((c: any) => c.json("should not reach"));
      const app = new Fractal()
        .use((_c, _next) => ({
          jsonrpc: "2.0" as const,
          error: { code: -32000, message: "Auth required" },
          id: 1,
        }))
        .method("secret", handler);

      const response = await app.dispatch(makeRequest("secret", {}, 1));
      expect(handler).not.toHaveBeenCalled();
      expect(response).toMatchObject({ error: { code: -32000 } });
    });

    test("middleware has access to c.req.method", async () => {
      let capturedMethod: string | undefined;
      const app = new Fractal()
        .use(async (c, next) => {
          capturedMethod = c.req.method;
          await next();
        })
        .method("ping", (c) => c.json("pong"));

      await app.dispatch(makeRequest("ping", {}, 1));
      expect(capturedMethod).toBe("ping");
    });

    test("multiple middleware execute in registration order", async () => {
      const order: number[] = [];
      const app = new Fractal()
        .use(async (_c, next) => {
          order.push(1);
          await next();
        })
        .use(async (_c, next) => {
          order.push(2);
          await next();
        })
        .use(async (_c, next) => {
          order.push(3);
          await next();
        })
        .method("ping", (c) => c.json("pong"));

      await app.dispatch(makeRequest("ping", {}, 1));
      expect(order).toEqual([1, 2, 3]);
    });

    test("async middleware throwing returns -32603", async () => {
      const app = new Fractal()
        .use(async (_c, _next) => {
          throw new Error("middleware failure");
        })
        .method("ping", (c) => c.json("pong"));

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toMatchObject({ error: { code: -32603 } });
    });

    test("calling next() twice in middleware throws 'next() called multiple times'", async () => {
      const app = new Fractal()
        .use(async (_c, next) => {
          await next();
          await next();
        })
        .method("ping", (c) => c.json("pong"));

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "next() called multiple times" },
        id: 1,
      });
    });

    test("middleware returning void without calling next() results in -32603", async () => {
      const app = new Fractal()
        .use((_c, _next) => {
          // does nothing: no next(), no return, no c.res assignment
        })
        .method("ping", (c) => c.json("pong"));

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "Internal error" },
        id: 1,
      });
    });
  });

  // ─── .use() pattern validation at app level ───

  describe(".use() pattern validation", () => {
    test("rejects empty pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use("", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects leading dot in pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use(".admin", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects trailing dot in pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use("admin.", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects consecutive dots in pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use("admin..get", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects rpc. prefix in pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use("rpc.discover", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects reserved name '$notify' in pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use("$notify", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects reserved name 'dispose' in pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use("dispose", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects reserved name 'then' in pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use("then", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects 'then.check' pattern (reserved first segment)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("then.check", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });
  });

  // ─── Notification id edge cases ───

  describe("notification edge cases", () => {
    test("id: 0 is treated as request, not notification", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch(makeRequest("ping", {}, 0));
      expect(response).toMatchObject({ result: "pong", id: 0 });
    });

    test('id: "" is treated as request, not notification', async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch(makeRequest("ping", {}, ""));
      expect(response).toMatchObject({ result: "pong", id: "" });
    });

    test("id: null is treated as request, not notification", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch(makeRequest("ping", {}, null));
      expect(response).toMatchObject({ result: "pong", id: null });
    });

    test("id: undefined is treated as request, not notification", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      // Construct directly so "id" key is present with value undefined
      // ("id" in request is true for { id: undefined })
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        id: undefined,
      });
      expect(response).toBeDefined();
      expect(response).toMatchObject({ result: "pong" });
    });
  });

  // ─── Namespace conflict edge cases ───

  describe("namespace conflict edge cases", () => {
    test('"user" vs "username" should NOT conflict (dot-boundary only)', () => {
      const app = new Fractal();
      app.method("user", (c) => c.json("ok"));
      expect(() => app.method("username", (c) => c.json("ok"))).not.toThrow();
    });

    test('"admin.delete" vs "admin.deleteUser" should NOT conflict', () => {
      const app = new Fractal();
      app.method("admin.delete", (c) => c.json("ok"));
      expect(() =>
        app.method("admin.deleteUser", (c) => c.json("ok")),
      ).not.toThrow();
    });

    test('"a.b.c" vs "a.b.c.d" SHOULD conflict (deep namespace)', () => {
      const app = new Fractal();
      app.method("a.b.c", (c) => c.json("ok"));
      expect(() => app.method("a.b.c.d", (c) => c.json("ok"))).toThrow(
        /conflicts/,
      );
    });

    test('"a.b.c.d" registered first, then "a.b.c" SHOULD conflict (reverse direction)', () => {
      const app = new Fractal();
      app.method("a.b.c.d", (c) => c.json("ok"));
      expect(() => app.method("a.b.c", (c) => c.json("ok"))).toThrow(
        /conflicts/,
      );
    });

    test('"user.profile.get", "user.profile.set", and "user.account.get" should all coexist', () => {
      const app = new Fractal();
      app.method("user.profile.get", (c) => c.json("ok"));
      app.method("user.profile.set", (c) => c.json("ok"));
      expect(() =>
        app.method("user.account.get", (c) => c.json("ok")),
      ).not.toThrow();
    });

    test('"admin.get" vs "admin.getUser" should NOT conflict (non-dot-boundary partial match in namespace)', () => {
      const app = new Fractal();
      app.method("admin.get", (c) => c.json("ok"));
      expect(() =>
        app.method("admin.getUser", (c) => c.json("ok")),
      ).not.toThrow();
    });
  });

  // ─── Middleware c.res replacement after next() ───

  describe("middleware c.res replacement after next()", () => {
    test("middleware reads c.res after next() - contains handler's response", async () => {
      let capturedRes: unknown;
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          capturedRes = c.res;
        })
        .method("ping", (c) => c.json("pong"));

      await app.dispatch(makeRequest("ping", {}, 1));
      expect(capturedRes).toMatchObject({ result: "pong" });
    });

    test("middleware replaces c.res after next() - replaced response is returned", async () => {
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          c.res = c.json("replaced");
        })
        .method("ping", (c) => c.json("original"));

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toMatchObject({ result: "replaced", id: 1 });
    });

    test("multiple middleware modify c.res in sequence (onion model - reverse order)", async () => {
      const order: string[] = [];
      const app = new Fractal()
        .use(async (c, next) => {
          order.push("outer-before");
          await next();
          order.push("outer-after");
          c.res = c.json("outer");
        })
        .use(async (c, next) => {
          order.push("inner-before");
          await next();
          order.push("inner-after");
          c.res = c.json("inner");
        })
        .method("ping", (c) => {
          order.push("handler");
          return c.json("handler");
        });

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(order).toEqual([
        "outer-before",
        "inner-before",
        "handler",
        "inner-after",
        "outer-after",
      ]);
      // Outer middleware runs last in the after-phase, so its replacement wins
      expect(response).toMatchObject({ result: "outer", id: 1 });
    });
  });

  // ─── Middleware exception handling patterns ───

  describe("middleware exception handling patterns", () => {
    test("middleware catches exception from handler via try/catch on next(), returns c.error()", async () => {
      const app = new Fractal()
        .use(async (c, next) => {
          try {
            await next();
          } catch (e) {
            return c.error(-32000, "Caught: " + (e as Error).message);
          }
        })
        .method("boom", () => {
          throw new Error("handler exploded");
        });

      const response = await app.dispatch(makeRequest("boom", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32000, message: "Caught: handler exploded" },
        id: 1,
      });
    });

    test("middleware catches exception and sets c.res instead of returning", async () => {
      const app = new Fractal()
        .use(async (c, next) => {
          try {
            await next();
          } catch (e) {
            c.res = c.error(-32000, "Handled: " + (e as Error).message);
          }
        })
        .method("boom", () => {
          throw new Error("handler exploded");
        });

      const response = await app.dispatch(makeRequest("boom", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32000, message: "Handled: handler exploded" },
        id: 1,
      });
    });

    test("middleware catches exception but does NOT set c.res or return response → should get -32603", async () => {
      const app = new Fractal()
        .use(async (_c, next) => {
          try {
            await next();
          } catch {
            // swallow the error but do not set c.res or return a response
          }
        })
        .method("boom", () => {
          throw new Error("handler exploded");
        });

      const response = await app.dispatch(makeRequest("boom", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "Internal error" },
        id: 1,
      });
    });
  });

  // ─── Handler return value edge cases ───

  describe("handler return value edge cases", () => {
    test("handler returns null (not c.json/c.error) → -32603", async () => {
      const app = new Fractal().method("bad", (() => null) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler returns a plain object (not JsonRpcResponse) → -32603", async () => {
      const app = new Fractal().method("bad", (() => ({ foo: "bar" })) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });
  });

  // ─── Error response format details ───

  describe("error response format details", () => {
    test('c.error() without data → error object should NOT have "data" key', async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32000, "No data"),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32000, message: "No data" },
      });
      expect("data" in (response as any).error).toBe(false);
    });

    test('c.error() with data: null → error object SHOULD have "data": null', async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32000, "With null data", null),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32000, message: "With null data", data: null },
      });
      expect("data" in (response as any).error).toBe(true);
      expect((response as any).error.data).toBeNull();
    });

    test("c.error() with complex data object", async () => {
      const complexData = {
        details: [{ field: "email", reason: "invalid" }],
        timestamp: 1234567890,
        nested: { a: { b: "c" } },
      };
      const app = new Fractal().method("fail", (c) =>
        c.error(-32602, "Validation failed", complexData),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toMatchObject({
        error: {
          code: -32602,
          message: "Validation failed",
          data: complexData,
        },
      });
    });
  });

  // ─── Handler returning invalid values ───

  describe("handler returning invalid values", () => {
    test("handler returns object missing jsonrpc field → -32603", async () => {
      const app = new Fractal().method("bad", (() => ({
        result: "ok",
      })) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler returns a number → -32603", async () => {
      const app = new Fractal().method("bad", (() => 42) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler returns a string → -32603", async () => {
      const app = new Fractal().method("bad", (() => "hello") as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler returns a boolean → -32603", async () => {
      const app = new Fractal().method("bad", (() => true) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler returns an array → -32603", async () => {
      const app = new Fractal().method("bad", (() => [1, 2, 3]) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler returns object with result but missing jsonrpc preserves error id", async () => {
      const app = new Fractal().method("bad", (() => ({
        result: "ok",
      })) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 42));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 42,
      });
    });

    test("handler returns invalid value as notification → void", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("bad", (() => ({
        result: "ok",
      })) as any);
      const result = await app.dispatch(makeNotification("bad"));
      expect(result).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  // ─── method field type checking via dispatch ───

  describe("dispatch with non-string method field", () => {
    test("method as number → Method not found", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: 123 as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("method as null → Method not found", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: null as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("method as boolean → Method not found", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: true as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("method as array → Method not found", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: ["ping"] as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("method as object → Method not found", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: { name: "ping" } as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });
  });

  // ─── Concurrent dispatch: complex scenarios ───

  describe("concurrent dispatch: complex scenarios", () => {
    test("concurrent dispatches to different handlers with varying delays", async () => {
      const order: string[] = [];
      const app = new Fractal()
        .method("fast", async (c) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          order.push("fast");
          return c.json("fast-result");
        })
        .method("medium", async (c) => {
          await new Promise((resolve) => setTimeout(resolve, 15));
          order.push("medium");
          return c.json("medium-result");
        })
        .method("slow", async (c) => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          order.push("slow");
          return c.json("slow-result");
        });

      const [rSlow, rMedium, rFast] = await Promise.all([
        app.dispatch(makeRequest("slow", {}, 1)),
        app.dispatch(makeRequest("medium", {}, 2)),
        app.dispatch(makeRequest("fast", {}, 3)),
      ]);

      expect(rFast).toMatchObject({ result: "fast-result", id: 3 });
      expect(rMedium).toMatchObject({ result: "medium-result", id: 2 });
      expect(rSlow).toMatchObject({ result: "slow-result", id: 1 });
      // Fast completes first, then medium, then slow
      expect(order).toEqual(["fast", "medium", "slow"]);
    });

    test("concurrent dispatches do not share context state", async () => {
      const contexts: any[] = [];
      const app = new Fractal().method("capture", async (c) => {
        contexts.push(c);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return c.json(c.req.params.value);
      });

      await Promise.all([
        app.dispatch(makeRequest("capture", { value: "a" }, 1)),
        app.dispatch(makeRequest("capture", { value: "b" }, 2)),
      ]);

      expect(contexts).toHaveLength(2);
      expect(contexts[0].req.params.value).toBe("a");
      expect(contexts[1].req.params.value).toBe("b");
      // Verify they are different context objects
      expect(contexts[0]).not.toBe(contexts[1]);
    });

    test("concurrent dispatches with middleware isolation", async () => {
      const log: string[] = [];
      const app = new Fractal()
        .use(async (c, next) => {
          log.push(`mw-start-${c.req.params.id}`);
          await next();
          log.push(`mw-end-${c.req.params.id}`);
        })
        .method("work", async (c) => {
          const delay = c.req.params.delay as number;
          await new Promise((resolve) => setTimeout(resolve, delay));
          log.push(`handler-${c.req.params.id}`);
          return c.json("done");
        });

      await Promise.all([
        app.dispatch(makeRequest("work", { id: "1", delay: 20 }, 1)),
        app.dispatch(makeRequest("work", { id: "2", delay: 5 }, 2)),
      ]);

      // Both should start, handler-2 finishes first, then handler-1
      expect(log).toContain("mw-start-1");
      expect(log).toContain("mw-start-2");
      expect(log).toContain("handler-1");
      expect(log).toContain("handler-2");
      expect(log).toContain("mw-end-1");
      expect(log).toContain("mw-end-2");
      // Handler-2 should complete before handler-1 due to shorter delay
      expect(log.indexOf("handler-2")).toBeLessThan(log.indexOf("handler-1"));
    });

    test("concurrent dispatches where one throws and others succeed", async () => {
      const app = new Fractal()
        .method("ok", async (c) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return c.json("success");
        })
        .method("boom", async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          throw new Error("concurrent failure");
        });

      const [rOk, rBoom, rOk2] = await Promise.all([
        app.dispatch(makeRequest("ok", {}, 1)),
        app.dispatch(makeRequest("boom", {}, 2)),
        app.dispatch(makeRequest("ok", {}, 3)),
      ]);

      expect(rOk).toMatchObject({ result: "success", id: 1 });
      expect(rBoom).toMatchObject({
        error: { code: -32603, message: "concurrent failure" },
        id: 2,
      });
      expect(rOk2).toMatchObject({ result: "success", id: 3 });
    });

    test("many concurrent dispatches (10+) all resolve independently", async () => {
      const app = new Fractal().method("echo", async (c) => {
        const delay = Math.random() * 10;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return c.json(c.req.params.n);
      });

      const promises = Array.from({ length: 15 }, (_, i) =>
        app.dispatch(makeRequest("echo", { n: i }, i + 1)),
      );

      const results = await Promise.all(promises);

      for (let i = 0; i < 15; i++) {
        expect(results[i]).toMatchObject({ result: i, id: i + 1 });
      }
    });
  });

  // ─── c.res overwrite details ───

  describe("c.res overwrite details", () => {
    test("last middleware to assign c.res after next() wins", async () => {
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          c.res = c.json("first-overwrite");
        })
        .use(async (c, next) => {
          await next();
          c.res = c.json("second-overwrite");
        })
        .method("ping", (c) => c.json("original"));

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      // Outer middleware runs after inner in the after-phase,
      // so "first-overwrite" (registered first, runs last in after-phase) wins
      expect(response).toMatchObject({ result: "first-overwrite", id: 1 });
    });

    test("inner middleware overwrites, outer middleware does not → inner's value is returned", async () => {
      const app = new Fractal()
        .use(async (_c, next) => {
          await next();
          // outer does NOT overwrite c.res
        })
        .use(async (c, next) => {
          await next();
          c.res = c.json("inner-overwrite");
        })
        .method("ping", (c) => c.json("original"));

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toMatchObject({ result: "inner-overwrite", id: 1 });
    });

    test("three middlewares: only middle one overwrites c.res", async () => {
      const app = new Fractal()
        .use(async (_c, next) => {
          await next();
          // outer: no overwrite
        })
        .use(async (c, next) => {
          await next();
          c.res = c.json("middle-wins");
        })
        .use(async (_c, next) => {
          await next();
          // inner: no overwrite
        })
        .method("ping", (c) => c.json("original"));

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toMatchObject({ result: "middle-wins", id: 1 });
    });

    test("middleware overwrites c.res with error response after next()", async () => {
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          c.res = c.error(-32000, "Overwritten to error");
        })
        .method("ping", (c) => c.json("success"));

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32000, message: "Overwritten to error" },
        id: 1,
      });
    });

    test("middleware overwrites c.res from error to success after next()", async () => {
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          c.res = c.json("recovered");
        })
        .method("fail", (c) => c.error(-32000, "Original error"));

      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toMatchObject({ result: "recovered", id: 1 });
    });
  });

  // ─── Handler that doesn't call c.json() or c.error() ───

  describe("handler that doesn't call c.json() or c.error()", () => {
    test("handler returns void explicitly → -32603", async () => {
      const app = new Fractal().method("bad", ((_c: any) => {
        return undefined;
      }) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler returns null → -32603", async () => {
      const app = new Fractal().method("bad", ((_c: any) => {
        return null;
      }) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler returns a plain object without jsonrpc → -32603", async () => {
      const app = new Fractal().method("bad", ((_c: any) => {
        return { status: "ok", data: 123 };
      }) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("async handler returns void → -32603", async () => {
      const app = new Fractal().method("bad", (async (_c: any) => {
        await Promise.resolve();
        // no return
      }) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("async handler returns null → -32603", async () => {
      const app = new Fractal().method("bad", (async (_c: any) => {
        await Promise.resolve();
        return null;
      }) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler with no return statement and no side effects → -32603", async () => {
      const app = new Fractal().method("noop", (() => {
        // completely empty function body
      }) as any);
      const response = await app.dispatch(makeRequest("noop", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("handler that does computation but doesn't return → -32603", async () => {
      const app = new Fractal().method("compute", ((_c: any) => {
        const x = 1 + 2;
        void x; // use the value but don't return anything
      }) as any);
      const response = await app.dispatch(makeRequest("compute", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603 },
        id: 1,
      });
    });

    test("notification with handler returning void → void (no response)", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("bad", ((_c: any) => {
        return undefined;
      }) as any);
      const result = await app.dispatch(makeNotification("bad"));
      expect(result).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  // ─── Global + scoped middleware execution order ───

  describe("global + scoped middleware execution order", () => {
    test("mix of global and scoped middleware: verify they execute in registration order", async () => {
      const order: string[] = [];
      const app = new Fractal()
        .use(async (_c, next) => {
          order.push("global-1");
          await next();
        })
        .use("admin.*", async (_c, next) => {
          order.push("scoped-admin");
          await next();
        })
        .use(async (_c, next) => {
          order.push("global-2");
          await next();
        })
        .method("admin.delete", (c) => {
          order.push("handler");
          return c.json("deleted");
        });

      await app.dispatch(makeRequest("admin.delete", {}, 1));
      expect(order).toEqual([
        "global-1",
        "scoped-admin",
        "global-2",
        "handler",
      ]);
    });

    test("multiple scoped middleware matching same method: verify registration order", async () => {
      const order: string[] = [];
      const app = new Fractal()
        .use("admin.**", async (_c, next) => {
          order.push("admin-globstar");
          await next();
        })
        .use("admin.*", async (_c, next) => {
          order.push("admin-star");
          await next();
        })
        .use("**", async (_c, next) => {
          order.push("double-star");
          await next();
        })
        .method("admin.delete", (c) => {
          order.push("handler");
          return c.json("deleted");
        });

      await app.dispatch(makeRequest("admin.delete", {}, 1));
      expect(order).toEqual([
        "admin-globstar",
        "admin-star",
        "double-star",
        "handler",
      ]);
    });
  });

  // ─── dispatch() raw (MessageEvent) passthrough ───

  describe("dispatch() raw (MessageEvent) passthrough", () => {
    test("dispatch(request, raw) sets c.req.raw to the provided MessageEvent", async () => {
      let capturedRaw: MessageEvent | undefined;
      const app = new Fractal().method("ping", (c) => {
        capturedRaw = c.req.raw;
        return c.json("pong");
      });

      const fakeEvent = { data: "test", type: "message" } as MessageEvent;
      await app.dispatch(makeRequest("ping", {}, 1), fakeEvent);
      expect(capturedRaw).toBe(fakeEvent);
    });

    test("dispatch(request) without raw → c.req.raw is undefined", async () => {
      let capturedRaw: MessageEvent | undefined = "sentinel" as any;
      const app = new Fractal().method("ping", (c) => {
        capturedRaw = c.req.raw;
        return c.json("pong");
      });

      await app.dispatch(makeRequest("ping", {}, 1));
      expect(capturedRaw).toBeUndefined();
    });
  });

  // ─── Wildcard pattern edge cases ───

  describe("wildcard pattern edge cases", () => {
    test('"admin.**" does NOT match "admin" (** requires 1+ segments)', async () => {
      const order: string[] = [];
      const mw = async (_c: any, next: () => Promise<void>) => {
        order.push("mw");
        await next();
      };

      // Use separate apps to avoid namespace conflict between "admin" and "admin.delete"
      const app1 = new Fractal().use("admin.**", mw).method("admin", (c) => {
        order.push("handler-admin");
        return c.json("admin");
      });

      const app2 = new Fractal()
        .use("admin.**", mw)
        .method("admin.delete", (c) => {
          order.push("handler-admin-delete");
          return c.json("admin.delete");
        });

      // Dispatch "admin" → middleware should NOT run
      order.length = 0;
      await app1.dispatch(makeRequest("admin", {}, 1));
      expect(order).toEqual(["handler-admin"]);

      // Dispatch "admin.delete" → middleware SHOULD run
      order.length = 0;
      await app2.dispatch(makeRequest("admin.delete", {}, 2));
      expect(order).toEqual(["mw", "handler-admin-delete"]);
    });

    test('"**.get" does NOT match "get" (** requires 1+ segments)', async () => {
      const order: string[] = [];
      const mw = async (_c: any, next: () => Promise<void>) => {
        order.push("mw");
        await next();
      };
      const app = new Fractal()
        .use("**.get", mw)
        .method("get", (c) => {
          order.push("handler-get");
          return c.json("get");
        })
        .method("user.get", (c) => {
          order.push("handler-user-get");
          return c.json("user.get");
        });

      // Dispatch "get" → middleware should NOT run
      order.length = 0;
      await app.dispatch(makeRequest("get", {}, 1));
      expect(order).toEqual(["handler-get"]);

      // Dispatch "user.get" → middleware SHOULD run
      order.length = 0;
      await app.dispatch(makeRequest("user.get", {}, 2));
      expect(order).toEqual(["mw", "handler-user-get"]);
    });

    test('"admin*" is a literal match, not a wildcard — matches only method "admin*"', async () => {
      const order: string[] = [];
      const mw = async (_c: any, next: () => Promise<void>) => {
        order.push("mw");
        await next();
      };
      const app = new Fractal()
        .use("admin*", mw)
        .method("admin*", (c) => {
          order.push("handler-admin*");
          return c.json("admin*");
        })
        .method("admin", (c) => {
          order.push("handler-admin");
          return c.json("admin");
        })
        .method("adminFoo", (c) => {
          order.push("handler-adminFoo");
          return c.json("adminFoo");
        });

      // Dispatch "admin*" → middleware SHOULD run (literal match)
      order.length = 0;
      await app.dispatch(makeRequest("admin*", {}, 1));
      expect(order).toEqual(["mw", "handler-admin*"]);

      // Dispatch "admin" → middleware should NOT run
      order.length = 0;
      await app.dispatch(makeRequest("admin", {}, 2));
      expect(order).toEqual(["handler-admin"]);

      // Dispatch "adminFoo" → middleware should NOT run
      order.length = 0;
      await app.dispatch(makeRequest("adminFoo", {}, 3));
      expect(order).toEqual(["handler-adminFoo"]);
    });
  });

  // ─── use() middleware argument validation ───

  describe("use() middleware argument validation", () => {
    test("use(pattern) without middleware function throws", () => {
      const app = new Fractal();
      expect(() => (app as any).use("admin.*")).toThrow();
    });

    test("use(pattern, undefined) throws", () => {
      const app = new Fractal();
      expect(() => (app as any).use("admin.*", undefined)).toThrow();
    });
  });

  // ─── Reserved name patterns in use() ───

  describe("reserved name patterns in use() (dotted forms)", () => {
    test("rejects '$notify.something' pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use("$notify.events", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects 'dispose.cleanup' pattern", () => {
      const app = new Fractal();
      expect(() =>
        app.use("dispose.cleanup", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });
  });

  // ─── id type acceptance (§5.1 ※3) ───

  describe("id type acceptance (no type checking on id)", () => {
    test("id as object is accepted", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        id: { custom: "id" } as any,
      });
      expect(response).toMatchObject({ result: "pong" });
      expect((response as any).id).toEqual({ custom: "id" });
    });

    test("id as array is accepted", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        id: [1, 2, 3] as any,
      });
      expect(response).toMatchObject({ result: "pong" });
      expect((response as any).id).toEqual([1, 2, 3]);
    });
  });

  // ─── handler returning undefined: -32603 with no data field ───

  describe("handler returning undefined produces -32603 without data field", () => {
    test("-32603 error response does not contain data field when handler returns undefined", async () => {
      const app = new Fractal().method("bad", ((_c: any) => {
        return undefined;
      }) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: 1,
      });
      expect("data" in (response as any).error).toBe(false);
    });
  });

  // ─── Notification context: c.json() id normalization ───

  describe("notification context: c.json() id normalization", () => {
    test("notification handler calling c.json() produces response with id: null, captured via middleware", async () => {
      let capturedRes: any;
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          capturedRes = c.res;
        })
        .method("ping", (c) => c.json("pong"));

      const result = await app.dispatch(makeNotification("ping"));
      expect(result).toBeUndefined();
      // The middleware captured c.res after next(); id should be null for notification
      expect(capturedRes).toBeDefined();
      expect(capturedRes.id).toBeNull();
      expect(capturedRes.result).toBe("pong");
    });
  });

  // ─── .use() builder pattern shares middleware registry ───

  describe(".use() builder pattern shares middleware registry", () => {
    test("chained .use() calls share the internal middleware registry", async () => {
      const order: string[] = [];
      const app = new Fractal()
        .use(async (_c, next) => {
          order.push("mw1");
          await next();
        })
        .use(async (_c, next) => {
          order.push("mw2");
          await next();
        })
        .method("ping", (c) => {
          order.push("handler");
          return c.json("pong");
        });

      // Even though .use() returns a new instance each time,
      // middleware registered on any child in the chain should apply
      await app.dispatch(makeRequest("ping", {}, 1));
      expect(order).toEqual(["mw1", "mw2", "handler"]);
    });

    test("intermediate .use() instance shares registry with final instance", async () => {
      const spy = vi.fn();
      const base = new Fractal();
      const withMw = base.use(async (_c, next) => {
        spy();
        await next();
      });
      const final = withMw.method("ping", (c) => c.json("pong"));

      await final.dispatch(makeRequest("ping", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      // Dispatching from the base instance also sees the middleware (shared registry)
      const base2 = base.method("echo", (c) => c.json("echo"));
      spy.mockClear();
      await base2.dispatch(makeRequest("echo", {}, 2));
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Notification + non-string method dispatch returns void ───

  describe("notification + non-string method dispatch returns void", () => {
    test("notification with method as number returns void", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const result = await app.dispatch({
        jsonrpc: "2.0",
        method: 123 as any,
      });
      expect(result).toBeUndefined();
    });

    test("notification with method as null returns void", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const result = await app.dispatch({
        jsonrpc: "2.0",
        method: null as any,
      });
      expect(result).toBeUndefined();
    });
  });

  // ─── id: null error response has id: null ───

  describe("id: null error response id normalization", () => {
    test("Method not found with id: null returns error with id: null", async () => {
      const app = new Fractal();
      const response = await app.dispatch(makeRequest("nonexistent", {}, null));
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32601, message: "Method not found" },
      });
      expect((response as any).id).toBeNull();
    });
  });

  // ─── admin.** matches 4+ segment methods ───

  describe("admin.** matches deeply nested methods", () => {
    test('"admin.**" matches admin.user.role.assign (4 segments)', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("admin.**", async (_c, next) => {
          spy();
          await next();
        })
        .method("admin.user.role.assign", (c) => c.json("assigned"));

      await app.dispatch(makeRequest("admin.user.role.assign", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);
      const response = await app.dispatch(
        makeRequest("admin.user.role.assign", {}, 2),
      );
      expect(response).toMatchObject({ result: "assigned" });
    });
  });

  // ─── Notification handler completion sets c.res ───

  describe("notification handler completion sets c.res", () => {
    test("after notification handler completes, c.res is set (non-undefined) in middleware", async () => {
      let capturedRes: any = "not-set";
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          capturedRes = c.res;
        })
        .method("log", (c) => c.json("logged"));

      const result = await app.dispatch(
        makeNotification("log", { msg: "hello" }),
      );
      expect(result).toBeUndefined(); // notification returns void
      // But c.res should have been set by the handler
      expect(capturedRes).toBeDefined();
      expect(capturedRes).not.toBeUndefined();
      expect(capturedRes.result).toBe("logged");
    });
  });

  // ─── Notification: middleware catch + error handling ───

  describe("notification: middleware catches handler throw and sets c.res via c.error", () => {
    test("middleware catches handler throw during notification and sets c.res with c.error()", async () => {
      let capturedRes: any = "not-set";
      const app = new Fractal()
        .use(async (c, next) => {
          try {
            await next();
          } catch (e) {
            c.res = c.error(-32000, "Caught: " + (e as Error).message);
          }
          capturedRes = c.res;
        })
        .method("boom", () => {
          throw new Error("notification handler exploded");
        });

      const result = await app.dispatch(makeNotification("boom"));
      expect(result).toBeUndefined(); // notification always returns void
      // Middleware caught the error and set c.res
      expect(capturedRes).toBeDefined();
      expect(capturedRes.error).toMatchObject({
        code: -32000,
        message: "Caught: notification handler exploded",
      });
    });
  });

  // ─── Wildcard "segment-only" condition (§2.1) ───

  describe('wildcard "segment-only" condition — only whole-segment * or ** are wildcards', () => {
    test('"admin*" is a LITERAL pattern — only matches method name "admin*"', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("admin*", async (_c, next) => {
          spy();
          await next();
        })
        .method("admin*", (c) => c.json("literal"))
        .method("admin", (c) => c.json("admin"))
        .method("adminFoo", (c) => c.json("adminFoo"));

      // "admin*" → middleware SHOULD run (literal match)
      spy.mockClear();
      await app.dispatch(makeRequest("admin*", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      // "admin" → middleware should NOT run
      spy.mockClear();
      await app.dispatch(makeRequest("admin", {}, 2));
      expect(spy).not.toHaveBeenCalled();

      // "adminFoo" → middleware should NOT run
      spy.mockClear();
      await app.dispatch(makeRequest("adminFoo", {}, 3));
      expect(spy).not.toHaveBeenCalled();
    });

    test('"*" IS a wildcard — matches any single-segment method', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*", async (_c, next) => {
          spy();
          await next();
        })
        .method("ping", (c) => c.json("pong"))
        .method("hello", (c) => c.json("world"))
        .method("user.get", (c) => c.json("user"));

      // "ping" → single segment → middleware SHOULD run
      spy.mockClear();
      await app.dispatch(makeRequest("ping", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      // "hello" → single segment → middleware SHOULD run
      spy.mockClear();
      await app.dispatch(makeRequest("hello", {}, 2));
      expect(spy).toHaveBeenCalledTimes(1);

      // "user.get" → multi-segment → middleware should NOT run
      spy.mockClear();
      await app.dispatch(makeRequest("user.get", {}, 3));
      expect(spy).not.toHaveBeenCalled();
    });

    test('"foo*bar" is a LITERAL pattern — only matches method name "foo*bar"', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("foo*bar", async (_c, next) => {
          spy();
          await next();
        })
        .method("foo*bar", (c) => c.json("literal"))
        .method("foobar", (c) => c.json("foobar"))
        .method("fooXbar", (c) => c.json("fooXbar"));

      // "foo*bar" → middleware SHOULD run (literal match)
      spy.mockClear();
      await app.dispatch(makeRequest("foo*bar", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);

      // "foobar" → middleware should NOT run
      spy.mockClear();
      await app.dispatch(makeRequest("foobar", {}, 2));
      expect(spy).not.toHaveBeenCalled();

      // "fooXbar" → middleware should NOT run
      spy.mockClear();
      await app.dispatch(makeRequest("fooXbar", {}, 3));
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ─── Numeric and boolean params validation ───

  describe("numeric and boolean params validation", () => {
    test("params: 42 (number) returns -32600 Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: 42 as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32600, message: "Invalid Request" },
        id: 1,
      });
    });

    test("params: true (boolean) returns -32600 Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: true as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32600, message: "Invalid Request" },
        id: 1,
      });
    });
  });

  // ─── dispatch: request with method field completely absent ───

  describe("dispatch: request with method field completely absent", () => {
    test("request without method field returns -32601 Method not found", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        params: {},
        id: 1,
      });
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("request without method field and without params returns -32601", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        id: 42,
      });
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 42,
      });
    });

    test("notification without method field returns void", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const result = await app.dispatch({
        jsonrpc: "2.0",
        params: {},
      });
      expect(result).toBeUndefined();
    });
  });

  // ─── Constructor: multiple instance isolation ───

  describe("constructor: multiple instance isolation", () => {
    test("two Fractal instances have independent route registries", async () => {
      const app1 = new Fractal().method("foo", (c) => c.json("foo-result"));
      const app2 = new Fractal().method("bar", (c) => c.json("bar-result"));

      // app1 should handle "foo" but not "bar"
      const r1 = await app1.dispatch(makeRequest("foo", {}, 1));
      expect(r1).toMatchObject({ result: "foo-result", id: 1 });

      const r2 = await app1.dispatch(makeRequest("bar", {}, 2));
      expect(r2).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 2,
      });

      // app2 should handle "bar" but not "foo"
      const r3 = await app2.dispatch(makeRequest("bar", {}, 3));
      expect(r3).toMatchObject({ result: "bar-result", id: 3 });

      const r4 = await app2.dispatch(makeRequest("foo", {}, 4));
      expect(r4).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 4,
      });
    });

    test("two Fractal instances have independent middleware registries", async () => {
      const spy1 = vi.fn();
      const spy2 = vi.fn();

      const app1 = new Fractal()
        .use(async (_c, next) => {
          spy1();
          await next();
        })
        .method("ping", (c) => c.json("pong1"));

      const app2 = new Fractal()
        .use(async (_c, next) => {
          spy2();
          await next();
        })
        .method("ping", (c) => c.json("pong2"));

      await app1.dispatch(makeRequest("ping", {}, 1));
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).not.toHaveBeenCalled();

      spy1.mockClear();
      spy2.mockClear();

      await app2.dispatch(makeRequest("ping", {}, 2));
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy1).not.toHaveBeenCalled();
    });

    test("registering method on one instance does not affect another", () => {
      const app1 = new Fractal();
      const app2 = new Fractal();

      app1.method("shared-name", (c) => c.json("from-app1"));

      // app2 should be able to register the same method name without conflict
      expect(() =>
        app2.method("shared-name", (c) => c.json("from-app2")),
      ).not.toThrow();
    });
  });

  // ─── Handler manually constructing JsonRpcResponse ───

  describe("handler manually constructing JsonRpcResponse", () => {
    test("handler returning a manually constructed success response is accepted", async () => {
      const app = new Fractal().method("manual", (_c) => ({
        jsonrpc: "2.0" as const,
        result: "manual-ok",
        id: 1,
      }));

      const response = await app.dispatch(makeRequest("manual", {}, 1));
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        result: "manual-ok",
        id: 1,
      });
    });

    test("handler returning a manually constructed error response is accepted", async () => {
      const app = new Fractal().method("manual-error", (_c) => ({
        jsonrpc: "2.0" as const,
        error: { code: -32000, message: "Manual error" },
        id: 1,
      }));

      const response = await app.dispatch(makeRequest("manual-error", {}, 1));
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Manual error" },
        id: 1,
      });
    });

    test("manually constructed response id does not auto-update from request id", async () => {
      // The handler hardcodes id: 999, but the request has id: 1.
      // Since it bypasses c.json(), the hardcoded id should be returned as-is.
      const app = new Fractal().method("manual", (_c) => ({
        jsonrpc: "2.0" as const,
        result: "ok",
        id: 999,
      }));

      const response = await app.dispatch(makeRequest("manual", {}, 1));
      // The framework wraps the handler and just checks for jsonrpc field,
      // so the hardcoded id is preserved
      expect((response as any).id).toBe(999);
    });
  });

  // ─── method("*", handler) + use("*", mw) interaction ───

  describe('method("*", handler) + use("*", mw) interaction', () => {
    test('method("*", handler) registers a literal "*" method, use("*", mw) matches it as wildcard', async () => {
      const mwSpy = vi.fn();
      const app = new Fractal()
        .method("*", (c) => c.json("star-handler"))
        .use("*", async (_c, next) => {
          mwSpy();
          await next();
        });

      // Dispatching "*" should match the "*" method and the "*" wildcard middleware
      const response = await app.dispatch(makeRequest("*", {}, 1));
      expect(response).toMatchObject({ result: "star-handler", id: 1 });
      // "*" as a middleware pattern matches any single-segment method, including literal "*"
      expect(mwSpy).toHaveBeenCalledTimes(1);
    });

    test('use("*", mw) registered after method("*", handler): mw runs for other single-segment methods too', async () => {
      const mwSpy = vi.fn();
      const app = new Fractal()
        .method("*", (c) => c.json("star-handler"))
        .method("ping", (c) => c.json("pong"))
        .use("*", async (_c, next) => {
          mwSpy();
          await next();
        });

      // Dispatch "ping" — mw should run because "*" pattern matches single-segment "ping"
      mwSpy.mockClear();
      await app.dispatch(makeRequest("ping", {}, 1));
      expect(mwSpy).toHaveBeenCalledTimes(1);

      // Dispatch "*" — mw should also run
      mwSpy.mockClear();
      await app.dispatch(makeRequest("*", {}, 2));
      expect(mwSpy).toHaveBeenCalledTimes(1);
    });

    test('use("*", mw) does NOT match multi-segment methods even with method("*") registered', async () => {
      const mwSpy = vi.fn();
      const app = new Fractal()
        .method("*", (c) => c.json("star-handler"))
        .method("user.get", (c) => c.json("user"))
        .use("*", async (_c, next) => {
          mwSpy();
          await next();
        });

      // Dispatch "user.get" — mw should NOT run because "*" only matches single segments
      mwSpy.mockClear();
      await app.dispatch(makeRequest("user.get", {}, 1));
      expect(mwSpy).not.toHaveBeenCalled();
    });
  });

  // ─── Middleware modifying c.req.params propagates to handler ───

  describe("middleware modifying c.req.params propagates to handler", () => {
    test("middleware adds a property to c.req.params and handler receives it", async () => {
      let handlerParams: Record<string, unknown> | undefined;
      const app = new Fractal()
        .use(async (c, next) => {
          (c.req.params as Record<string, unknown>).injected = "by-middleware";
          await next();
        })
        .method("echo", (c) => {
          handlerParams = c.req.params;
          return c.json(c.req.params);
        });

      const response = await app.dispatch(
        makeRequest("echo", { original: "value" }, 1),
      );
      expect(response).toMatchObject({
        result: { original: "value", injected: "by-middleware" },
        id: 1,
      });
      expect(handlerParams).toEqual({
        original: "value",
        injected: "by-middleware",
      });
    });

    test("middleware overwrites an existing property in c.req.params and handler sees the new value", async () => {
      let handlerParams: Record<string, unknown> | undefined;
      const app = new Fractal()
        .use(async (c, next) => {
          (c.req.params as Record<string, unknown>).name = "overwritten";
          await next();
        })
        .method("echo", (c) => {
          handlerParams = c.req.params;
          return c.json(c.req.params);
        });

      const response = await app.dispatch(
        makeRequest("echo", { name: "original" }, 1),
      );
      expect(response).toMatchObject({
        result: { name: "overwritten" },
        id: 1,
      });
      expect(handlerParams).toEqual({ name: "overwritten" });
    });

    test("multiple middleware sequentially modify c.req.params — handler sees all changes", async () => {
      let handlerParams: Record<string, unknown> | undefined;
      const app = new Fractal()
        .use(async (c, next) => {
          (c.req.params as Record<string, unknown>).fromMw1 = "mw1";
          await next();
        })
        .use(async (c, next) => {
          (c.req.params as Record<string, unknown>).fromMw2 = "mw2";
          await next();
        })
        .method("echo", (c) => {
          handlerParams = c.req.params;
          return c.json(c.req.params);
        });

      const response = await app.dispatch(makeRequest("echo", {}, 1));
      expect(response).toMatchObject({
        result: { fromMw1: "mw1", fromMw2: "mw2" },
        id: 1,
      });
      expect(handlerParams).toEqual({ fromMw1: "mw1", fromMw2: "mw2" });
    });
  });

  // ─── use() reserved name patterns: complete wildcard forms ───

  describe("use() reserved name patterns: wildcard forms ($notify.*, dispose.*, then.*)", () => {
    test("rejects '$notify.*' pattern (reserved first segment with wildcard)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("$notify.*", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects 'dispose.*' pattern (reserved first segment with wildcard)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("dispose.*", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects 'then.*' pattern (reserved first segment with wildcard)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("then.*", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects '$notify.**' pattern (reserved first segment with globstar)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("$notify.**", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects 'dispose.**' pattern (reserved first segment with globstar)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("dispose.**", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects 'then.**' pattern (reserved first segment with globstar)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("then.**", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects '$notify.foo.bar' pattern (reserved first segment, deep path)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("$notify.foo.bar", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects 'dispose.foo.bar' pattern (reserved first segment, deep path)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("dispose.foo.bar", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });

    test("rejects 'then.foo.bar' pattern (reserved first segment, deep path)", () => {
      const app = new Fractal();
      expect(() =>
        app.use("then.foo.bar", async (_c, next) => {
          await next();
        }),
      ).toThrow();
    });
  });

  // ─── dispatch() raw parameter propagation ───

  describe("dispatch() raw parameter propagation to c.req.raw", () => {
    test("dispatch(request, fakeEvent) sets c.req.raw to fakeEvent", async () => {
      let capturedRaw: unknown;
      const app = new Fractal().method("ping", (c) => {
        capturedRaw = c.req.raw;
        return c.json("pong");
      });

      const fakeEvent = {
        data: { custom: true },
        type: "message",
        origin: "https://example.com",
      } as MessageEvent;
      await app.dispatch(makeRequest("ping", {}, 1), fakeEvent);
      expect(capturedRaw).toBe(fakeEvent);
    });

    test("dispatch(request, fakeEvent) — middleware also sees c.req.raw as fakeEvent", async () => {
      let middlewareRaw: unknown;
      let handlerRaw: unknown;
      const app = new Fractal()
        .use(async (c, next) => {
          middlewareRaw = c.req.raw;
          await next();
        })
        .method("ping", (c) => {
          handlerRaw = c.req.raw;
          return c.json("pong");
        });

      const fakeEvent = { data: "test", type: "message" } as MessageEvent;
      await app.dispatch(makeRequest("ping", {}, 1), fakeEvent);
      expect(middlewareRaw).toBe(fakeEvent);
      expect(handlerRaw).toBe(fakeEvent);
    });
  });

  // ─── Notification with invalid params (array) ───

  describe("notification with invalid params: array", () => {
    test("notification with params: [] returns void and logs to console.error", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const result = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: [] as any,
      });
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Invalid params: expected object, got",
        [],
      );
      consoleSpy.mockRestore();
    });

    test("notification with params: [] does not execute handler", async () => {
      const handlerSpy = vi.fn((c: any) => c.json("pong"));
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("ping", handlerSpy);
      await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: [] as any,
      });
      expect(handlerSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("request with params: [] (non-notification) returns -32600 Invalid Request", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: [] as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32600, message: "Invalid Request" },
        id: 1,
      });
      consoleSpy.mockRestore();
    });
  });

  // ─── c.error() id normalization for notifications ───

  describe("notification context: c.error() id normalization", () => {
    test("notification handler calling c.error() produces response with id: null, captured via middleware", async () => {
      let capturedRes: any;
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          capturedRes = c.res;
        })
        .method("fail", (c) => c.error(-32000, "Custom error"));

      const result = await app.dispatch(makeNotification("fail"));
      expect(result).toBeUndefined();
      // The middleware captured c.res after next(); id should be null for notification
      expect(capturedRes).toBeDefined();
      expect(capturedRes.id).toBeNull();
      expect(capturedRes.error).toMatchObject({
        code: -32000,
        message: "Custom error",
      });
    });
  });

  // ─── Handler returning a Promise that rejects ───

  describe("handler returning a Promise that rejects", () => {
    test("async handler whose returned promise rejects produces -32603", async () => {
      const app = new Fractal().method("reject", () => {
        return Promise.reject(new Error("async failure"));
      });
      const response = await app.dispatch(makeRequest("reject", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "async failure" },
        id: 1,
      });
    });

    test("async handler rejecting with non-Error produces generic -32603 message", async () => {
      const app = new Fractal().method("reject", () => {
        return Promise.reject("string rejection");
      });
      const response = await app.dispatch(makeRequest("reject", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "Internal error" },
        id: 1,
      });
    });
  });

  // ─── Middleware c.res is undefined before next() ───

  describe("middleware c.res is undefined before next()", () => {
    test("c.res is undefined in the pre-next() phase of middleware", async () => {
      let preNextRes: unknown = "not-checked";
      let postNextRes: unknown = "not-checked";
      const app = new Fractal()
        .use(async (c, next) => {
          preNextRes = c.res;
          await next();
          postNextRes = c.res;
        })
        .method("ping", (c) => c.json("pong"));

      await app.dispatch(makeRequest("ping", {}, 1));
      expect(preNextRes).toBeUndefined();
      expect(postNextRes).toBeDefined();
      expect((postNextRes as any).result).toBe("pong");
    });
  });

  // ─── Middleware returning JsonRpcResponse after calling next() ── undefined behavior ───

  describe("middleware returning JsonRpcResponse after calling next() — undefined behavior", () => {
    test("next() called and JsonRpcResponse returned: behavior is undefined per spec (documenting current behavior)", async () => {
      // Per spec (§3.3): "next() を呼んだ middleware は void を返すこと。
      // next() を呼びつつ JsonRpcResponse を return した場合の動作は未定義である。"
      // This test documents the current runtime behavior for awareness,
      // but the framework makes no guarantees about this case.
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          // Undefined behavior: returning a response after calling next()
          return c.error(-32000, "Should not do this");
        })
        .method("ping", (c) => c.json("pong"));

      // We just verify dispatch does not throw/hang — the actual response is undefined behavior
      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toBeDefined();
      expect((response as any).jsonrpc).toBe("2.0");
    });
  });

  // ─── c.json(undefined) type-level prohibition ───

  describe("c.json(undefined) type-level prohibition", () => {
    test("c.json(undefined) is prohibited at the type level", async () => {
      const app = new Fractal().method("bad", (c) => {
        // @ts-expect-error — c.json(undefined) is prohibited by the type signature
        return c.json(undefined);
      });
      // At runtime, the handler returns a response with result: undefined,
      // but this should not compile without the @ts-expect-error annotation.
      // We just verify the test compiles with the annotation.
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toBeDefined();
    });
  });

  // ─── Notification console.error content verification ───

  describe("notification console.error content verification", () => {
    test("when a notification handler throws, console.error receives the actual Error object", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const thrownError = new Error("notification failure details");
      const app = new Fractal().method("boom", () => {
        throw thrownError;
      });
      const result = await app.dispatch(makeNotification("boom"));
      expect(result).toBeUndefined();
      // Verify console.error was called with the actual error object
      expect(consoleSpy).toHaveBeenCalledWith(thrownError);
      consoleSpy.mockRestore();
    });

    test("when a notification middleware throws, console.error receives the actual Error object", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const thrownError = new Error("middleware notification error");
      const app = new Fractal()
        .use(async (_c, _next) => {
          throw thrownError;
        })
        .method("ping", (c) => c.json("pong"));

      const result = await app.dispatch(makeNotification("ping"));
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(thrownError);
      consoleSpy.mockRestore();
    });
  });

  // ─── c.error() response from handler during notification ───

  describe("c.error() response from handler during notification", () => {
    test("handler returning c.error() during notification results in void return (response suppressed)", async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32000, "Custom notification error"),
      );
      const result = await app.dispatch(makeNotification("fail"));
      // Notification always returns void regardless of handler response
      expect(result).toBeUndefined();
    });

    test("handler returning c.error() during notification still sets c.res in middleware", async () => {
      let capturedRes: any;
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          capturedRes = c.res;
        })
        .method("fail", (c) =>
          c.error(-32000, "Notification error", { info: "test" }),
        );

      const result = await app.dispatch(makeNotification("fail"));
      expect(result).toBeUndefined();
      // c.res should be set even for notifications
      expect(capturedRes).toBeDefined();
      expect(capturedRes.error).toMatchObject({
        code: -32000,
        message: "Notification error",
        data: { info: "test" },
      });
      expect(capturedRes.id).toBeNull();
    });
  });

  // ─── c.json() with null ───

  describe("c.json(null)", () => {
    test("c.json(null) produces a success response with result: null", async () => {
      const app = new Fractal().method("nullable", (c) => c.json(null));
      const response = await app.dispatch(makeRequest("nullable", {}, 1));
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: null,
        id: 1,
      });
    });
  });

  // ─── c.json() with various result types ───

  describe("c.json() with various result types", () => {
    test("c.json() with an array as result data", async () => {
      const app = new Fractal().method("arr", (c) => c.json([1, 2, 3]));
      const response = await app.dispatch(makeRequest("arr", {}, 1));
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: [1, 2, 3],
        id: 1,
      });
    });

    test("c.json() with a number as result data", async () => {
      const app = new Fractal().method("num", (c) => c.json(42));
      const response = await app.dispatch(makeRequest("num", {}, 1));
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: 42,
        id: 1,
      });
    });

    test("c.json() with a boolean as result data", async () => {
      const app = new Fractal().method("bool", (c) => c.json(true));
      const response = await app.dispatch(makeRequest("bool", {}, 1));
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: true,
        id: 1,
      });
    });

    test("c.json() with false as result data", async () => {
      const app = new Fractal().method("boolfalse", (c) => c.json(false));
      const response = await app.dispatch(makeRequest("boolfalse", {}, 1));
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: false,
        id: 1,
      });
    });

    test("c.json() with an empty string as result data", async () => {
      const app = new Fractal().method("emptystr", (c) => c.json(""));
      const response = await app.dispatch(makeRequest("emptystr", {}, 1));
      expect(response).toEqual({
        jsonrpc: "2.0",
        result: "",
        id: 1,
      });
    });
  });

  // ─── c.error() with data=undefined explicitly ───

  describe("c.error() with data=undefined explicitly", () => {
    test("c.error(-32000, 'msg', undefined) omits the data key", async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32000, "msg", undefined),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "msg" },
        id: 1,
      });
      // Verify the data key is truly absent, not just undefined
      expect("data" in (response as any).error).toBe(false);
    });
  });

  // ─── Params validation order vs method lookup ───

  describe("params validation order vs method lookup", () => {
    test("invalid params (array) to unknown method returns -32600, not -32601", async () => {
      // The spec says params are validated before method lookup.
      // dispatch() validates params first, then looks up the method.
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "nonexistent",
        params: [1, 2, 3] as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32600, message: "Invalid Request" },
        id: 1,
      });
    });

    test("invalid params (null) to unknown method returns -32600, not -32601", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "nonexistent",
        params: null as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32600 },
        id: 1,
      });
    });
  });

  // ─── Middleware short-circuit c.res observability ───

  describe("middleware short-circuit c.res observability", () => {
    test("outer middleware can see c.res after inner middleware short-circuits without calling next()", async () => {
      let outerSeenRes: unknown = "not-set";
      const shortCircuitResponse = {
        jsonrpc: "2.0" as const,
        error: { code: -32000, message: "Blocked" },
        id: 1,
      };

      const app = new Fractal()
        .use(async (c, next) => {
          // Outer middleware calls next()
          await next();
          // After next() returns, c.res should be set to inner middleware's short-circuit response
          outerSeenRes = c.res;
        })
        .use((_c, _next) => {
          // Inner middleware short-circuits by returning a response without calling next()
          return shortCircuitResponse;
        })
        .method("secret", (c) => c.json("should not reach"));

      await app.dispatch(makeRequest("secret", {}, 1));
      expect(outerSeenRes).toMatchObject({
        error: { code: -32000, message: "Blocked" },
      });
    });

    test("outer middleware can modify c.res after inner middleware short-circuits", async () => {
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          // Replace the short-circuit response from inner middleware
          c.res = c.json("overridden");
        })
        .use((_c, _next) => {
          return {
            jsonrpc: "2.0" as const,
            error: { code: -32000, message: "Blocked" },
            id: 1,
          };
        })
        .method("secret", (c) => c.json("should not reach"));

      const response = await app.dispatch(makeRequest("secret", {}, 1));
      expect(response).toMatchObject({ result: "overridden" });
    });
  });

  // ─── Scoped middleware with exact method name (no wildcards) ───

  describe("scoped middleware with exact method name (no wildcards)", () => {
    test('.use("admin.delete", middleware) matches exactly "admin.delete"', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("admin.delete", async (_c, next) => {
          spy();
          await next();
        })
        .method("admin.delete", (c) => c.json("deleted"));

      await app.dispatch(makeRequest("admin.delete", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('.use("admin.delete", middleware) does NOT match "admin.delete.force"', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("admin.delete", async (_c, next) => {
          spy();
          await next();
        })
        .method("admin.delete.force", (c) => c.json("force-deleted"));

      await app.dispatch(makeRequest("admin.delete.force", {}, 1));
      expect(spy).not.toHaveBeenCalled();
    });

    test('.use("admin.delete", middleware) does NOT match "admin"', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("admin.delete", async (_c, next) => {
          spy();
          await next();
        })
        .method("admin", (c) => c.json("admin"));

      await app.dispatch(makeRequest("admin", {}, 1));
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ─── Calling an intermediate namespace directly ───

  describe("calling an intermediate namespace directly", () => {
    test('dispatch({method: "user"}) returns a result when "user" is registered as a handler', async () => {
      const app = new Fractal().method("user", (c) =>
        c.json({ id: c.req.params.id }),
      );
      const response = await app.dispatch(makeRequest("user", { id: "1" }, 1));
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        result: { id: "1" },
        id: 1,
      });
    });

    test('dispatch({method: "user"}) returns Method not found when only "user.get" is registered', async () => {
      const app = new Fractal().method("user.get", (c) => c.json("ok"));
      const response = await app.dispatch(makeRequest("user", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });
  });

  // ─── Complex combined wildcard patterns ───

  describe("complex combined wildcard patterns", () => {
    test('"*.**.get" matches "x.y.get" (single * then ** then literal)', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*.**.get", async (_c, next) => {
          spy();
          await next();
        })
        .method("x.y.get", (c) => c.json("ok"));

      await app.dispatch(makeRequest("x.y.get", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('"*.**.get" matches "a.b.c.get" (single * then ** consuming multiple then literal)', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*.**.get", async (_c, next) => {
          spy();
          await next();
        })
        .method("a.b.c.get", (c) => c.json("ok"));

      await app.dispatch(makeRequest("a.b.c.get", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('"*.**.get" does NOT match "x.get" (* needs 1 seg + ** needs 1+ seg + "get" = 3 minimum)', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*.**.get", async (_c, next) => {
          spy();
          await next();
        })
        .method("x.get", (c) => c.json("ok"));

      await app.dispatch(makeRequest("x.get", {}, 1));
      // "*.**.get" requires at least 3 segments: * matches 1, ** matches 1+, "get" matches 1
      expect(spy).not.toHaveBeenCalled();
    });

    test('"*.**.get" does NOT match "get" (single-segment)', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*.**.get", async (_c, next) => {
          spy();
          await next();
        })
        .method("get", (c) => c.json("ok"));

      await app.dispatch(makeRequest("get", {}, 1));
      expect(spy).not.toHaveBeenCalled();
    });

    test('"*.**.get" does NOT match "a.b.c.set" (wrong trailing literal)', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*.**.get", async (_c, next) => {
          spy();
          await next();
        })
        .method("a.b.c.set", (c) => c.json("ok"));

      await app.dispatch(makeRequest("a.b.c.set", {}, 1));
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ─── Async handler resolving to non-JsonRpcResponse object ───

  describe("async handler resolving to non-JsonRpcResponse object", () => {
    test("async handler resolving to { foo: 'bar' } returns -32603 Internal error", async () => {
      const app = new Fractal().method("bad", (async () => {
        await Promise.resolve();
        return { foo: "bar" };
      }) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603 },
        id: 1,
      });
    });

    test("async handler resolving to { foo: 'bar' } returns error message 'Internal error'", async () => {
      const app = new Fractal().method("bad", (async () => {
        await Promise.resolve();
        return { foo: "bar" };
      }) as any);
      const response = await app.dispatch(makeRequest("bad", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "Internal error" },
      });
    });
  });

  // ─── id: undefined request response id verification ───

  describe("id: undefined request response id verification", () => {
    test("request with id: undefined (where 'id' in request is true) returns a response", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      // Construct directly so "id" key is present with value undefined
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        id: undefined,
      });
      expect(response).toBeDefined();
      expect(response).toMatchObject({ result: "pong" });
    });

    test("request with id: undefined normalizes response id to null via c.json()", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      // "id" in request is true, so it's NOT a notification.
      // However, the context factory normalizes: responseId = reqId !== undefined ? reqId : null
      // Since reqId IS undefined, responseId becomes null.
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        id: undefined,
      });
      // Implementation: context.ts sets responseId = reqId !== undefined ? reqId : null
      // Since id is undefined, responseId becomes null
      expect((response as any).id).toBeNull();
    });

    test("request with id: undefined normalizes error response id to null", async () => {
      const app = new Fractal();
      // Method not found error for a request with id: undefined
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: "nonexistent",
        id: undefined,
      });
      expect(response).toBeDefined();
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
      });
      // dispatch() uses id ?? null for error responses; undefined ?? null = null
      expect((response as any).id).toBeNull();
    });
  });

  // ─── Explicit test that * / ** as first segment bypasses reserved name check in .use() ───

  describe("* and ** as first segment bypass reserved name check in .use()", () => {
    test('.use("*", mw) does not throw even though * would match reserved name methods', () => {
      const app = new Fractal();
      expect(() =>
        app.use("*", async (_c, next) => {
          await next();
        }),
      ).not.toThrow();
    });

    test('.use("**", mw) does not throw even though ** would match reserved name methods', () => {
      const app = new Fractal();
      expect(() =>
        app.use("**", async (_c, next) => {
          await next();
        }),
      ).not.toThrow();
    });

    test('.use("*.check", mw) does not throw — * as first segment bypasses reserved name check', () => {
      const app = new Fractal();
      expect(() =>
        app.use("*.check", async (_c, next) => {
          await next();
        }),
      ).not.toThrow();
    });

    test('.use("**.check", mw) does not throw — ** as first segment bypasses reserved name check', () => {
      const app = new Fractal();
      expect(() =>
        app.use("**.check", async (_c, next) => {
          await next();
        }),
      ).not.toThrow();
    });

    test('.use("*", mw) middleware actually runs for single-segment methods', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("*", async (_c, next) => {
          spy();
          await next();
        })
        .method("ping", (c) => c.json("pong"));

      await app.dispatch(makeRequest("ping", {}, 1));
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('.use("**", mw) middleware actually runs for all methods', async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("**", async (_c, next) => {
          spy();
          await next();
        })
        .method("ping", (c) => c.json("pong"))
        .method("user.get", (c) => c.json("user"));

      await app.dispatch(makeRequest("ping", {}, 1));
      await app.dispatch(makeRequest("user.get", {}, 2));
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  // ─── c.error() data field with falsy-but-defined values ───

  describe("c.error() data field with falsy-but-defined values", () => {
    test('c.error() with data: 0 includes the "data" field', async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32603, "err", 0),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "err", data: 0 },
      });
      expect("data" in (response as any).error).toBe(true);
    });

    test('c.error() with data: false includes the "data" field', async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32603, "err", false),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "err", data: false },
      });
      expect("data" in (response as any).error).toBe(true);
    });

    test('c.error() with data: "" (empty string) includes the "data" field', async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32603, "err", ""),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "err", data: "" },
      });
      expect("data" in (response as any).error).toBe(true);
    });
  });

  // ─── Three-layer middleware exception propagation (Koa model) ───

  describe("three-layer middleware exception propagation (Koa model)", () => {
    test("exception thrown in inner middleware propagates through middle to outer's try/catch on await next()", async () => {
      const order: string[] = [];
      const app = new Fractal()
        // Outer: catches exception
        .use(async (c, next) => {
          order.push("outer-before");
          try {
            await next();
          } catch (e) {
            order.push("outer-catch");
            c.res = c.error(-32000, "Caught: " + (e as Error).message);
          }
          order.push("outer-after");
        })
        // Middle: does NOT catch
        .use(async (_c, next) => {
          order.push("middle-before");
          await next();
          order.push("middle-after");
        })
        // Inner: throws
        .method("boom", () => {
          order.push("handler-throw");
          throw new Error("inner explosion");
        });

      const response = await app.dispatch(makeRequest("boom", {}, 1));

      // The exception from the handler propagates through middle (which does not catch)
      // and is caught by outer's try/catch
      expect(order).toEqual([
        "outer-before",
        "middle-before",
        "handler-throw",
        "outer-catch",
        "outer-after",
      ]);
      // "middle-after" should NOT appear because the exception bypassed it
      expect(order).not.toContain("middle-after");

      expect(response).toMatchObject({
        error: { code: -32000, message: "Caught: inner explosion" },
        id: 1,
      });
    });
  });

  // ─── c.req.id accessible in middleware for normal requests ───

  describe("c.req.id accessible in middleware for normal requests", () => {
    test("middleware reads c.req.id and it matches the request id", async () => {
      let capturedId: unknown;
      const app = new Fractal()
        .use(async (c, next) => {
          capturedId = c.req.id;
          await next();
        })
        .method("ping", (c) => c.json("pong"));

      await app.dispatch(makeRequest("ping", {}, 42));
      expect(capturedId).toBe(42);
    });

    test("middleware reads c.req.id with string id", async () => {
      let capturedId: unknown;
      const app = new Fractal()
        .use(async (c, next) => {
          capturedId = c.req.id;
          await next();
        })
        .method("ping", (c) => c.json("pong"));

      await app.dispatch(makeRequest("ping", {}, "req-abc"));
      expect(capturedId).toBe("req-abc");
    });

    test("middleware reads c.req.id with null id", async () => {
      let capturedId: unknown = "sentinel";
      const app = new Fractal()
        .use(async (c, next) => {
          capturedId = c.req.id;
          await next();
        })
        .method("ping", (c) => c.json("pong"));

      await app.dispatch(makeRequest("ping", {}, null));
      expect(capturedId).toBeNull();
    });
  });

  // ─── c.error() with exactly 2 arguments (no data) ───

  describe("c.error() with 2 arguments (no data)", () => {
    test('c.error(-32000, "msg") with exactly 2 arguments → "data" key absent from error object', async () => {
      const app = new Fractal().method("fail", (c) => c.error(-32000, "msg"));
      const response = await app.dispatch(makeRequest("fail", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32000, message: "msg" },
      });
      expect("data" in (response as any).error).toBe(false);
    });
  });

  // ─── Non-string method field at dispatch() level ───

  describe("non-string method field returns -32601 at dispatch() level", () => {
    // NOTE: The external design spec (section 2.3, step 3) says non-string method
    // should return -32600 Invalid Request. However, that validation is serve()'s
    // responsibility. dispatch() does not validate the method field type — it simply
    // passes the value to router.find(), which won't find a match, resulting in
    // -32601 Method not found. This is expected behavior at the dispatch() level,
    // since dispatch() only handles params validation and route lookup, while
    // serve() handles method field type checking per spec section 2.3 step 3.
    test("method field as number returns -32601 at dispatch() level (not -32600)", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: 123 as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("method field as boolean returns -32601 at dispatch() level (not -32600)", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: true as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test("method field as undefined returns -32601 at dispatch() level (not -32600)", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({
        jsonrpc: "2.0",
        method: undefined as any,
        id: 1,
      });
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });
  });

  // ─── dispatch with method "rpc.discover" returns -32601 ───

  describe("dispatch with reserved rpc. method name from external client", () => {
    test('dispatch with method "rpc.discover" returns -32601 Method not found', async () => {
      // "rpc.discover" cannot be registered (rpc. prefix is reserved),
      // so dispatching it from an external client should yield Method not found.
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch(makeRequest("rpc.discover", {}, 1));
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test('dispatch with method "rpc.listMethods" returns -32601 Method not found', async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch(
        makeRequest("rpc.listMethods", {}, 2),
      );
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 2,
      });
    });

    test('notification with method "rpc.discover" returns void', async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const result = await app.dispatch(makeNotification("rpc.discover"));
      expect(result).toBeUndefined();
    });
  });

  // ─── .use() pattern validation error message verification ───

  describe(".use() pattern validation exact error messages", () => {
    test('empty pattern throws "Invalid pattern: empty string"', () => {
      const app = new Fractal();
      expect(() =>
        app.use("", async (_c, next) => {
          await next();
        }),
      ).toThrow("Invalid pattern: empty string");
    });

    test('leading dot throws "Invalid pattern: leading dot in ..."', () => {
      const app = new Fractal();
      expect(() =>
        app.use(".admin", async (_c, next) => {
          await next();
        }),
      ).toThrow('Invalid pattern: leading dot in ".admin"');
    });

    test('rpc. prefix throws "Invalid pattern: \\"rpc.\\" prefix is reserved"', () => {
      const app = new Fractal();
      expect(() =>
        app.use("rpc.discover", async (_c, next) => {
          await next();
        }),
      ).toThrow('Invalid pattern: "rpc." prefix is reserved');
    });

    test('trailing dot throws "Invalid pattern: trailing dot in ..."', () => {
      const app = new Fractal();
      expect(() =>
        app.use("admin.", async (_c, next) => {
          await next();
        }),
      ).toThrow('Invalid pattern: trailing dot in "admin."');
    });

    test('consecutive dots throws "Invalid pattern: consecutive dots in ..."', () => {
      const app = new Fractal();
      expect(() =>
        app.use("admin..get", async (_c, next) => {
          await next();
        }),
      ).toThrow('Invalid pattern: consecutive dots in "admin..get"');
    });

    test('reserved name "then" throws "Invalid pattern: \\"then\\" is a reserved name"', () => {
      const app = new Fractal();
      expect(() =>
        app.use("then", async (_c, next) => {
          await next();
        }),
      ).toThrow('Invalid pattern: "then" is a reserved name');
    });
  });

  // ─── Middleware catches exception during notification, doesn't set c.res ───

  describe("middleware catches exception during notification, doesn't set c.res", () => {
    test("middleware catches handler exception during notification, swallows it without setting c.res — returns void", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal()
        .use(async (_c, next) => {
          try {
            await next();
          } catch {
            // Swallow the exception but do NOT set c.res or return a response
          }
        })
        .method("boom", () => {
          throw new Error("notification handler exploded");
        });

      const result = await app.dispatch(makeNotification("boom"));
      // Notification always returns void
      expect(result).toBeUndefined();
      // The middleware swallowed the error, so the framework produces a -32603
      // Internal error response internally, but since it's a notification the
      // response is suppressed. No uncaught error propagates, so console.error
      // is not called in this path.
      consoleSpy.mockRestore();
    });

    test("middleware catches handler exception during notification — as a normal request it would return -32603", async () => {
      // Verify the same scenario as a normal request to confirm the -32603 behavior
      const app = new Fractal()
        .use(async (_c, next) => {
          try {
            await next();
          } catch {
            // Swallow the exception but do NOT set c.res or return a response
          }
        })
        .method("boom", () => {
          throw new Error("notification handler exploded");
        });

      const response = await app.dispatch(makeRequest("boom", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "Internal error" },
        id: 1,
      });
    });
  });

  // ─── Middleware returning void without calling next() during notification ───

  describe("middleware returning void without calling next() during notification", () => {
    test("middleware returning void without calling next() during notification — returns void", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal()
        .use((_c, _next) => {
          // Does nothing: no next(), no return, no c.res assignment
        })
        .method("ping", (c) => c.json("pong"));

      const result = await app.dispatch(makeNotification("ping"));
      // Notification always returns void
      expect(result).toBeUndefined();
      // No uncaught exception propagates — the framework detects c.res is unset
      // and produces a -32603 response internally, but for notifications the
      // response is suppressed. console.error is not called in this path.
      consoleSpy.mockRestore();
    });

    test("middleware returning void without calling next() as a normal request returns -32603", async () => {
      // Verify that the same scenario as a normal request produces -32603
      const app = new Fractal()
        .use((_c, _next) => {
          // Does nothing: no next(), no return, no c.res assignment
        })
        .method("ping", (c) => c.json("pong"));

      const response = await app.dispatch(makeRequest("ping", {}, 1));
      expect(response).toMatchObject({
        error: { code: -32603, message: "Internal error" },
        id: 1,
      });
    });
  });

  // ─── c.error() on normal request auto-sets id from c.req.id ───

  describe("c.error() on normal request auto-sets id from c.req.id", () => {
    test("c.error() auto-sets response id to 42 when request id is 42", async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32000, "Custom error"),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 42));
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Custom error" },
        id: 42,
      });
    });

    test("c.error() with data also auto-sets response id from request id", async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32602, "Invalid params", { field: "email" }),
      );
      const response = await app.dispatch(makeRequest("fail", {}, 42));
      expect(response).toEqual({
        jsonrpc: "2.0",
        error: {
          code: -32602,
          message: "Invalid params",
          data: { field: "email" },
        },
        id: 42,
      });
    });
  });

  // ─── dispatch({}) and dispatch({jsonrpc: "2.0"}) minimal requests ───

  describe("dispatch with minimal request objects", () => {
    test("dispatch({}) returns -32601 Method not found", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({ id: 1 } as any);
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
      });
    });

    test('dispatch({jsonrpc: "2.0"}) with id returns -32601 Method not found (no method)', async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const response = await app.dispatch({ jsonrpc: "2.0", id: 1 } as any);
      expect(response).toMatchObject({
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });
    });

    test('dispatch({jsonrpc: "2.0"}) without id returns void (notification with no method)', async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const result = await app.dispatch({ jsonrpc: "2.0" } as any);
      expect(result).toBeUndefined();
    });
  });

  // ─── Notification with null params returns void and logs ───

  describe("notification with null params returns void and logs", () => {
    test("notification with params: null returns void and console.error is called", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const result = await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: null as any,
      });
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Invalid params: expected object, got",
        null,
      );
      consoleSpy.mockRestore();
    });

    test("notification with params: null does not execute handler", async () => {
      const handlerSpy = vi.fn((c: any) => c.json("pong"));
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const app = new Fractal().method("ping", handlerSpy);
      await app.dispatch({
        jsonrpc: "2.0",
        method: "ping",
        params: null as any,
      });
      expect(handlerSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
