import { MiddlewareRegistry, matchPattern } from "./middleware.ts";

describe("core/middleware", () => {
  // ─── Pattern matching ───

  describe("matchPattern", () => {
    // Single-segment wildcard *
    test("* matches single-segment method", () => {
      expect(matchPattern("*", "ping")).toBe(true);
    });

    test("* does not match multi-segment method", () => {
      expect(matchPattern("*", "user.get")).toBe(false);
    });

    // Globstar **
    test("** matches single-segment method", () => {
      expect(matchPattern("**", "ping")).toBe(true);
    });

    test("** matches multi-segment method", () => {
      expect(matchPattern("**", "user.get")).toBe(true);
    });

    test("** matches deeply nested method", () => {
      expect(matchPattern("**", "admin.user.delete")).toBe(true);
    });

    // Prefix with *
    test("admin.* matches admin.delete", () => {
      expect(matchPattern("admin.*", "admin.delete")).toBe(true);
    });

    test("admin.* does not match admin.user.delete", () => {
      expect(matchPattern("admin.*", "admin.user.delete")).toBe(false);
    });

    // Prefix with **
    test("admin.** matches admin.delete", () => {
      expect(matchPattern("admin.**", "admin.delete")).toBe(true);
    });

    test("admin.** matches admin.user.delete", () => {
      expect(matchPattern("admin.**", "admin.user.delete")).toBe(true);
    });

    test("admin.** does not match admin alone", () => {
      expect(matchPattern("admin.**", "admin")).toBe(false);
    });

    // Suffix with *
    test("*.get matches user.get", () => {
      expect(matchPattern("*.get", "user.get")).toBe(true);
    });

    test("*.get does not match get", () => {
      expect(matchPattern("*.get", "get")).toBe(false);
    });

    test("*.get does not match user.detail.get", () => {
      expect(matchPattern("*.get", "user.detail.get")).toBe(false);
    });

    // Suffix with **
    test("**.get matches user.get", () => {
      expect(matchPattern("**.get", "user.get")).toBe(true);
    });

    test("**.get matches user.detail.get", () => {
      expect(matchPattern("**.get", "user.detail.get")).toBe(true);
    });

    test("**.get does not match get (** requires 1+ segments)", () => {
      expect(matchPattern("**.get", "get")).toBe(false);
    });

    test("**.get does not match ping", () => {
      expect(matchPattern("**.get", "ping")).toBe(false);
    });

    // Combined patterns
    test("*.* matches user.get", () => {
      expect(matchPattern("*.*", "user.get")).toBe(true);
    });

    test("*.* does not match ping", () => {
      expect(matchPattern("*.*", "ping")).toBe(false);
    });

    test("*.* does not match admin.user.delete", () => {
      expect(matchPattern("*.*", "admin.user.delete")).toBe(false);
    });

    test("**.* matches user.get", () => {
      expect(matchPattern("**.*", "user.get")).toBe(true);
    });

    test("**.* matches admin.user.delete", () => {
      expect(matchPattern("**.*", "admin.user.delete")).toBe(true);
    });

    test("**.* does not match ping (** needs 1+, then * needs 1)", () => {
      expect(matchPattern("**.*", "ping")).toBe(false);
    });

    // Exact matches
    test("exact match for literal name", () => {
      expect(matchPattern("user.get", "user.get")).toBe(true);
    });

    test("exact match fails for different name", () => {
      expect(matchPattern("user.get", "user.create")).toBe(false);
    });

    // Literal segments containing * characters (not full-segment wildcards)
    test("admin* is treated as literal, not wildcard", () => {
      expect(matchPattern("admin*", "admin")).toBe(false);
      expect(matchPattern("admin*", "admin*")).toBe(true);
    });

    // Deep nested pattern matching
    test("**.admin.** matches a.b.admin.c.d (deep nested with ** on both sides)", () => {
      expect(matchPattern("**.admin.**", "a.b.admin.c.d")).toBe(true);
    });

    test("**.admin.** matches x.admin.y (minimal match on each side)", () => {
      expect(matchPattern("**.admin.**", "x.admin.y")).toBe(true);
    });

    test("**.admin.** does not match admin.c.d (** requires 1+ segments before admin)", () => {
      expect(matchPattern("**.admin.**", "admin.c.d")).toBe(false);
    });

    test("**.admin.** does not match a.b.admin (** requires 1+ segments after admin)", () => {
      expect(matchPattern("**.admin.**", "a.b.admin")).toBe(false);
    });

    test("*.*.* matches exactly 3 segments", () => {
      expect(matchPattern("*.*.*", "a.b.c")).toBe(true);
    });

    test("*.*.* does not match 2 segments", () => {
      expect(matchPattern("*.*.*", "a.b")).toBe(false);
    });

    test("*.*.* does not match 4 segments", () => {
      expect(matchPattern("*.*.*", "a.b.c.d")).toBe(false);
    });

    test("*.*.* does not match 1 segment", () => {
      expect(matchPattern("*.*.*", "ping")).toBe(false);
    });
  });

  // ─── Pattern validation ───

  describe("pattern validation", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("rejects empty string pattern", () => {
      expect(() => registry.add("", vi.fn())).toThrow();
    });

    test("rejects leading dot in pattern", () => {
      expect(() => registry.add(".admin", vi.fn())).toThrow();
    });

    test("rejects trailing dot in pattern", () => {
      expect(() => registry.add("admin.", vi.fn())).toThrow();
    });

    test("rejects consecutive dots in pattern", () => {
      expect(() => registry.add("admin..get", vi.fn())).toThrow();
    });

    test("rejects rpc. prefix in pattern", () => {
      expect(() => registry.add("rpc.discover", vi.fn())).toThrow();
    });

    test("rejects reserved name '$notify' in pattern", () => {
      expect(() => registry.add("$notify", vi.fn())).toThrow();
    });

    test("rejects reserved name 'dispose' in pattern", () => {
      expect(() => registry.add("dispose", vi.fn())).toThrow();
    });

    test("rejects reserved name 'then' in pattern", () => {
      expect(() => registry.add("then", vi.fn())).toThrow();
    });

    test("rejects 'then.check' pattern (reserved first segment)", () => {
      expect(() => registry.add("then.check", vi.fn())).toThrow();
    });

    test("allows wildcard patterns", () => {
      expect(() => registry.add("*", vi.fn())).not.toThrow();
      expect(() => registry.add("**", vi.fn())).not.toThrow();
      expect(() => registry.add("admin.*", vi.fn())).not.toThrow();
      expect(() => registry.add("admin.**", vi.fn())).not.toThrow();
    });

    test("accepts 'admin*' as a valid literal pattern (not a wildcard)", () => {
      expect(() => registry.add("admin*", vi.fn())).not.toThrow();
    });

    test("accepts 'foo*bar' as a valid literal pattern (not a wildcard)", () => {
      expect(() => registry.add("foo*bar", vi.fn())).not.toThrow();
    });
  });

  // ─── Middleware chain execution ───

  describe("chain execution", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("executes middleware in registration order", async () => {
      const order: number[] = [];
      registry.addGlobal(async (_c, next) => {
        order.push(1);
        await next();
      });
      registry.addGlobal(async (_c, next) => {
        order.push(2);
        await next();
      });
      registry.addGlobal(async (_c, next) => {
        order.push(3);
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      await registry.execute("ping", {} as any, handler);
      expect(order).toEqual([1, 2, 3]);
    });

    test("next() delegates to the next middleware", async () => {
      const order: string[] = [];
      registry.addGlobal(async (_c, next) => {
        order.push("before-1");
        await next();
        order.push("after-1");
      });
      registry.addGlobal(async (_c, next) => {
        order.push("before-2");
        await next();
        order.push("after-2");
      });

      const handler = vi.fn((c: any) => {
        order.push("handler");
        return c.json("ok");
      });
      await registry.execute("ping", {} as any, handler);
      expect(order).toEqual([
        "before-1",
        "before-2",
        "handler",
        "after-2",
        "after-1",
      ]);
    });

    test("middleware can short-circuit by returning response without next()", async () => {
      registry.addGlobal((_c, _next) => {
        return {
          jsonrpc: "2.0" as const,
          error: { code: -32000, message: "Blocked" },
          id: 1,
        };
      });

      const handler = vi.fn();
      const result = await registry.execute("ping", {} as any, handler);
      expect(handler).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: { code: -32000 } });
    });

    test("calling next() multiple times throws", async () => {
      registry.addGlobal(async (_c, next) => {
        await next();
        const err = await next().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe("next() called multiple times");
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      await registry.execute("ping", {} as any, handler);
    });

    test("c.res is set after next() completes", async () => {
      let capturedRes: unknown;
      registry.addGlobal(async (c, next) => {
        expect(c.res).toBeUndefined();
        await next();
        capturedRes = c.res;
      });

      const handler = vi.fn((c: any) => c.json("pong"));
      await registry.execute("ping", {} as any, handler);
      expect(capturedRes).toMatchObject({ result: "pong" });
    });

    test("middleware can replace c.res after next()", async () => {
      registry.addGlobal(async (c, next) => {
        await next();
        c.res = { jsonrpc: "2.0" as const, result: "replaced", id: 1 };
      });

      const handler = vi.fn((c: any) => c.json("original"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({ result: "replaced" });
    });

    test("handler exception propagates through next()", async () => {
      let caughtError: unknown;
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (e) {
          caughtError = e;
          throw e;
        }
      });

      const handler = vi.fn(() => {
        throw new Error("boom");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(caughtError).toBeInstanceOf(Error);
      // Re-thrown exception is caught by the framework's outermost catch → -32603
      expect(result).toMatchObject({
        error: { code: -32603, message: "boom" },
      });
    });

    test("middleware can catch exception and provide error response", async () => {
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch {
          c.res = {
            jsonrpc: "2.0" as const,
            error: { code: -32603, message: "Caught" },
            id: 1,
          };
        }
      });

      const handler = vi.fn(() => {
        throw new Error("boom");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        error: { code: -32603, message: "Caught" },
      });
    });

    test("c.res is undefined before calling next()", async () => {
      let resBeforeNext: unknown = "not-checked";
      registry.addGlobal(async (c, next) => {
        resBeforeNext = c.res;
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      await registry.execute("ping", {} as any, handler);
      expect(resBeforeNext).toBeUndefined();
    });

    test("next() called AND JsonRpcResponse returned does not crash (undefined behavior)", async () => {
      registry.addGlobal(async (c, next) => {
        await next();
        return { jsonrpc: "2.0" as const, result: "also-returned", id: 1 };
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      // Spec says behavior is undefined, but it should not throw
      await expect(
        registry.execute("ping", {} as any, handler),
      ).resolves.toBeDefined();
    });

    test("notification flow: middleware executes when c.req.id is undefined", async () => {
      const order: string[] = [];
      registry.addGlobal(async (c, next) => {
        order.push("before");
        expect(c.req.id).toBeUndefined();
        await next();
        order.push("after");
        expect(c.res).toMatchObject({ result: "pong" });
      });

      const handler = vi.fn((c: any) => c.json("pong"));
      // Pass a context without id to simulate notification
      const notificationCtx = {
        req: { method: "ping", params: {}, id: undefined },
        res: undefined,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      const result = await registry.execute(
        "ping",
        notificationCtx as any,
        handler,
      );
      expect(order).toEqual(["before", "after"]);
      expect(result).toMatchObject({ result: "pong" });
    });

    test("notification flow: c.res is populated after next() even without id", async () => {
      let capturedRes: unknown;
      registry.addGlobal(async (c, next) => {
        await next();
        capturedRes = c.res;
      });

      const handler = vi.fn((c: any) => c.json("notification-result"));
      const notificationCtx = {
        req: { method: "log.info", params: {}, id: undefined },
        res: undefined,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      await registry.execute("log.info", notificationCtx as any, handler);
      expect(capturedRes).toMatchObject({ result: "notification-result" });
    });

    test("short-circuit response is also set on c.res", async () => {
      let capturedRes: unknown;
      registry.addGlobal(async (c, next) => {
        await next();
        capturedRes = c.res;
      });
      registry.addGlobal((_c, _next) => {
        return { jsonrpc: "2.0" as const, result: "short", id: 1 };
      });

      const handler = vi.fn();
      await registry.execute("ping", {} as any, handler);
      expect(capturedRes).toMatchObject({ result: "short" });
    });

    test("next() resolves to void (undefined), not the handler's result", async () => {
      let nextReturnValue: unknown = "not-checked";
      registry.addGlobal(async (_c, next) => {
        nextReturnValue = await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      await registry.execute("ping", {} as any, handler);
      expect(nextReturnValue).toBeUndefined();
    });
  });

  // ─── Scoped middleware (pattern-based) ───

  describe("scoped middleware", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("scoped middleware runs only for matching methods", async () => {
      const spy = vi.fn();
      registry.add("admin.*", async (_c, next) => {
        spy();
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));

      await registry.execute("admin.delete", {} as any, handler);
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockClear();
      await registry.execute("user.get", {} as any, handler);
      expect(spy).not.toHaveBeenCalled();
    });

    test("global and scoped middleware execute in registration order", async () => {
      const order: string[] = [];
      registry.addGlobal(async (_c, next) => {
        order.push("global-1");
        await next();
      });
      registry.add("admin.*", async (_c, next) => {
        order.push("scoped");
        await next();
      });
      registry.addGlobal(async (_c, next) => {
        order.push("global-2");
        await next();
      });

      const handler = vi.fn((c: any) => {
        order.push("handler");
        return c.json("ok");
      });
      await registry.execute("admin.delete", {} as any, handler);
      expect(order).toEqual(["global-1", "scoped", "global-2", "handler"]);
    });

    test("non-matching scoped middleware is skipped", async () => {
      const order: string[] = [];
      registry.addGlobal(async (_c, next) => {
        order.push("global");
        await next();
      });
      registry.add("admin.*", async (_c, next) => {
        order.push("admin-only");
        await next();
      });

      const handler = vi.fn((c: any) => {
        order.push("handler");
        return c.json("ok");
      });
      await registry.execute("user.get", {} as any, handler);
      expect(order).toEqual(["global", "handler"]);
    });

    test("multiple scoped middlewares matching same method execute in registration order", async () => {
      const order: string[] = [];
      registry.add("admin.*", async (_c, next) => {
        order.push("admin.*");
        await next();
      });
      registry.add("*.delete", async (_c, next) => {
        order.push("*.delete");
        await next();
      });

      const handler = vi.fn((c: any) => {
        order.push("handler");
        return c.json("ok");
      });
      await registry.execute("admin.delete", {} as any, handler);
      expect(order).toEqual(["admin.*", "*.delete", "handler"]);
    });

    test("** pattern matches all methods", async () => {
      const spy = vi.fn();
      registry.add("**", async (_c, next) => {
        spy();
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      await registry.execute("anything.deep.nested", {} as any, handler);
      expect(spy).toHaveBeenCalled();
    });
  });

  // ─── No response produced ───

  describe("no response produced", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("returns -32603 when middleware does not call next() and returns void", async () => {
      registry.addGlobal((_c, _next) => {});

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({ error: { code: -32603 } });
    });

    test("returns -32603 when middleware returns undefined explicitly", async () => {
      registry.addGlobal((_c, _next) => undefined);

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({ error: { code: -32603 } });
    });
  });

  // ─── Synchronous middleware edge cases ───

  describe("synchronous middleware edge cases", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("sync middleware returning void (bare return) without calling next() results in -32603", async () => {
      registry.addGlobal((_c, _next) => {
        // bare return — neither calls next() nor returns a JsonRpcResponse
        return;
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(handler).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        error: { code: -32603, message: "Internal error" },
      });
    });

    test("sync middleware returning JsonRpcResponse directly short-circuits without next()", async () => {
      registry.addGlobal((_c, _next) => ({
        jsonrpc: "2.0" as const,
        result: "sync-short-circuit",
        id: 1,
      }));

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(handler).not.toHaveBeenCalled();
      expect(result).toMatchObject({ result: "sync-short-circuit" });
    });

    test("sync middleware throwing exception is caught by framework and returns -32603", async () => {
      registry.addGlobal((_c, _next) => {
        throw new TypeError("sync boom");
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        error: { code: -32603, message: "sync boom" },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    test("next() returns a Promise in sync middleware (not directly void)", async () => {
      let nextReturnValue: unknown = "not-checked";
      registry.addGlobal((_c, next) => {
        // Sync middleware calling next() without await — should get a Promise back
        nextReturnValue = next();
        return nextReturnValue;
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      await registry.execute("ping", {} as any, handler);
      // next() is typed as () => Promise<void>, so the return value must be a Promise
      expect(nextReturnValue).toBeInstanceOf(Promise);
    });

    test("sync middleware returning explicit undefined without calling next() results in -32603", async () => {
      registry.addGlobal((_c, _next) => undefined);

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(handler).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        error: { code: -32603, message: "Internal error" },
      });
    });
  });

  // ─── Error handling patterns ───

  describe("error handling patterns", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("middleware catches exception via try/catch and sets c.res with c.error()", async () => {
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch {
          c.res = c.error(-32000, "Handled");
        }
      });

      const handler = vi.fn(() => {
        throw new Error("boom");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        error: { code: -32000, message: "Handled" },
      });
    });

    test("synchronous middleware works correctly", async () => {
      registry.addGlobal((c, next) => next());

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({ result: "ok" });
    });

    test("inner middleware throws, outer catches and recovers", async () => {
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch {
          c.res = {
            jsonrpc: "2.0" as const,
            error: { code: -32603, message: "Recovered" },
            id: 1,
          };
        }
      });
      registry.addGlobal(async (_c, _next) => {
        throw new Error("inner failure");
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        error: { code: -32603, message: "Recovered" },
      });
    });

    test("uncaught exception is caught by framework and returns -32603", async () => {
      const handler = vi.fn(() => {
        throw new Error("unhandled");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        error: { code: -32603, message: "unhandled" },
      });
    });

    test("sync middleware followed by async middleware works correctly", async () => {
      const order: string[] = [];
      registry.addGlobal((c, next) => {
        order.push("sync");
        return next();
      });
      registry.addGlobal(async (_c, next) => {
        order.push("async");
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(order).toEqual(["sync", "async"]);
      expect(result).toMatchObject({ result: "ok" });
    });

    test("async middleware followed by sync middleware works correctly", async () => {
      const order: string[] = [];
      registry.addGlobal(async (_c, next) => {
        order.push("async");
        await next();
      });
      registry.addGlobal((_c, next) => {
        order.push("sync");
        return next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(order).toEqual(["async", "sync"]);
      expect(result).toMatchObject({ result: "ok" });
    });

    test("original Error object is preserved through middleware chain (not wrapped)", async () => {
      const originalError = new TypeError("custom type error");
      let caughtError: unknown;

      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (e) {
          caughtError = e;
          throw e;
        }
      });
      registry.addGlobal(async (_c, next) => {
        await next();
      });

      const handler = vi.fn(() => {
        throw originalError;
      });
      const result = await registry.execute("ping", {} as any, handler);
      // Middleware catches and re-throws the exact same error object
      expect(caughtError).toBe(originalError);
      expect(caughtError).toBeInstanceOf(TypeError);
      expect((caughtError as TypeError).message).toBe("custom type error");
      // Framework's outermost catch produces -32603 with the error message
      expect(result).toMatchObject({
        error: { code: -32603, message: "custom type error" },
      });
    });
  });

  // ─── Exception handling edge cases ───

  describe("exception handling edge cases", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("middleware catches exception but does NOT set c.res and does NOT return response → returns -32603", async () => {
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch {
          // Catch the exception but do nothing — c.res stays undefined, no return value
        }
      });

      const handler = vi.fn(() => {
        throw new Error("boom");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        error: { code: -32603, message: "Internal error" },
      });
    });

    test("3+ layer middleware chain: exception in handler propagates through all layers in reverse order", async () => {
      const catchOrder: string[] = [];

      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (e) {
          catchOrder.push("layer-1");
          throw e;
        }
      });
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (e) {
          catchOrder.push("layer-2");
          throw e;
        }
      });
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (e) {
          catchOrder.push("layer-3");
          throw e;
        }
      });

      const handler = vi.fn(() => {
        throw new Error("deep boom");
      });
      const result = await registry.execute("ping", {} as any, handler);
      // Each layer catches in reverse order (innermost first, then outward)
      expect(catchOrder).toEqual(["layer-3", "layer-2", "layer-1"]);
      // Framework's outermost catch produces -32603
      expect(result).toMatchObject({
        error: { code: -32603, message: "deep boom" },
      });
    });

    test("middleware catches exception and uses c.error() with data parameter", async () => {
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch (e) {
          c.res = c.error(-32000, "Handled with data", {
            detail: (e as Error).message,
            stack: "redacted",
          });
        }
      });

      const handler = vi.fn(() => {
        throw new Error("something broke");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        error: {
          code: -32000,
          message: "Handled with data",
          data: { detail: "something broke", stack: "redacted" },
        },
      });
    });
  });

  // ─── Short-circuit edge cases ───

  describe("short-circuit edge cases", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("first middleware short-circuits → second middleware and handler are NOT called", async () => {
      const secondMiddlewareSpy = vi.fn();
      const handlerSpy = vi.fn();

      registry.addGlobal((_c, _next) => {
        return { jsonrpc: "2.0" as const, result: "blocked-early", id: 1 };
      });
      registry.addGlobal(async (_c, next) => {
        secondMiddlewareSpy();
        await next();
      });

      const handler = vi.fn((c: any) => {
        handlerSpy();
        return c.json("ok");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({ result: "blocked-early" });
      expect(secondMiddlewareSpy).not.toHaveBeenCalled();
      expect(handlerSpy).not.toHaveBeenCalled();
    });

    test("multiple middlewares that would both short-circuit → first one wins", async () => {
      registry.addGlobal((_c, _next) => {
        return { jsonrpc: "2.0" as const, result: "first-wins", id: 1 };
      });
      registry.addGlobal((_c, _next) => {
        return { jsonrpc: "2.0" as const, result: "second-loses", id: 1 };
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({ result: "first-wins" });
    });
  });

  // ─── Notification with id: null ───

  describe("notification with id: null", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("id: null is NOT a notification — it is a normal request with id=null, c.res is set and returned", async () => {
      let capturedId: unknown = "not-checked";
      let capturedRes: unknown;
      registry.addGlobal(async (c, next) => {
        capturedId = c.req.id;
        await next();
        capturedRes = c.res;
      });

      const handler = vi.fn((c: any) => c.json("pong"));
      const ctx = {
        req: { method: "ping", params: {}, id: null },
        res: undefined,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      const result = await registry.execute("ping", ctx as any, handler);
      // id is null, not undefined — this is a regular request
      expect(capturedId).toBeNull();
      expect(handler).toHaveBeenCalled();
      expect(capturedRes).toMatchObject({ result: "pong", id: null });
      expect(result).toMatchObject({ result: "pong", id: null });
    });
  });

  // ─── c.res visibility after short-circuit ───

  describe("c.res visibility after short-circuit", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("when inner middleware short-circuits, outer middleware (after next()) can see c.res", async () => {
      let outerSeenRes: unknown;
      registry.addGlobal(async (c, next) => {
        await next();
        outerSeenRes = c.res;
      });
      registry.addGlobal((_c, _next) => {
        return { jsonrpc: "2.0" as const, result: "short-circuited", id: 1 };
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(outerSeenRes).toMatchObject({ result: "short-circuited" });
      expect(result).toMatchObject({ result: "short-circuited" });
    });
  });

  // ─── Complex global + scoped middleware interleaving ───

  describe("complex global + scoped middleware interleaving", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("5+ layers mixing global and scoped middleware execute in exact registration order", async () => {
      const order: string[] = [];
      // Layer 1: global
      registry.addGlobal(async (_c, next) => {
        order.push("global-1");
        await next();
        order.push("global-1-after");
      });
      // Layer 2: scoped (matches)
      registry.add("admin.*", async (_c, next) => {
        order.push("scoped-admin.*");
        await next();
        order.push("scoped-admin.*-after");
      });
      // Layer 3: global
      registry.addGlobal(async (_c, next) => {
        order.push("global-2");
        await next();
        order.push("global-2-after");
      });
      // Layer 4: scoped (matches)
      registry.add("*.delete", async (_c, next) => {
        order.push("scoped-*.delete");
        await next();
        order.push("scoped-*.delete-after");
      });
      // Layer 5: global
      registry.addGlobal(async (_c, next) => {
        order.push("global-3");
        await next();
        order.push("global-3-after");
      });
      // Layer 6: scoped (does NOT match)
      registry.add("user.*", async (_c, next) => {
        order.push("scoped-user.*");
        await next();
        order.push("scoped-user.*-after");
      });

      const handler = vi.fn((c: any) => {
        order.push("handler");
        return c.json("ok");
      });
      await registry.execute("admin.delete", {} as any, handler);

      // Forward order: global-1 → scoped-admin.* → global-2 → scoped-*.delete → global-3 → handler
      // Reverse after: global-3-after → scoped-*.delete-after → global-2-after → scoped-admin.*-after → global-1-after
      // user.* is skipped entirely
      expect(order).toEqual([
        "global-1",
        "scoped-admin.*",
        "global-2",
        "scoped-*.delete",
        "global-3",
        "handler",
        "global-3-after",
        "scoped-*.delete-after",
        "global-2-after",
        "scoped-admin.*-after",
        "global-1-after",
      ]);
    });

    test("6 layers with some scoped not matching are skipped transparently", async () => {
      const order: string[] = [];
      registry.addGlobal(async (_c, next) => {
        order.push("G1");
        await next();
      });
      registry.add("admin.**", async (_c, next) => {
        order.push("S-admin.**");
        await next();
      });
      registry.addGlobal(async (_c, next) => {
        order.push("G2");
        await next();
      });
      registry.add("user.*", async (_c, next) => {
        order.push("S-user.*");
        await next();
      });
      registry.add("**.get", async (_c, next) => {
        order.push("S-**.get");
        await next();
      });
      registry.addGlobal(async (_c, next) => {
        order.push("G3");
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));

      // Method: "admin.user.get" matches admin.**, **.get, but NOT user.*
      await registry.execute("admin.user.get", {} as any, handler);
      expect(order).toEqual(["G1", "S-admin.**", "G2", "S-**.get", "G3"]);
    });

    test("interleaved global and scoped: scoped middleware can short-circuit before later global runs", async () => {
      const order: string[] = [];
      registry.addGlobal(async (c, next) => {
        order.push("G1");
        await next();
        order.push("G1-after");
      });
      registry.add("admin.*", (_c, _next) => {
        order.push("S-admin.*-shortcircuit");
        return { jsonrpc: "2.0" as const, result: "blocked", id: 1 };
      });
      registry.addGlobal(async (_c, next) => {
        order.push("G2");
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("admin.delete", {} as any, handler);

      expect(order).toEqual(["G1", "S-admin.*-shortcircuit", "G1-after"]);
      expect(result).toMatchObject({ result: "blocked" });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── Wildcard pattern integration with execute ───

  describe("wildcard pattern integration with execute", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("**.delete pattern fires during execution with matching deep method", async () => {
      const spy = vi.fn();
      registry.add("**.delete", async (_c, next) => {
        spy();
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));

      // Should match
      await registry.execute("admin.user.delete", {} as any, handler);
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockClear();
      // Should also match
      await registry.execute("resource.delete", {} as any, handler);
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockClear();
      // Should NOT match (no prefix before delete)
      await registry.execute("delete", {} as any, handler);
      expect(spy).not.toHaveBeenCalled();
    });

    test("**.delete middleware can modify context during matched execution", async () => {
      registry.add("**.delete", async (c, next) => {
        // Simulate an auth check that short-circuits
        if (!c.req.params?.authorized) {
          return c.error(-32000, "Unauthorized delete");
        }
        await next();
      });

      const handler = vi.fn((c: any) => c.json({ deleted: true }));

      // Without authorized param
      const ctx1 = {
        req: { method: "admin.user.delete", params: {}, id: 1 },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: 1,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: 1,
        }),
      };
      const result1 = await registry.execute(
        "admin.user.delete",
        ctx1 as any,
        handler,
      );
      expect(result1).toMatchObject({
        error: { code: -32000, message: "Unauthorized delete" },
      });
      expect(handler).not.toHaveBeenCalled();

      handler.mockClear();

      // With authorized param
      const ctx2 = {
        req: {
          method: "admin.user.delete",
          params: { authorized: true },
          id: 2,
        },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: 2,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: 2,
        }),
      };
      const result2 = await registry.execute(
        "admin.user.delete",
        ctx2 as any,
        handler,
      );
      expect(result2).toMatchObject({ result: { deleted: true } });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("**.delete does not fire for non-matching methods during execution", async () => {
      const spy = vi.fn();
      registry.add("**.delete", async (_c, next) => {
        spy();
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));

      await registry.execute("admin.user.create", {} as any, handler);
      expect(spy).not.toHaveBeenCalled();

      await registry.execute("ping", {} as any, handler);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ─── c.res detailed state transitions ───

  describe("c.res detailed state transitions", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("3 layers: each middleware observes c.res progression before/after next()", async () => {
      const observations: { layer: string; before: unknown; after: unknown }[] =
        [];

      // Outer layer
      registry.addGlobal(async (c, next) => {
        observations.push({ layer: "outer", before: c.res, after: "pending" });
        await next();
        observations.push({
          layer: "outer",
          before: "done",
          after: structuredClone(c.res),
        });
      });

      // Middle layer — replaces c.res after next()
      registry.addGlobal(async (c, next) => {
        observations.push({ layer: "middle", before: c.res, after: "pending" });
        await next();
        observations.push({
          layer: "middle",
          before: "done",
          after: structuredClone(c.res),
        });
        // Replace c.res
        c.res = {
          jsonrpc: "2.0" as const,
          result: "modified-by-middle",
          id: 1,
        };
      });

      // Inner layer
      registry.addGlobal(async (c, next) => {
        observations.push({ layer: "inner", before: c.res, after: "pending" });
        await next();
        observations.push({
          layer: "inner",
          before: "done",
          after: structuredClone(c.res),
        });
      });

      const handler = vi.fn((c: any) => c.json("handler-result"));
      const result = await registry.execute("ping", {} as any, handler);

      // Before next(): c.res is undefined for all layers
      expect(observations[0]).toEqual({
        layer: "outer",
        before: undefined,
        after: "pending",
      });
      expect(observations[1]).toEqual({
        layer: "middle",
        before: undefined,
        after: "pending",
      });
      expect(observations[2]).toEqual({
        layer: "inner",
        before: undefined,
        after: "pending",
      });

      // After next() for inner: sees handler result
      expect(observations[3]).toMatchObject({
        layer: "inner",
        after: { result: "handler-result" },
      });

      // After next() for middle: sees handler result (before it replaces)
      expect(observations[4]).toMatchObject({
        layer: "middle",
        after: { result: "handler-result" },
      });

      // After next() for outer: sees the modified result from middle
      expect(observations[5]).toMatchObject({
        layer: "outer",
        after: { result: "modified-by-middle" },
      });

      // Final result reflects the outermost c.res
      expect(result).toMatchObject({ result: "modified-by-middle" });
    });

    test("4 layers: progressive c.res replacement at each level", async () => {
      const resSnapshots: { layer: number; afterNext: unknown }[] = [];

      registry.addGlobal(async (c, next) => {
        expect(c.res).toBeUndefined();
        await next();
        resSnapshots.push({ layer: 1, afterNext: (c.res as any)?.result });
        c.res = { jsonrpc: "2.0" as const, result: "replaced-by-1", id: 1 };
      });

      registry.addGlobal(async (c, next) => {
        expect(c.res).toBeUndefined();
        await next();
        resSnapshots.push({ layer: 2, afterNext: (c.res as any)?.result });
        c.res = { jsonrpc: "2.0" as const, result: "replaced-by-2", id: 1 };
      });

      registry.addGlobal(async (c, next) => {
        expect(c.res).toBeUndefined();
        await next();
        resSnapshots.push({ layer: 3, afterNext: (c.res as any)?.result });
        c.res = { jsonrpc: "2.0" as const, result: "replaced-by-3", id: 1 };
      });

      registry.addGlobal(async (c, next) => {
        expect(c.res).toBeUndefined();
        await next();
        resSnapshots.push({ layer: 4, afterNext: (c.res as any)?.result });
        // Layer 4 does NOT replace
      });

      const handler = vi.fn((c: any) => c.json("original"));
      const result = await registry.execute("ping", {} as any, handler);

      // Layer 4 (innermost) sees handler result
      expect(resSnapshots[0]).toEqual({ layer: 4, afterNext: "original" });
      // Layer 3 sees handler result (layer 4 didn't replace)
      expect(resSnapshots[1]).toEqual({ layer: 3, afterNext: "original" });
      // Layer 2 sees layer 3's replacement
      expect(resSnapshots[2]).toEqual({ layer: 2, afterNext: "replaced-by-3" });
      // Layer 1 sees layer 2's replacement
      expect(resSnapshots[3]).toEqual({ layer: 1, afterNext: "replaced-by-2" });

      // Final result is layer 1's replacement (outermost)
      expect(result).toMatchObject({ result: "replaced-by-1" });
    });
  });

  // ─── ID boundary values ───

  describe("ID boundary values", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("id: 0 is a normal request (not notification), middleware sees id=0", async () => {
      let capturedId: unknown = "not-checked";
      registry.addGlobal(async (c, next) => {
        capturedId = c.req.id;
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const ctx = {
        req: { method: "ping", params: {}, id: 0 },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: 0,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: 0,
        }),
      };
      const result = await registry.execute("ping", ctx as any, handler);
      expect(capturedId).toBe(0);
      expect(handler).toHaveBeenCalled();
      expect(result).toMatchObject({ result: "ok", id: 0 });
    });

    test('id: "" (empty string) is a normal request, middleware sees id=""', async () => {
      let capturedId: unknown = "not-checked";
      registry.addGlobal(async (c, next) => {
        capturedId = c.req.id;
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const ctx = {
        req: { method: "ping", params: {}, id: "" },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: "",
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: "",
        }),
      };
      const result = await registry.execute("ping", ctx as any, handler);
      expect(capturedId).toBe("");
      expect(handler).toHaveBeenCalled();
      expect(result).toMatchObject({ result: "ok", id: "" });
    });

    test("id: undefined is a notification, middleware still executes and sees id=undefined", async () => {
      let capturedId: unknown = "not-checked";
      let middlewareRan = false;
      registry.addGlobal(async (c, next) => {
        capturedId = c.req.id;
        middlewareRan = true;
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const ctx = {
        req: { method: "ping", params: {}, id: undefined },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      const result = await registry.execute("ping", ctx as any, handler);
      expect(capturedId).toBeUndefined();
      expect(middlewareRan).toBe(true);
      expect(handler).toHaveBeenCalled();
      // Handler still produces a response (framework decides whether to send it)
      expect(result).toMatchObject({ result: "ok" });
    });

    test("id: 0 vs id: undefined distinction is visible in middleware", async () => {
      const ids: unknown[] = [];
      registry.addGlobal(async (c, next) => {
        ids.push(c.req.id);
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));

      // id: 0 — normal request
      const ctx0 = {
        req: { method: "ping", params: {}, id: 0 },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: 0,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: 0,
        }),
      };
      await registry.execute("ping", ctx0 as any, handler);

      // id: undefined — notification
      const ctxUndef = {
        req: { method: "ping", params: {}, id: undefined },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      await registry.execute("ping", ctxUndef as any, handler);

      expect(ids[0]).toBe(0);
      expect(ids[1]).toBeUndefined();
      expect(ids[0] !== ids[1]).toBe(true);
    });

    test("id: null is a normal request (not notification), middleware sees id=null", async () => {
      let capturedId: unknown = "not-checked";
      registry.addGlobal(async (c, next) => {
        capturedId = c.req.id;
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const ctx = {
        req: { method: "ping", params: {}, id: null },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      const result = await registry.execute("ping", ctx as any, handler);
      expect(capturedId).toBeNull();
      expect(handler).toHaveBeenCalled();
      expect(result).toMatchObject({ result: "ok", id: null });
    });
  });

  // ─── Complex exception scenarios ───

  describe("complex exception scenarios", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("inner throw -> middle catches and sets c.res -> outer sees c.res after next()", async () => {
      let outerSeenRes: unknown;

      // Outer middleware
      registry.addGlobal(async (c, next) => {
        expect(c.res).toBeUndefined();
        await next();
        outerSeenRes = c.res;
      });

      // Middle middleware — catches exception and sets c.res
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch {
          c.res = c.error(-32000, "Caught by middle");
        }
      });

      // Inner middleware — throws
      registry.addGlobal(async (_c, next) => {
        await next();
      });

      // Handler throws
      const handler = vi.fn(() => {
        throw new Error("handler-boom");
      });
      const result = await registry.execute("ping", {} as any, handler);

      // Outer should see the error response set by middle
      expect(outerSeenRes).toMatchObject({
        error: { code: -32000, message: "Caught by middle" },
      });
      expect(result).toMatchObject({
        error: { code: -32000, message: "Caught by middle" },
      });
    });

    test("inner throw -> middle catches, sets c.res, outer replaces c.res", async () => {
      registry.addGlobal(async (c, next) => {
        await next();
        // Outer sees middle's error response, replaces it
        expect(c.res).toMatchObject({ error: { code: -32000 } });
        c.res = { jsonrpc: "2.0" as const, result: "outer-override", id: 1 };
      });

      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch {
          c.res = c.error(-32000, "Caught by middle");
        }
      });

      const handler = vi.fn(() => {
        throw new Error("boom");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({ result: "outer-override" });
    });

    test("inner middleware throws, middle does not catch, outer catches and recovers", async () => {
      let outerCaughtError: unknown;

      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch (e) {
          outerCaughtError = e;
          c.res = c.error(-32603, "Outer recovered");
        }
      });

      // Middle middleware — does NOT catch
      registry.addGlobal(async (_c, next) => {
        await next();
      });

      // Inner middleware — throws
      registry.addGlobal(async (_c, _next) => {
        throw new Error("inner-explosion");
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(outerCaughtError).toBeInstanceOf(Error);
      expect((outerCaughtError as Error).message).toBe("inner-explosion");
      expect(result).toMatchObject({
        error: { code: -32603, message: "Outer recovered" },
      });
    });
  });

  // ─── Middleware catches exception then re-throws a different one ───

  describe("middleware catches exception then re-throws a different one", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("middle catches original error and throws a different one, outer sees the new error", async () => {
      let outerCaughtError: unknown;

      // Outer middleware
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch (e) {
          outerCaughtError = e;
          c.res = c.error(-32603, (e as Error).message);
        }
      });

      // Middle middleware — catches and re-throws different error
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (_e) {
          throw new TypeError("transformed-error");
        }
      });

      // Handler throws original error
      const handler = vi.fn(() => {
        throw new Error("original-error");
      });
      const result = await registry.execute("ping", {} as any, handler);

      // Outer should catch the new TypeError, not the original Error
      expect(outerCaughtError).toBeInstanceOf(TypeError);
      expect((outerCaughtError as TypeError).message).toBe("transformed-error");
      expect(result).toMatchObject({
        error: { code: -32603, message: "transformed-error" },
      });
    });

    test("re-thrown error is caught by framework and returns -32603 when no outer catch", async () => {
      // Middle catches and re-throws
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (_e) {
          throw new RangeError("re-thrown-error");
        }
      });

      const handler = vi.fn(() => {
        throw new Error("original");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        error: { code: -32603, message: "re-thrown-error" },
      });
    });

    test("chain: inner throws A, middle catches A and throws B, outer catches B and throws C", async () => {
      // Outer
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (e) {
          expect((e as Error).message).toBe("error-B");
          throw new SyntaxError("error-C");
        }
      });

      // Middle
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (e) {
          expect((e as Error).message).toBe("error-A");
          throw new TypeError("error-B");
        }
      });

      const handler = vi.fn(() => {
        throw new Error("error-A");
      });
      const result = await registry.execute("ping", {} as any, handler);
      // Framework's outermost catch produces -32603 with error-C's message
      expect(result).toMatchObject({
        error: { code: -32603, message: "error-C" },
      });
    });
  });

  // ─── Pattern validation consistency with method constraints ───

  describe("pattern validation consistency with method constraints", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("middleware patterns reject empty string (same as method names)", () => {
      expect(() => registry.add("", vi.fn())).toThrow();
    });

    test("middleware patterns reject leading dot (same as method names)", () => {
      expect(() => registry.add(".admin", vi.fn())).toThrow();
    });

    test("middleware patterns reject trailing dot (same as method names)", () => {
      expect(() => registry.add("admin.", vi.fn())).toThrow();
    });

    test("middleware patterns reject consecutive dots (same as method names)", () => {
      expect(() => registry.add("admin..get", vi.fn())).toThrow();
    });

    test("middleware patterns reject rpc. prefix (same as method names)", () => {
      expect(() => registry.add("rpc.discover", vi.fn())).toThrow();
    });

    test("middleware patterns reject reserved name '$notify' (same as method names)", () => {
      expect(() => registry.add("$notify", vi.fn())).toThrow();
    });

    test("middleware patterns reject reserved name 'dispose' (same as method names)", () => {
      expect(() => registry.add("dispose", vi.fn())).toThrow();
    });

    test("middleware patterns reject reserved name 'then' (same as method names)", () => {
      expect(() => registry.add("then", vi.fn())).toThrow();
    });

    test("middleware patterns reject 'then.check' (reserved first segment, same as method names)", () => {
      expect(() => registry.add("then.check", vi.fn())).toThrow();
    });

    test("middleware patterns reject '$notify.log' (reserved first segment, same as method names)", () => {
      expect(() => registry.add("$notify.log", vi.fn())).toThrow();
    });

    test("middleware patterns reject 'dispose.cleanup' (reserved first segment, same as method names)", () => {
      expect(() => registry.add("dispose.cleanup", vi.fn())).toThrow();
    });

    test("middleware patterns allow wildcard as first segment (unlike method names, which cannot use * or **)", () => {
      expect(() => registry.add("*", vi.fn())).not.toThrow();
      expect(() => registry.add("**", vi.fn())).not.toThrow();
      expect(() => registry.add("*.get", vi.fn())).not.toThrow();
      expect(() => registry.add("**.get", vi.fn())).not.toThrow();
    });

    test("middleware patterns allow reserved name in non-first segment", () => {
      // "user.then" — "then" is not the first segment, so it's allowed
      expect(() => registry.add("user.then", vi.fn())).not.toThrow();
      expect(() => registry.add("admin.dispose", vi.fn())).not.toThrow();
    });

    test("middleware patterns reject single dot '.' (same as method names)", () => {
      expect(() => registry.add(".", vi.fn())).toThrow();
    });

    test("middleware patterns reject double dot '..' (same as method names)", () => {
      expect(() => registry.add("..", vi.fn())).toThrow();
    });

    test("middleware patterns allow non-ASCII characters (same as method names)", () => {
      expect(() => registry.add("ユーザー.取得", vi.fn())).not.toThrow();
    });

    test("middleware pattern 'rpc' without dot is allowed (same as method names)", () => {
      expect(() => registry.add("rpc", vi.fn())).not.toThrow();
    });
  });

  // ─── Uncaught exception → -32603 auto-conversion at outermost level ───

  describe("uncaught exception → -32603 auto-conversion at outermost level", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("middleware throws and no middleware catches → framework returns -32603", async () => {
      registry.addGlobal(async (_c, _next) => {
        throw new Error("middleware-uncaught");
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(handler).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "middleware-uncaught" },
      });
    });

    test("handler throws with no middleware at all → framework returns -32603", async () => {
      // No middleware registered
      const handler = vi.fn(() => {
        throw new Error("handler-uncaught");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "handler-uncaught" },
      });
    });

    test("non-Error throw (string) → framework returns -32603 with fixed 'Internal error' message", async () => {
      registry.addGlobal(async (_c, _next) => {
        throw "string-error";
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
    });

    test("non-Error throw (null) → framework returns -32603 with fixed 'Internal error' message", async () => {
      registry.addGlobal(async (_c, _next) => {
        throw null;
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
    });

    test("uncaught exception with context id → response id matches context", async () => {
      const ctx = {
        req: { method: "ping", params: {}, id: 42 },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: 42,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: 42,
        }),
      };

      registry.addGlobal(async (_c, _next) => {
        throw new Error("boom-with-id");
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", ctx as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "boom-with-id" },
        id: 42,
      });
    });
  });

  // ─── Complex exception chain with 3+ layers ───

  describe("complex exception chain with 3+ layers", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("inner throws A, middle catches A and re-throws B, outer catches B and recovers with c.error()", async () => {
      let outerCaughtError: unknown;

      // Outer middleware — catches Error B and recovers
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch (e) {
          outerCaughtError = e;
          c.res = c.error(-32000, `Recovered: ${(e as Error).message}`);
        }
      });

      // Middle middleware — catches Error A and re-throws Error B
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (e) {
          expect((e as Error).message).toBe("error-A");
          throw new TypeError("error-B");
        }
      });

      // Inner middleware — throws Error A
      registry.addGlobal(async (_c, _next) => {
        throw new Error("error-A");
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);

      // Outer should see Error B (not Error A)
      expect(outerCaughtError).toBeInstanceOf(TypeError);
      expect((outerCaughtError as TypeError).message).toBe("error-B");

      // Final response is from c.error() in the outer middleware
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Recovered: error-B" },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    test("handler throws A, middle catches A and re-throws B, outer catches B and recovers with c.error()", async () => {
      let outerCaughtError: unknown;

      // Outer middleware — catches and recovers
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch (e) {
          outerCaughtError = e;
          c.res = c.error(-32603, (e as Error).message);
        }
      });

      // Middle middleware — catches A and re-throws B
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch (e) {
          expect((e as Error).message).toBe("original-handler-error");
          throw new RangeError("transformed-by-middle");
        }
      });

      // Handler throws Error A
      const handler = vi.fn(() => {
        throw new Error("original-handler-error");
      });
      const result = await registry.execute("ping", {} as any, handler);

      // Outer sees the transformed error (B), not the original (A)
      expect(outerCaughtError).toBeInstanceOf(RangeError);
      expect((outerCaughtError as RangeError).message).toBe(
        "transformed-by-middle",
      );
      expect(result).toMatchObject({
        error: { code: -32603, message: "transformed-by-middle" },
      });
    });
  });

  // ─── 5+ scoped middleware all matching the same method ───

  describe("5+ scoped middleware all matching the same method", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("5 different scoped patterns all matching 'admin.delete' execute in registration order", async () => {
      const order: string[] = [];

      // Pattern 1: admin.** (matches admin.delete)
      registry.add("admin.**", async (_c, next) => {
        order.push("admin.**");
        await next();
      });
      // Pattern 2: **.delete (matches admin.delete)
      registry.add("**.delete", async (_c, next) => {
        order.push("**.delete");
        await next();
      });
      // Pattern 3: *.* (matches admin.delete — exactly 2 segments)
      registry.add("*.*", async (_c, next) => {
        order.push("*.*");
        await next();
      });
      // Pattern 4: admin.* (matches admin.delete)
      registry.add("admin.*", async (_c, next) => {
        order.push("admin.*");
        await next();
      });
      // Pattern 5: ** (matches everything)
      registry.add("**", async (_c, next) => {
        order.push("**");
        await next();
      });

      const handler = vi.fn((c: any) => {
        order.push("handler");
        return c.json("ok");
      });
      const result = await registry.execute("admin.delete", {} as any, handler);

      // All 5 should execute in registration order, followed by the handler
      expect(order).toEqual([
        "admin.**",
        "**.delete",
        "*.*",
        "admin.*",
        "**",
        "handler",
      ]);
      expect(result).toMatchObject({ result: "ok" });
    });

    test("5 scoped patterns: non-matching method skips all 5", async () => {
      const order: string[] = [];

      registry.add("admin.**", async (_c, next) => {
        order.push("admin.**");
        await next();
      });
      registry.add("**.delete", async (_c, next) => {
        order.push("**.delete");
        await next();
      });
      registry.add("*.*", async (_c, next) => {
        order.push("*.*");
        await next();
      });
      registry.add("admin.*", async (_c, next) => {
        order.push("admin.*");
        await next();
      });
      registry.add("**", async (_c, next) => {
        order.push("**");
        await next();
      });

      const handler = vi.fn((c: any) => {
        order.push("handler");
        return c.json("ok");
      });

      // "ping" is a single segment — only "**" matches
      await registry.execute("ping", {} as any, handler);
      expect(order).toEqual(["**", "handler"]);
    });

    test("5 scoped patterns with onion model (before + after) execute in correct order", async () => {
      const order: string[] = [];

      registry.add("admin.**", async (_c, next) => {
        order.push("admin.**-before");
        await next();
        order.push("admin.**-after");
      });
      registry.add("**.delete", async (_c, next) => {
        order.push("**.delete-before");
        await next();
        order.push("**.delete-after");
      });
      registry.add("*.*", async (_c, next) => {
        order.push("*.*-before");
        await next();
        order.push("*.*-after");
      });
      registry.add("admin.*", async (_c, next) => {
        order.push("admin.*-before");
        await next();
        order.push("admin.*-after");
      });
      registry.add("**", async (_c, next) => {
        order.push("**-before");
        await next();
        order.push("**-after");
      });

      const handler = vi.fn((c: any) => {
        order.push("handler");
        return c.json("ok");
      });
      await registry.execute("admin.delete", {} as any, handler);

      expect(order).toEqual([
        "admin.**-before",
        "**.delete-before",
        "*.*-before",
        "admin.*-before",
        "**-before",
        "handler",
        "**-after",
        "admin.*-after",
        "*.*-after",
        "**.delete-after",
        "admin.**-after",
      ]);
    });
  });

  // ─── Async handler support ───

  describe("async handler support", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("async handler returning c.json() works correctly", async () => {
      const handler = async (c: any) => {
        return c.json({ greeting: "hello" });
      };
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        result: { greeting: "hello" },
      });
    });

    test("async handler with await before returning c.json() works correctly", async () => {
      const handler = async (c: any) => {
        await Promise.resolve();
        return c.json({ delayed: true });
      };
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        result: { delayed: true },
      });
    });

    test("async handler works with middleware chain", async () => {
      const order: string[] = [];
      registry.addGlobal(async (_c, next) => {
        order.push("before");
        await next();
        order.push("after");
      });

      const handler = async (c: any) => {
        order.push("handler");
        await Promise.resolve();
        return c.json("async-result");
      };
      const result = await registry.execute("ping", {} as any, handler);
      expect(order).toEqual(["before", "handler", "after"]);
      expect(result).toMatchObject({ result: "async-result" });
    });
  });

  // ─── Framework auto-error -32603 response must not contain data field ───

  describe("framework auto-error -32603 response must not contain data field", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("handler throws Error → auto -32603 response does not have 'data' field", async () => {
      const handler = vi.fn(() => {
        throw new Error("handler-boom");
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "handler-boom" },
      });
      expect("data" in (result as any).error).toBe(false);
    });

    test("middleware throws Error → auto -32603 response does not have 'data' field", async () => {
      registry.addGlobal(async (_c, _next) => {
        throw new Error("middleware-boom");
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "middleware-boom" },
      });
      expect("data" in (result as any).error).toBe(false);
    });

    test("no response produced → auto -32603 response does not have 'data' field", async () => {
      registry.addGlobal(async (_c, _next) => {
        // Does not call next(), does not return a response
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
      expect("data" in (result as any).error).toBe(false);
    });
  });

  // ─── c.error() without data parameter must not include data field ───

  describe("c.error() without data parameter must not include data field", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("c.error(code, message) without data → error object does not have 'data' key", async () => {
      const handler = (c: any) => {
        return c.error(-32000, "Custom error");
      };
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Custom error" },
      });
      expect("data" in (result as any).error).toBe(false);
    });

    test("c.error(code, message, data) with data → error object has 'data' key", async () => {
      const handler = (c: any) => {
        return c.error(-32000, "Custom error", { detail: "extra" });
      };
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Custom error",
          data: { detail: "extra" },
        },
      });
      expect("data" in (result as any).error).toBe(true);
    });

    test("c.error(code, message, undefined) without explicit data → error object does not have 'data' key", async () => {
      const handler = (c: any) => {
        return c.error(-32602, "Invalid params", undefined);
      };
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32602, message: "Invalid params" },
      });
      expect("data" in (result as any).error).toBe(false);
    });

    test("c.error(code, message, null) with null data → error object has 'data' key set to null", async () => {
      const handler = (c: any) => {
        return c.error(-32000, "Null data", null);
      };
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Null data", data: null },
      });
      expect("data" in (result as any).error).toBe(true);
    });
  });

  // ─── Non-Error throw → -32603 response must not contain data field ───

  describe("non-Error throw → -32603 response must not contain data field", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("throw 'string' → -32603 response does not have 'data' field", async () => {
      const handler = vi.fn(() => {
        throw "string-error";
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
      expect("data" in (result as any).error).toBe(false);
    });

    test("throw null → -32603 response does not have 'data' field", async () => {
      const handler = vi.fn(() => {
        throw null;
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
      expect("data" in (result as any).error).toBe(false);
    });

    test("throw undefined → -32603 response does not have 'data' field", async () => {
      const handler = vi.fn(() => {
        throw undefined;
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
      expect("data" in (result as any).error).toBe(false);
    });

    test("throw 42 (number) → -32603 response does not have 'data' field", async () => {
      const handler = vi.fn(() => {
        throw 42;
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
      expect("data" in (result as any).error).toBe(false);
    });

    test("throw {} (plain object) → -32603 response does not have 'data' field", async () => {
      const handler = vi.fn(() => {
        throw { foo: "bar" };
      });
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
      expect("data" in (result as any).error).toBe(false);
    });
  });

  // ─── execute with params normalization via createContext ───

  describe("execute with params normalization via createContext", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("passing plain object as contextOrReq triggers createContext, params are accessible in handler", async () => {
      let capturedParams: unknown;
      const handler = (c: any) => {
        capturedParams = c.req.params;
        return c.json("ok");
      };
      // Pass a plain object (not a Context) — this triggers the createContext path
      await registry.execute("ping", { foo: "bar" } as any, handler);
      expect(capturedParams).toEqual({ foo: "bar" });
    });

    test("passing plain object as contextOrReq creates proper context with json() and error() methods", async () => {
      const handler = (c: any) => {
        // json() should be available from createContext
        return c.json({ value: 42 });
      };
      const result = await registry.execute(
        "test.method",
        { key: "value" } as any,
        handler,
      );
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        result: { value: 42 },
      });
    });

    test("passing plain object as contextOrReq — middleware can access req.method and req.params", async () => {
      let capturedMethod: unknown;
      let capturedParams: unknown;

      registry.addGlobal(async (c, next) => {
        capturedMethod = c.req.method;
        capturedParams = c.req.params;
        await next();
      });

      const handler = (c: any) => c.json("ok");
      await registry.execute("user.get", { id: "123" } as any, handler);
      expect(capturedMethod).toBe("user.get");
      expect(capturedParams).toEqual({ id: "123" });
    });

    test("passing empty object as contextOrReq — params is normalized to {}", async () => {
      let capturedParams: unknown;
      const handler = (c: any) => {
        capturedParams = c.req.params;
        return c.json("ok");
      };
      await registry.execute("ping", {} as any, handler);
      expect(capturedParams).toEqual({});
    });

    test("passing Context object (with json method) uses it directly without createContext", async () => {
      const customJson = vi.fn((data: unknown) => ({
        jsonrpc: "2.0" as const,
        result: data,
        id: 99,
      }));
      const ctx = {
        req: { method: "ping", params: { custom: true }, id: 99 },
        res: undefined as any,
        json: customJson,
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: 99,
        }),
      };

      const handler = (c: any) => c.json("direct-context");
      const result = await registry.execute("ping", ctx as any, handler);
      // The custom json function should have been called
      expect(customJson).toHaveBeenCalledWith("direct-context");
      expect(result).toMatchObject({ result: "direct-context", id: 99 });
    });
  });

  // ─── _lastError reset ───

  describe("_lastError reset", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("_lastError is reset to undefined after a successful execute() following a failed one", async () => {
      // First execute: handler throws → _lastError is set
      const failingHandler = vi.fn(() => {
        throw new Error("fail");
      });
      const errorResult = await registry.execute(
        "ping",
        {} as any,
        failingHandler,
      );
      expect(errorResult).toMatchObject({
        error: { code: -32603, message: "fail" },
      });
      expect(registry._lastError).toBeInstanceOf(Error);
      expect((registry._lastError as Error).message).toBe("fail");

      // Second execute: handler succeeds → _lastError is reset to undefined
      const succeedingHandler = vi.fn((c: any) => c.json("ok"));
      const successResult = await registry.execute(
        "ping",
        {} as any,
        succeedingHandler,
      );
      expect(successResult).toMatchObject({ result: "ok" });
      expect(registry._lastError).toBeUndefined();
    });
  });

  // ─── createContext path: response id ───

  describe("createContext path response id", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("response id is null when plain object (no json method) with id is passed to execute", async () => {
      // Pass a plain object containing an `id` property but without a `json` method.
      // The createContext path receives only (method, params) — the id in the object
      // is treated as part of params, NOT as the request id.
      const plainObj = { id: 42, name: "test" };
      const handler = vi.fn((c: any) => c.json("result"));
      const result = await registry.execute("ping", plainObj as any, handler);
      expect(result).toMatchObject({ jsonrpc: "2.0", result: "result" });
      expect(result.id).toBeNull();
    });

    test("response id is null when plain object (no json method) without id is passed to execute (notification-like)", async () => {
      // Pass a plain object without an `id` property and without a `json` method.
      // The createContext path is used; since no id argument is provided to createContext,
      // responseId is normalized to null.
      const plainObj = { name: "test" };
      const handler = vi.fn((c: any) => c.json("result"));
      const result = await registry.execute("ping", plainObj as any, handler);
      expect(result).toMatchObject({ jsonrpc: "2.0", result: "result" });
      expect(result.id).toBeNull();
    });
  });

  // ─── Global middleware applies to ALL requests ───

  describe("global middleware applies to all requests", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("global middleware fires for every method including methods registered after the middleware", async () => {
      const calls: string[] = [];
      registry.addGlobal(async (c, next) => {
        calls.push(c.req.method);
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));

      await registry.execute("ping", {} as any, handler);
      await registry.execute("user.get", {} as any, handler);
      await registry.execute("admin.user.delete", {} as any, handler);
      await registry.execute("some.deeply.nested.method", {} as any, handler);

      expect(calls).toEqual([
        "ping",
        "user.get",
        "admin.user.delete",
        "some.deeply.nested.method",
      ]);
      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  // ─── Notification exception handling in middleware ───

  describe("notification exception handling in middleware", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("handler exception during notification propagates through middleware chain via next()", async () => {
      let caughtError: unknown;
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch (e) {
          caughtError = e;
          c.res = c.error(-32000, "Caught notification error");
        }
      });

      const handler = vi.fn(() => {
        throw new Error("notification boom");
      });
      const notificationCtx = {
        req: { method: "log.info", params: {}, id: undefined },
        res: undefined,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      const result = await registry.execute(
        "log.info",
        notificationCtx as any,
        handler,
      );
      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe("notification boom");
      expect(result).toMatchObject({
        error: { code: -32000, message: "Caught notification error" },
      });
    });

    test("uncaught handler exception during notification is caught by framework outer catch", async () => {
      const handler = vi.fn(() => {
        throw new Error("uncaught notification boom");
      });
      const notificationCtx = {
        req: { method: "log.info", params: {}, id: undefined },
        res: undefined,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      const result = await registry.execute(
        "log.info",
        notificationCtx as any,
        handler,
      );
      expect(result).toMatchObject({
        error: { code: -32603, message: "uncaught notification boom" },
      });
    });
  });

  // ─── Scoped middleware + exception in handler + outer global recovery ───

  describe("scoped middleware + exception in handler + outer global recovery", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("exception propagates through scoped middleware via next(), global catches it and provides error response", async () => {
      let outerCaughtError: unknown;

      // Layer 1: global middleware (outer) wraps with try/catch
      registry.addGlobal(async (c, next) => {
        try {
          await next();
        } catch (e) {
          outerCaughtError = e;
          c.res = c.error(-32000, `Global recovered: ${(e as Error).message}`);
        }
      });

      // Layer 2: scoped middleware matching admin.*
      const scopedSpy = vi.fn();
      registry.add("admin.*", async (_c, next) => {
        scopedSpy();
        await next();
      });

      // Handler throws
      const handler = vi.fn(() => {
        throw new Error("handler-exploded");
      });
      const result = await registry.execute("admin.delete", {} as any, handler);

      // Scoped middleware was called (it matched)
      expect(scopedSpy).toHaveBeenCalledTimes(1);
      // Handler was called (and threw)
      expect(handler).toHaveBeenCalledTimes(1);
      // Exception propagated through scoped middleware up to global
      expect(outerCaughtError).toBeInstanceOf(Error);
      expect((outerCaughtError as Error).message).toBe("handler-exploded");
      // Global middleware caught and provided error response
      expect(result).toMatchObject({
        error: { code: -32000, message: "Global recovered: handler-exploded" },
      });
    });
  });

  // ─── Scoped middleware skip for non-matching routes ───

  describe("scoped middleware skip for non-matching routes", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("admin.* scoped middleware does NOT fire for user.get while global middleware fires for both", async () => {
      const globalCalls: string[] = [];
      const scopedCalls: string[] = [];

      registry.addGlobal(async (c, next) => {
        globalCalls.push(c.req.method);
        await next();
      });
      registry.add("admin.*", async (c, next) => {
        scopedCalls.push(c.req.method);
        await next();
      });

      const handler = vi.fn((c: any) => c.json("ok"));

      await registry.execute("admin.delete", {} as any, handler);
      await registry.execute("user.get", {} as any, handler);

      expect(globalCalls).toEqual(["admin.delete", "user.get"]);
      expect(scopedCalls).toEqual(["admin.delete"]);
    });
  });

  // ─── params normalization via execute() ───

  describe("params normalization when undefined params is passed to execute()", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("createContext path: plain empty object produces c.req.params as {}", async () => {
      let capturedParams: unknown;
      const handler = (c: any) => {
        capturedParams = c.req.params;
        return c.json("ok");
      };
      // When a plain object (no json method) is passed, createContext is invoked.
      // The object itself becomes params. `params ?? {}` ensures {} for empty object.
      await registry.execute("ping", {} as any, handler);
      expect(capturedParams).toEqual({});
    });

    test("Context with undefined params passed directly — execute uses it as-is", async () => {
      let capturedParams: unknown;
      const handler = (c: any) => {
        capturedParams = c.req.params;
        return c.json("ok");
      };
      // When a full Context object (with json method) is passed, execute() uses it directly.
      // The caller (e.g. dispatch()) is responsible for normalizing params before creating
      // the Context. This test verifies that execute() does NOT re-normalize.
      const ctx = {
        req: { method: "ping", params: undefined as any, id: 1 },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: 1,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: 1,
        }),
      };
      await registry.execute("ping", ctx as any, handler);
      // Context is used directly — params remains undefined as provided
      expect(capturedParams).toBeUndefined();
    });

    test("createContext path: params with values are preserved in c.req.params", async () => {
      let capturedParams: unknown;
      const handler = (c: any) => {
        capturedParams = c.req.params;
        return c.json("ok");
      };
      // When a non-empty plain object is passed, it becomes params directly
      await registry.execute("ping", { name: "Alice" } as any, handler);
      expect(capturedParams).toEqual({ name: "Alice" });
    });
  });

  // ─── c.req.raw is undefined when using execute() ───

  describe("c.req.raw is undefined via execute()", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("execute() does not receive raw, so c.req.raw is undefined when plain object is passed", async () => {
      let capturedRaw: unknown = "not-checked";
      const handler = (c: any) => {
        capturedRaw = c.req.raw;
        return c.json("ok");
      };
      // Pass a plain object (no json method) — createContext is called without raw argument
      await registry.execute("ping", { foo: "bar" } as any, handler);
      expect(capturedRaw).toBeUndefined();
    });

    test("execute() with empty object — c.req.raw is undefined", async () => {
      let capturedRaw: unknown = "not-checked";
      registry.addGlobal(async (c, next) => {
        capturedRaw = c.req.raw;
        await next();
      });

      const handler = (c: any) => c.json("ok");
      await registry.execute("ping", {} as any, handler);
      expect(capturedRaw).toBeUndefined();
    });
  });

  // ─── Notification normal case: middleware executes for id-less requests ───

  describe("notification normal case: middleware executes for id-less requests", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("middleware chain executes normally for notification (no id in request)", async () => {
      const order: string[] = [];
      registry.addGlobal(async (c, next) => {
        order.push("global-before");
        await next();
        order.push("global-after");
      });
      registry.add("log.*", async (c, next) => {
        order.push("scoped-before");
        await next();
        order.push("scoped-after");
      });

      const handler = vi.fn((c: any) => {
        order.push("handler");
        return c.json("logged");
      });

      // Notification context: no id field at all (simulating JSON-RPC notification)
      const notificationCtx = {
        req: { method: "log.info", params: { message: "hello" } },
        res: undefined,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      const result = await registry.execute(
        "log.info",
        notificationCtx as any,
        handler,
      );

      // Middleware and handler execute in normal order even for notification
      expect(order).toEqual([
        "global-before",
        "scoped-before",
        "handler",
        "scoped-after",
        "global-after",
      ]);
      expect(handler).toHaveBeenCalledTimes(1);
      // Result is produced (dispatch layer decides whether to send it)
      expect(result).toMatchObject({ result: "logged" });
    });

    test("notification with scoped middleware: short-circuit works for notification too", async () => {
      registry.add("log.*", (_c, _next) => {
        return {
          jsonrpc: "2.0" as const,
          error: { code: -32000, message: "Blocked notification" },
          id: null,
        };
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const notificationCtx = {
        req: { method: "log.info", params: {} },
        res: undefined,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: null,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: null,
        }),
      };
      const result = await registry.execute(
        "log.info",
        notificationCtx as any,
        handler,
      );

      expect(handler).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        error: { code: -32000, message: "Blocked notification" },
      });
    });
  });

  // ─── _lastError property stores uncaught error ───

  describe("_lastError property stores uncaught error from execute()", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("_lastError is set to the thrown Error when handler throws uncaught exception", async () => {
      const thrownError = new Error("uncaught-for-lastError");
      const handler = vi.fn(() => {
        throw thrownError;
      });
      const result = await registry.execute("ping", {} as any, handler);

      expect(result).toMatchObject({
        error: { code: -32603, message: "uncaught-for-lastError" },
      });
      expect(registry._lastError).toBe(thrownError);
    });

    test("_lastError is set when middleware throws uncaught exception", async () => {
      const thrownError = new TypeError("middleware-uncaught-for-lastError");
      registry.addGlobal(async (_c, _next) => {
        throw thrownError;
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      await registry.execute("ping", {} as any, handler);

      expect(registry._lastError).toBe(thrownError);
    });

    test("_lastError stores non-Error thrown value (string)", async () => {
      const handler = vi.fn(() => {
        throw "string-thrown";
      });
      await registry.execute("ping", {} as any, handler);

      expect(registry._lastError).toBe("string-thrown");
    });

    test("_lastError is undefined initially before any execute()", () => {
      expect(registry._lastError).toBeUndefined();
    });

    test("_lastError is reset to undefined after successful execute() following a failed one", async () => {
      // First: fail
      const failHandler = vi.fn(() => {
        throw new Error("fail");
      });
      await registry.execute("ping", {} as any, failHandler);
      expect(registry._lastError).toBeInstanceOf(Error);

      // Second: succeed
      const successHandler = vi.fn((c: any) => c.json("ok"));
      await registry.execute("ping", {} as any, successHandler);
      expect(registry._lastError).toBeUndefined();
    });
  });

  // ─── Middleware calls next() AND returns JsonRpcResponse (undefined behavior) ───

  describe("middleware calls next() and returns JsonRpcResponse (undefined behavior)", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("next() called AND JsonRpcResponse returned — does not throw, returns a defined result", async () => {
      registry.addGlobal(async (c, next) => {
        await next();
        // Spec says behavior is undefined when next() is called AND a response is returned
        return { jsonrpc: "2.0" as const, result: "also-returned", id: 1 };
      });

      const handler = vi.fn((c: any) => c.json("handler-result"));
      // Should not throw — behavior is undefined but must not crash
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toBeDefined();
      // The result has jsonrpc field (is a valid JsonRpcResponse shape)
      expect((result as any).jsonrpc).toBe("2.0");
    });

    test("next() called AND error response returned — does not throw", async () => {
      registry.addGlobal(async (_c, next) => {
        await next();
        return {
          jsonrpc: "2.0" as const,
          error: { code: -32000, message: "Post-next error" },
          id: 1,
        };
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toBeDefined();
      expect((result as any).jsonrpc).toBe("2.0");
    });

    test("sync middleware calls next() and returns response in same call — does not throw", async () => {
      registry.addGlobal((_c, next) => {
        next(); // fire-and-forget next()
        return { jsonrpc: "2.0" as const, result: "sync-also-returned", id: 1 };
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      // Should not crash
      const result = await registry.execute("ping", {} as any, handler);
      expect(result).toBeDefined();
      expect((result as any).jsonrpc).toBe("2.0");
    });

    test("outer middleware sees c.res from handler even when inner middleware also returns a response after next()", async () => {
      let outerSeenRes: unknown;
      registry.addGlobal(async (c, next) => {
        await next();
        outerSeenRes = c.res;
      });
      registry.addGlobal(async (c, next) => {
        await next();
        // This return after next() is "undefined behavior" per spec
        return {
          jsonrpc: "2.0" as const,
          result: "inner-returned-after-next",
          id: 1,
        };
      });

      const handler = vi.fn((c: any) => c.json("handler-result"));
      await registry.execute("ping", {} as any, handler);
      // c.res is set — the exact value depends on implementation, but it must be defined
      expect(outerSeenRes).toBeDefined();
    });
  });

  // ─── Round 2 review: additional coverage ───

  describe("Round 2 review: additional coverage", () => {
    let registry: InstanceType<typeof MiddlewareRegistry>;

    beforeEach(() => {
      registry = new MiddlewareRegistry();
    });

    test("middleware mutates c.req.params and handler receives the modified value", async () => {
      // Middleware modifies c.req.params before calling next()
      registry.addGlobal(async (c, next) => {
        c.req.params = {
          ...c.req.params,
          injected: "by-middleware",
          role: "admin",
        };
        await next();
      });

      let handlerReceivedParams: unknown;
      const handler = (c: any) => {
        handlerReceivedParams = c.req.params;
        return c.json("ok");
      };

      const ctx = {
        req: { method: "user.get", params: { id: "123" }, id: 1 },
        res: undefined as any,
        json: (data: unknown) => ({
          jsonrpc: "2.0" as const,
          result: data,
          id: 1,
        }),
        error: (code: number, message: string) => ({
          jsonrpc: "2.0" as const,
          error: { code, message },
          id: 1,
        }),
      };
      const result = await registry.execute("user.get", ctx as any, handler);

      // Handler should see the original param plus the middleware-injected ones
      expect(handlerReceivedParams).toEqual({
        id: "123",
        injected: "by-middleware",
        role: "admin",
      });
      expect(result).toMatchObject({ result: "ok" });
    });

    test("middleware returns invalid response (object without jsonrpc field) → treated as no response, returns -32603", async () => {
      // Middleware returns an object that does NOT have `jsonrpc` field
      // The execute() code checks `"jsonrpc" in result` to decide if it's a JsonRpcResponse.
      // Without `jsonrpc`, the return value is NOT recognized as a response,
      // so c.res stays undefined → framework returns -32603 Internal error.
      registry.addGlobal((_c, _next) => {
        return { result: "no-jsonrpc" } as any;
      });

      const handler = vi.fn((c: any) => c.json("ok"));
      const result = await registry.execute("ping", {} as any, handler);

      // handler should NOT be called (middleware didn't call next())
      expect(handler).not.toHaveBeenCalled();
      // Since the returned object lacks jsonrpc, c.res remains undefined → -32603
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
    });

    test("middleware catches handler exception via try/catch, does NOT set c.res, returns void → -32603", async () => {
      // Middleware catches the exception but does not set c.res and does not return a response.
      // c.res remains undefined → framework returns -32603 Internal error.
      registry.addGlobal(async (_c, next) => {
        try {
          await next();
        } catch {
          // Intentionally swallow the exception without setting c.res or returning a response
        }
      });

      const handler = vi.fn(() => {
        throw new Error("handler-exception");
      });
      const result = await registry.execute("ping", {} as any, handler);

      // c.res was never set → framework returns -32603
      expect(result).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
      });
      expect("data" in (result as any).error).toBe(false);
    });
  });
});
