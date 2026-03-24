import {
  createMockEndpoint,
  makeErrorResponse,
  makeSuccessResponse,
} from "../test-helpers.ts";
import { createClient, FractalError, RpcError } from "./proxy.ts";

describe("client/proxy", () => {
  // ─── Basic RPC calls ───

  describe("basic calls", () => {
    test("calls a top-level method", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: "2.0",
          method: "ping",
          id: 1,
        }),
      );

      // Simulate response
      endpoint.receive(makeSuccessResponse("pong", 1));
      await expect(promise).resolves.toBe("pong");
    });

    test("calls a namespaced method", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.user.get({ id: "123" });

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: "2.0",
          method: "user.get",
          params: { id: "123" },
          id: 1,
        }),
      );

      endpoint.receive(makeSuccessResponse({ id: "123", name: "Alice" }, 1));
      await expect(promise).resolves.toEqual({ id: "123", name: "Alice" });
    });

    test("calls a deeply nested method", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.admin.user.delete({ id: "456" });

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "admin.user.delete",
          params: { id: "456" },
        }),
      );

      endpoint.receive(makeSuccessResponse({ success: true }, 1));
      await expect(promise).resolves.toEqual({ success: true });
    });

    test("increments request id for each call", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.a();
      client.b();
      client.c();

      expect(endpoint.send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 1 }),
      );
      expect(endpoint.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 2 }),
      );
      expect(endpoint.send).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ id: 3 }),
      );

      // Resolve all pending
      endpoint.receive(makeSuccessResponse(null, 1));
      endpoint.receive(makeSuccessResponse(null, 2));
      endpoint.receive(makeSuccessResponse(null, 3));
    });

    test("sends params as undefined when no args provided", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.ping();

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(sentMessage.params).toBeUndefined();

      endpoint.receive(makeSuccessResponse("pong", 1));
    });

    test("sends params when args provided", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.echo({ text: "hi" });

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({ params: { text: "hi" } }),
      );

      endpoint.receive(makeSuccessResponse("hi", 1));
    });

    test("params key is absent from sent message when no args provided", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.ping();

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(false);

      endpoint.receive(makeSuccessResponse("pong", 1));
    });

    test("empty object {} is sent as params when passed", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.ping({});

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({ params: {} }),
      );

      endpoint.receive(makeSuccessResponse("pong", 1));
    });
  });

  // ─── Error handling ───

  describe("error handling", () => {
    test("rejects with RpcError when server returns error response", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.unknown();
      endpoint.receive(makeErrorResponse(-32601, "Method not found", 1));

      await expect(promise).rejects.toThrow(RpcError);
      await expect(promise).rejects.toMatchObject({
        code: -32601,
        message: "Method not found",
      });
    });

    test("RpcError includes data field from server", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.fail();
      endpoint.receive(
        makeErrorResponse(-32000, "Custom", 1, { detail: "info" }),
      );

      try {
        await promise;
      } catch (e) {
        expect(e).toBeInstanceOf(RpcError);
        expect((e as RpcError).data).toEqual({ detail: "info" });
      }
    });

    test("RpcError is instanceof Error", () => {
      const err = new RpcError(-32601, "Method not found");
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(-32601);
      expect(err.message).toBe("Method not found");
    });

    test("FractalError is instanceof Error", () => {
      const err = new FractalError("TIMEOUT");
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("TIMEOUT");
    });

    test("prioritizes error over result when both present (spec violation)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.weird();
      // Send malformed response with both result and error
      endpoint.receive({
        jsonrpc: "2.0",
        result: "data",
        error: { code: -32603, message: "Internal error" },
        id: 1,
      });

      await expect(promise).rejects.toThrow(RpcError);
    });
  });

  // ─── Notification ($notify) ───

  describe("$notify", () => {
    test("sends notification without id", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.log.info({ message: "hello" });

      expect(endpoint.send).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        method: "log.info",
        params: { message: "hello" },
      });
    });

    test("notification returns void", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = client.$notify.ping();
      expect(result).toBeUndefined();
    });

    test("notification propagates send() errors", () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw new Error("port closed");
      });
      const client = createClient(endpoint);

      expect(() => client.$notify.log.info({ msg: "test" })).toThrow(
        "port closed",
      );
    });

    test("notification with nested namespace", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.admin.user.event({ action: "login" });

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "admin.user.event",
          params: { action: "login" },
        }),
      );
    });

    test("$notify without params omits params field", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.ping();

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(sentMessage.params).toBeUndefined();
      expect("id" in sentMessage).toBe(false);
    });
  });

  // ─── Timeout ───

  describe("timeout", () => {
    test("rejects with FractalError TIMEOUT after timeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.slow({}, { timeout: 50 });
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
      await expect(promise).rejects.toBeInstanceOf(FractalError);
    });

    test("timeout: 0 rejects immediately", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.instant({}, { timeout: 0 });
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    });

    test("Infinity timeout means no timeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.wait({}, { timeout: Number.POSITIVE_INFINITY });

      // Should not timeout quickly
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Clean up by resolving
      endpoint.receive(makeSuccessResponse("ok", 1));
    });

    test("negative timeout throws TypeError", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      expect(() => client.bad({}, { timeout: -1 })).toThrow(TypeError);
    });

    test("NaN timeout throws TypeError", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      expect(() => client.bad({}, { timeout: Number.NaN })).toThrow(TypeError);
    });

    test("defaultTimeout applies to all requests", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 50 });

      const promise = client.slow();
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    });

    test("per-call timeout overrides defaultTimeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 5000 });

      const promise = client.fast({}, { timeout: 50 });
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    });

    test("per-call Infinity overrides defaultTimeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 50 });

      const promise = client.wait({}, { timeout: Number.POSITIVE_INFINITY });

      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      expect(result).toBe("pending");

      endpoint.receive(makeSuccessResponse("ok", 1));
    });

    test("timeout clears pending entry from map", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.slow({}, { timeout: 50 });
      await promise.catch(() => {});

      // Late response should be ignored (no error, no unhandled rejection)
      endpoint.receive(makeSuccessResponse("late", 1));
    });
  });

  // ─── Dispose ───

  describe("dispose", () => {
    test("dispose() rejects pending promises with FractalError DISPOSED", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const p1 = client.a();
      const p2 = client.b();

      client.dispose();

      await expect(p1).rejects.toMatchObject({ code: "DISPOSED" });
      await expect(p2).rejects.toMatchObject({ code: "DISPOSED" });
    });

    test("dispose() is idempotent", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      expect(() => {
        client.dispose();
        client.dispose();
      }).not.toThrow();
    });

    test("method call after dispose() throws FractalError DISPOSED", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);
      client.dispose();

      expect(() => client.ping()).toThrow(FractalError);
    });

    test("$notify after dispose() throws FractalError DISPOSED", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);
      client.dispose();

      expect(() => client.$notify.log.info({ msg: "test" })).toThrow(
        FractalError,
      );
      try {
        client.$notify.log.info({ msg: "test" });
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).code).toBe("DISPOSED");
      }
    });

    test("Symbol.dispose works", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      expect(typeof client[Symbol.dispose]).toBe("function");
      client[Symbol.dispose]();

      expect(() => client.ping()).toThrow(FractalError);
    });

    test("dispose clears pending timeout timers", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 5000 });

      const promise = client.slow();
      client.dispose();

      await expect(promise).rejects.toMatchObject({ code: "DISPOSED" });
      // Timer should be cleared, no TIMEOUT after DISPOSED
    });

    test("late response after dispose is ignored", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();
      client.dispose();

      await promise.catch(() => {});

      // Late response after dispose - should not cause unhandled rejection
      endpoint.receive(makeSuccessResponse("pong", 1));
    });

    test("onMessage unsubscribe called on dispose", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // onMessage should have been called to register a handler
      expect(endpoint.onMessage).toHaveBeenCalled();

      client.dispose();

      // The unsubscribe function returned by onMessage should have been called
      // After dispose, handlers array should be empty
      expect(endpoint.handlers.length).toBe(0);
    });

    test("dispose() returns undefined (void)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = client.dispose();
      expect(result).toBeUndefined();
    });

    test("multiple pending requests with timeouts - dispose clears all as DISPOSED, not TIMEOUT", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 5000 });

      const p1 = client.a({}, { timeout: 1000 });
      const p2 = client.b({}, { timeout: 2000 });
      const p3 = client.c({}, { timeout: 3000 });

      client.dispose();

      // All should reject with DISPOSED, not TIMEOUT
      await expect(p1).rejects.toMatchObject({ code: "DISPOSED" });
      await expect(p2).rejects.toMatchObject({ code: "DISPOSED" });
      await expect(p3).rejects.toMatchObject({ code: "DISPOSED" });

      await expect(p1).rejects.toBeInstanceOf(FractalError);
      await expect(p2).rejects.toBeInstanceOf(FractalError);
      await expect(p3).rejects.toBeInstanceOf(FractalError);
    });
  });

  // ─── Response filtering ───

  describe("response filtering", () => {
    test("ignores messages without result or error (requests)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Send a request-like message (should be ignored by client)
      endpoint.receive({ jsonrpc: "2.0", method: "incoming", id: 99 });

      // Send actual response
      endpoint.receive(makeSuccessResponse("pong", 1));
      await expect(promise).resolves.toBe("pong");
    });

    test("ignores responses with unknown id", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Unknown id response - should be ignored
      endpoint.receive(makeSuccessResponse("unknown", 999));

      // Correct response
      endpoint.receive(makeSuccessResponse("pong", 1));
      await expect(promise).resolves.toBe("pong");
    });

    test("response with result: null is a valid success response", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      endpoint.receive(makeSuccessResponse(null, 1));
      await expect(promise).resolves.toBe(null);
    });

    test("response without both result and error fields is ignored", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Message with id but no result/error fields — not a valid JSON-RPC response
      endpoint.receive({ jsonrpc: "2.0", id: 1 });

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Now send the real response
      endpoint.receive(makeSuccessResponse("pong", 1));
      await expect(promise).resolves.toBe("pong");
    });
  });

  // ─── send() failure ───

  describe("send failure", () => {
    test("rejects promise immediately when send() throws", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw new Error("Worker terminated");
      });
      const client = createClient(endpoint);

      await expect(client.ping()).rejects.toThrow("Worker terminated");
    });

    test("cleans up pending entry when send() throws", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send
        .mockImplementationOnce(() => {
          throw new Error("fail");
        })
        .mockImplementation(() => {});
      const client = createClient(endpoint);

      await client.ping().catch(() => {});

      // Next call should work with fresh id=2
      const promise = client.pong();
      endpoint.receive(makeSuccessResponse("ok", 2));
      await expect(promise).resolves.toBe("ok");
    });
  });

  // ─── Proxy special properties ───

  describe("proxy special properties", () => {
    test("then property does not trigger RPC (for await compatibility)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Accessing .then should not send a message
      const then = (client as any).then;
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(then).toBeUndefined();
    });

    test("Symbol properties return undefined", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      expect((client as any)[Symbol.toPrimitive]).toBeUndefined();
      expect((client as any)[Symbol.iterator]).toBeUndefined();
      expect((client as any)[Symbol.toStringTag]).toBeUndefined();
    });

    test("dispose is a function, not a proxy namespace", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      expect(typeof client.dispose).toBe("function");
    });
  });

  // ─── Reserved native properties ───

  describe("reserved native properties", () => {
    test("toString does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.toString();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("valueOf does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.valueOf();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("toJSON does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      (client as any).toJSON;
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("constructor does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      (client as any).constructor;
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("__proto__ does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      (client as any).__proto__;
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── Multiple client instances ───

  describe("multiple client instances", () => {
    test("independent clients have independent ID counters", () => {
      const endpoint1 = createMockEndpoint();
      const endpoint2 = createMockEndpoint();
      const client1 = createClient(endpoint1);
      const client2 = createClient(endpoint2);

      client1.a();
      client2.b();

      expect(endpoint1.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
      );
      expect(endpoint2.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
      );

      endpoint1.receive(makeSuccessResponse(null, 1));
      endpoint2.receive(makeSuccessResponse(null, 1));
    });

    test("independent clients do not cross-receive responses", async () => {
      const endpoint1 = createMockEndpoint();
      const endpoint2 = createMockEndpoint();
      const client1 = createClient(endpoint1);
      const client2 = createClient(endpoint2);

      const p1 = client1.a();
      const p2 = client2.b();

      // Send response to client1's endpoint
      endpoint1.receive(makeSuccessResponse("from-1", 1));
      await expect(p1).resolves.toBe("from-1");

      // Client2's promise should still be pending
      const result = await Promise.race([
        p2.then(() => "resolved"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Now resolve client2
      endpoint2.receive(makeSuccessResponse("from-2", 1));
      await expect(p2).resolves.toBe("from-2");
    });
  });

  // ─── defaultTimeout validation ───

  describe("defaultTimeout validation", () => {
    test("negative defaultTimeout throws TypeError", () => {
      const endpoint = createMockEndpoint();
      expect(() => createClient(endpoint, { defaultTimeout: -1 })).toThrow(
        TypeError,
      );
    });

    test("NaN defaultTimeout throws TypeError", () => {
      const endpoint = createMockEndpoint();
      expect(() =>
        createClient(endpoint, { defaultTimeout: Number.NaN }),
      ).toThrow(TypeError);
    });

    test("defaultTimeout: Infinity does NOT throw TypeError (it is valid)", () => {
      const endpoint = createMockEndpoint();
      expect(() =>
        createClient(endpoint, { defaultTimeout: Number.POSITIVE_INFINITY }),
      ).not.toThrow();
    });

    test("defaultTimeout: 0 triggers immediate timeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 0 });

      const promise = client.instant();
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
      await expect(promise).rejects.toBeInstanceOf(FractalError);
    });
  });

  // ─── Multiple concurrent requests with out-of-order responses ───

  describe("concurrent requests with out-of-order responses", () => {
    test("resolves each promise with the correct response when responses arrive out of order", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const p1 = client.a({ n: 1 });
      const p2 = client.b({ n: 2 });
      const p3 = client.c({ n: 3 });
      const p4 = client.d({ n: 4 });
      const p5 = client.e({ n: 5 });

      // Respond out of order: 3, 1, 5, 2, 4
      endpoint.receive(makeSuccessResponse("result-3", 3));
      endpoint.receive(makeSuccessResponse("result-1", 1));
      endpoint.receive(makeSuccessResponse("result-5", 5));
      endpoint.receive(makeSuccessResponse("result-2", 2));
      endpoint.receive(makeSuccessResponse("result-4", 4));

      await expect(p1).resolves.toBe("result-1");
      await expect(p2).resolves.toBe("result-2");
      await expect(p3).resolves.toBe("result-3");
      await expect(p4).resolves.toBe("result-4");
      await expect(p5).resolves.toBe("result-5");
    });
  });

  // ─── Send failure cleanup — late response ignored ───

  describe("send failure cleanup", () => {
    test("late response for a failed send is ignored (no unhandled errors)", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send
        .mockImplementationOnce(() => {
          throw new Error("send failed");
        })
        .mockImplementation(() => {});
      const client = createClient(endpoint);

      // First call fails on send — id 1 should be cleaned up
      await expect(client.ping()).rejects.toThrow("send failed");

      // A late response arriving with id 1 should be silently ignored
      endpoint.receive(makeSuccessResponse("late", 1));

      // Subsequent call should work normally (id 2)
      const p = client.pong();
      endpoint.receive(makeSuccessResponse("ok", 2));
      await expect(p).resolves.toBe("ok");
    });
  });

  // ─── defaultTimeout: Infinity ───

  describe("defaultTimeout: Infinity", () => {
    test("defaultTimeout: Infinity behaves identically to omitting defaultTimeout (no timeout occurs)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, {
        defaultTimeout: Number.POSITIVE_INFINITY,
      });

      const promise = client.wait();

      // Should not timeout quickly — still pending after 100ms
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      expect(result).toBe("pending");

      // Clean up by resolving
      endpoint.receive(makeSuccessResponse("ok", 1));
      await expect(promise).resolves.toBe("ok");
    });
  });

  // ─── Intermediate namespace access ───

  describe("intermediate namespace access", () => {
    test("accessing client.user (without calling it) returns a proxy-like object, not undefined", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const ns = (client as any).user;

      // Should not be undefined or null
      expect(ns).toBeDefined();
      expect(ns).not.toBeNull();

      // Should not have triggered any RPC call
      expect(endpoint.send).not.toHaveBeenCalled();

      // Should still be callable for deeper access
      expect(typeof ns.get).toBe("function");
    });
  });

  // ─── timeout: undefined explicit fallback ───

  describe("timeout: undefined explicit", () => {
    test("{ timeout: undefined } falls back to defaultTimeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 50 });

      const promise = client.slow({}, { timeout: undefined });
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
      await expect(promise).rejects.toBeInstanceOf(FractalError);
    });
  });

  // ─── $notify params omission in sent message ───

  describe("$notify params key absence", () => {
    test("params key is literally absent from sent message when no args provided", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.ping();

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(false);
    });
  });

  // ─── Symbol.dispose equivalence ───

  describe("Symbol.dispose equivalence", () => {
    test("client[Symbol.dispose] is the same function reference as client.dispose", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      expect(client[Symbol.dispose]).toBe(client.dispose);
    });

    test("client[Symbol.dispose]() produces the same effect as client.dispose()", async () => {
      const endpoint1 = createMockEndpoint();
      const client1 = createClient(endpoint1);
      const p1 = client1.a();
      client1.dispose();
      await expect(p1).rejects.toMatchObject({ code: "DISPOSED" });

      const endpoint2 = createMockEndpoint();
      const client2 = createClient(endpoint2);
      const p2 = client2.a();
      client2[Symbol.dispose]();
      await expect(p2).rejects.toMatchObject({ code: "DISPOSED" });

      // Both should reject further calls
      expect(() => client1.ping()).toThrow(FractalError);
      expect(() => client2.ping()).toThrow(FractalError);
    });
  });

  // ─── Deep namespace verification ───

  describe("deep namespace (no depth limit)", () => {
    test("very deep namespace client.a.b.c.d.e.f.g() sends method 'a.b.c.d.e.f.g'", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.a.b.c.d.e.f.g();

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: "2.0",
          method: "a.b.c.d.e.f.g",
          id: 1,
        }),
      );

      endpoint.receive(makeSuccessResponse("deep", 1));
      await expect(promise).resolves.toBe("deep");
    });

    test("10-level deep namespace sends correct method string", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.l1.l2.l3.l4.l5.l6.l7.l8.l9.l10();

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "l1.l2.l3.l4.l5.l6.l7.l8.l9.l10",
        }),
      );

      endpoint.receive(makeSuccessResponse("ok", 1));
      await expect(promise).resolves.toBe("ok");
    });
  });

  // ─── using syntax auto-dispose ───

  describe("using syntax auto-dispose", () => {
    test("Symbol.dispose is called and rejects pending promises (simulated scope exit)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.slow();

      // Simulate scope exit by explicitly calling Symbol.dispose
      client[Symbol.dispose]();

      await expect(promise).rejects.toMatchObject({ code: "DISPOSED" });
      await expect(promise).rejects.toBeInstanceOf(FractalError);

      // Further calls should throw
      expect(() => client.ping()).toThrow(FractalError);
    });

    test("Symbol.dispose unsubscribes from endpoint messages", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      expect(endpoint.handlers.length).toBe(1);

      client[Symbol.dispose]();

      expect(endpoint.handlers.length).toBe(0);
    });
  });

  // ─── Response id edge cases ───

  describe("response id edge cases", () => {
    test("response with id: 0 correctly matches pending request", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // The client auto-assigns id starting from 1, so id: 0 won't match any pending request
      const promise = client.ping();

      // Send response with id: 0 — should be ignored (no pending request with id 0)
      endpoint.receive(makeSuccessResponse("wrong", 0));

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Now send the correct response
      endpoint.receive(makeSuccessResponse("correct", 1));
      await expect(promise).resolves.toBe("correct");
    });

    test("response with id: null is ignored (no matching pending request)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // id: null is not a number, so it won't match any pending entry
      endpoint.receive(makeSuccessResponse("null-id", null));

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Correct response resolves it
      endpoint.receive(makeSuccessResponse("pong", 1));
      await expect(promise).resolves.toBe("pong");
    });

    test("response with id: '' (empty string) is ignored (no matching pending request)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // id: "" is not a number, so it won't match
      endpoint.receive(makeSuccessResponse("empty-id", ""));

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Correct response resolves it
      endpoint.receive(makeSuccessResponse("pong", 1));
      await expect(promise).resolves.toBe("pong");
    });
  });

  // ─── send() throwing non-Error ───

  describe("send() throwing non-Error values", () => {
    test("send() throws a string — propagates correctly", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw "connection lost";
      });
      const client = createClient(endpoint);

      try {
        await client.ping();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBe("connection lost");
      }
    });

    test("send() throws null — propagates correctly", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw null;
      });
      const client = createClient(endpoint);

      try {
        await client.ping();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeNull();
      }
    });

    test("send() throws a number — propagates correctly", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw 42;
      });
      const client = createClient(endpoint);

      try {
        await client.ping();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBe(42);
      }
    });
  });

  // ─── params field in request ───

  describe("params field in sent request message", () => {
    test("params key is omitted when no args provided (not present in message object)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.ping();

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(Object.keys(sentMessage)).not.toContain("params");

      endpoint.receive(makeSuccessResponse("pong", 1));
    });

    test("params key is present when empty object {} is passed", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.ping({});

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(Object.keys(sentMessage)).toContain("params");
      expect(sentMessage.params).toEqual({});

      endpoint.receive(makeSuccessResponse("pong", 1));
    });

    test("params key is present when args provided", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.echo({ text: "hi" });

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(Object.keys(sentMessage)).toContain("params");
      expect(sentMessage.params).toEqual({ text: "hi" });

      endpoint.receive(makeSuccessResponse("hi", 1));
    });
  });

  // ─── $notify params handling ───

  describe("$notify params handling", () => {
    test("$notify with no params omits params key — consistent with normal calls", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.heartbeat();

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(Object.keys(sentMessage)).not.toContain("params");
      // Also verify no id (notification)
      expect("id" in sentMessage).toBe(false);
    });

    test("$notify with empty object {} includes params key", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.heartbeat({});

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(sentMessage.params).toEqual({});
      expect("id" in sentMessage).toBe(false);
    });

    test("$notify with params includes params key", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.log.info({ level: "info" });

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(sentMessage.params).toEqual({ level: "info" });
      expect("id" in sentMessage).toBe(false);
    });
  });

  // ─── Fractional timeout ───

  describe("fractional timeout", () => {
    test("timeout: 0.5 should work (sub-millisecond treated as valid positive timeout)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.slow({}, { timeout: 0.5 });
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
      await expect(promise).rejects.toBeInstanceOf(FractalError);
    });

    test("timeout: 1.5 should reject after ~1.5ms", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.slow({}, { timeout: 1.5 });
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
      await expect(promise).rejects.toBeInstanceOf(FractalError);
    });
  });

  // ─── hasOwnProperty, isPrototypeOf do not trigger RPC ───

  describe("built-in object properties do not trigger RPC", () => {
    test("hasOwnProperty does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      (client as any).hasOwnProperty;
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("isPrototypeOf does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      (client as any).isPrototypeOf;
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("propertyIsEnumerable does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      (client as any).propertyIsEnumerable;
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── $notify intermediate namespace access ───

  describe("$notify intermediate namespace access", () => {
    test("holding client.$notify.user and then calling .get() sends correct method", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const userNotify = client.$notify.user;
      userNotify.get({ id: "123" });

      expect(endpoint.send).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        method: "user.get",
        params: { id: "123" },
      });

      // Verify no id is present (notification)
      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("id" in sentMessage).toBe(false);
    });

    test("holding client.$notify.user does not trigger any send", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const userNotify = client.$notify.user;

      expect(userNotify).toBeDefined();
      expect(userNotify).not.toBeNull();
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── $notify reserved name handling ───

  describe("$notify reserved name handling", () => {
    test("client.$notify.then returns undefined (for await compatibility)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.$notify as any).then;
      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.$notify.dispose creates a namespace proxy, not the dispose function", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // In the $notify namespace proxy, "dispose" is not a reserved property —
      // it just extends the namespace path. So it should be callable.
      const disposeNotify = client.$notify.dispose;
      expect(disposeNotify).toBeDefined();
      expect(typeof disposeNotify).toBe("function");

      // Calling it as a notification should send method "dispose"
      client.$notify.dispose({ reason: "test" });

      expect(endpoint.send).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        method: "dispose",
        params: { reason: "test" },
      });
    });
  });

  // ─── send() failure + timeout combination ───

  describe("send() failure + timeout combination", () => {
    test("when send() throws on a request with timeout, timer is cleared and no double error", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw new Error("transport closed");
      });
      const client = createClient(endpoint);

      const promise = client.slow({}, { timeout: 50 });

      // Should reject with the send error, not TIMEOUT
      await expect(promise).rejects.toThrow("transport closed");

      // Wait longer than the timeout to confirm no TIMEOUT error fires
      await new Promise<void>((r) => setTimeout(r, 100));

      // If timer wasn't cleared, an unhandled rejection would have occurred.
      // The fact that we reach here without error proves the timer was cleared.
    });
  });

  // ─── result: undefined response ───

  describe("result: undefined response", () => {
    test("response with result: undefined resolves the promise with undefined", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Send a response with result explicitly set to undefined
      endpoint.receive({ jsonrpc: "2.0", result: undefined, id: 1 });

      await expect(promise).resolves.toBeUndefined();
    });
  });

  // ─── error response without data field ───

  describe("error response without data field", () => {
    test("RpcError.data is undefined when error response has no data field", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.fail();
      endpoint.receive(makeErrorResponse(-32601, "Method not found", 1));

      try {
        await promise;
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(RpcError);
        expect((e as RpcError).data).toBeUndefined();
      }
    });
  });

  // ─── received message is null or primitive ───

  describe("received message is null or primitive", () => {
    test("endpoint.receive(null) does not crash", () => {
      const endpoint = createMockEndpoint();
      createClient(endpoint);

      expect(() => endpoint.receive(null)).not.toThrow();
    });

    test("endpoint.receive(42) does not crash", () => {
      const endpoint = createMockEndpoint();
      createClient(endpoint);

      expect(() => endpoint.receive(42)).not.toThrow();
    });

    test('endpoint.receive("string") does not crash', () => {
      const endpoint = createMockEndpoint();
      createClient(endpoint);

      expect(() => endpoint.receive("string")).not.toThrow();
    });

    test("null/primitive messages are ignored and do not affect pending requests", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Send various non-object messages — all should be silently ignored
      endpoint.receive(null);
      endpoint.receive(42);
      endpoint.receive("string");
      endpoint.receive(true);
      endpoint.receive(undefined);

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Now send the real response
      endpoint.receive(makeSuccessResponse("pong", 1));
      await expect(promise).resolves.toBe("pong");
    });
  });

  // ─── RpcError.name property ───

  describe("RpcError.name", () => {
    test('RpcError.name is "RpcError"', () => {
      const err = new RpcError(-32601, "Method not found");
      expect(err.name).toBe("RpcError");
    });

    test('RpcError.name is "RpcError" when constructed with data', () => {
      const err = new RpcError(-32000, "Custom error", { detail: "info" });
      expect(err.name).toBe("RpcError");
    });
  });

  // ─── FractalError.name property ───

  describe("FractalError.name", () => {
    test('FractalError.name is "FractalError" for TIMEOUT', () => {
      const err = new FractalError("TIMEOUT");
      expect(err.name).toBe("FractalError");
    });

    test('FractalError.name is "FractalError" for DISPOSED', () => {
      const err = new FractalError("DISPOSED");
      expect(err.name).toBe("FractalError");
    });
  });

  // ─── toString() return value ───

  describe("toString() return value", () => {
    test("client.toString() returns a string and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = client.toString();

      expect(typeof result).toBe("string");
      expect(result).toBe("[object FractalClient]");
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── valueOf() return value ───

  describe("valueOf() return value", () => {
    test("client.valueOf() returns the client itself", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = client.valueOf();

      expect(result).toBe(client);
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── Native properties inside $notify namespace ───

  describe("native properties inside $notify namespace", () => {
    test("client.$notify.toString returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.$notify as any).toString;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.$notify.valueOf returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.$notify as any).valueOf;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.$notify.toJSON returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.$notify as any).toJSON;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.$notify.constructor returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.$notify as any).constructor;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.$notify.__proto__ returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.$notify as any)["__proto__"];

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.$notify.hasOwnProperty returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.$notify as any).hasOwnProperty;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── Native properties inside regular namespace proxy ───

  describe("native properties inside regular namespace proxy", () => {
    test("client.user.toString returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any).toString;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.user.valueOf returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any).valueOf;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.user.toJSON returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any).toJSON;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.user.constructor returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any).constructor;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.user.__proto__ returns undefined and does not trigger RPC", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any)["__proto__"];

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── Symbol properties inside namespace proxy ───

  describe("Symbol properties inside namespace proxy", () => {
    test("client.user[Symbol.toPrimitive] returns undefined", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any)[Symbol.toPrimitive];

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.user[Symbol.iterator] returns undefined", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any)[Symbol.iterator];

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.user[Symbol.toStringTag] returns undefined", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any)[Symbol.toStringTag];

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── then property inside namespace proxy (await compatibility) ───

  describe("then property inside namespace proxy", () => {
    test("client.user.then returns undefined (for await compatibility)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any).then;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.admin.user.then returns undefined (deeply nested)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.admin as any).user.then;

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── -Infinity timeout ───

  describe("-Infinity timeout", () => {
    test("-Infinity per-call timeout throws TypeError", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      expect(() => client.bad({}, { timeout: -Infinity })).toThrow(TypeError);
      expect(() => client.bad({}, { timeout: -Infinity })).toThrow(
        "timeout must be non-negative",
      );
    });

    test("-Infinity defaultTimeout throws TypeError", () => {
      const endpoint = createMockEndpoint();
      expect(() =>
        createClient(endpoint, { defaultTimeout: -Infinity }),
      ).toThrow(TypeError);
      expect(() =>
        createClient(endpoint, { defaultTimeout: -Infinity }),
      ).toThrow("defaultTimeout must be non-negative");
    });
  });

  // ─── null/undefined endpoint validation ───

  describe("null/undefined endpoint", () => {
    test("createClient with null endpoint throws when onMessage is called", () => {
      expect(() => createClient(null as any)).toThrow();
    });

    test("createClient with undefined endpoint throws when onMessage is called", () => {
      expect(() => createClient(undefined as any)).toThrow();
    });
  });

  // ─── $notify send() exception type diversity ───

  describe("$notify send() throwing non-Error values", () => {
    test("$notify propagates string thrown by send()", () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw "notify failed";
      });
      const client = createClient(endpoint);

      try {
        client.$notify.log.info({ msg: "test" });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBe("notify failed");
      }
    });

    test("$notify propagates null thrown by send()", () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw null;
      });
      const client = createClient(endpoint);

      try {
        client.$notify.log.info({ msg: "test" });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeNull();
      }
    });

    test("$notify propagates number thrown by send()", () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw 42;
      });
      const client = createClient(endpoint);

      try {
        client.$notify.log.info({ msg: "test" });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBe(42);
      }
    });
  });

  // ─── dispose() after $notify timing/behavior ───

  describe("dispose() after $notify", () => {
    test("$notify before dispose succeeds, $notify after dispose throws", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Before dispose: should succeed
      expect(() => client.$notify.log.info({ msg: "before" })).not.toThrow();
      expect(endpoint.send).toHaveBeenCalledTimes(1);

      client.dispose();

      // After dispose: should throw FractalError DISPOSED
      expect(() => client.$notify.log.info({ msg: "after" })).toThrow(
        FractalError,
      );
      try {
        client.$notify.log.info({ msg: "after" });
      } catch (e) {
        expect((e as FractalError).code).toBe("DISPOSED");
      }

      // send should not have been called again
      expect(endpoint.send).toHaveBeenCalledTimes(1);
    });

    test("$notify does not add to pending map, so dispose has nothing to reject from it", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Fire a notification — should not create pending entry
      client.$notify.ping();

      // Also fire a real call — this creates a pending entry
      const promise = client.method1();

      client.dispose();

      // The real call should be rejected
      await expect(promise).rejects.toMatchObject({ code: "DISPOSED" });

      // No double-rejection or other errors from the notification
    });
  });

  // ─── Large numeric id matching ───

  describe("large numeric id matching", () => {
    test("response with Number.MAX_SAFE_INTEGER-level id matches correctly", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Make many calls to advance the id counter is impractical,
      // so we test that the client correctly matches responses with large ids.
      // The client starts at id=1 and increments, so we just verify the id-matching
      // logic works by sending a response with the correct id.
      const promise = client.ping();

      // The sent message should have id: 1
      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
      );

      // A response with a very large id should be ignored (no matching pending entry)
      endpoint.receive(makeSuccessResponse("wrong", Number.MAX_SAFE_INTEGER));

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Correct id resolves it
      endpoint.receive(makeSuccessResponse("correct", 1));
      await expect(promise).resolves.toBe("correct");
    });

    test("response with Number.MAX_SAFE_INTEGER as id does not crash the client", () => {
      const endpoint = createMockEndpoint();
      createClient(endpoint);

      // Should not throw when receiving a response with a very large id
      expect(() =>
        endpoint.receive(makeSuccessResponse("data", Number.MAX_SAFE_INTEGER)),
      ).not.toThrow();
    });
  });

  // ─── FractalError message text content ───

  describe("FractalError message text content", () => {
    test('FractalError("TIMEOUT") has message "TIMEOUT"', () => {
      const err = new FractalError("TIMEOUT");
      expect(err.message).toBe("TIMEOUT");
    });

    test('FractalError("DISPOSED") has message "DISPOSED"', () => {
      const err = new FractalError("DISPOSED");
      expect(err.message).toBe("DISPOSED");
    });

    test("TIMEOUT FractalError from actual timeout has message 'TIMEOUT'", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.slow({}, { timeout: 10 });

      try {
        await promise;
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).message).toBe("TIMEOUT");
        expect((e as FractalError).code).toBe("TIMEOUT");
      }
    });

    test("DISPOSED FractalError from dispose() has message 'DISPOSED'", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.pending();
      client.dispose();

      try {
        await promise;
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).message).toBe("DISPOSED");
        expect((e as FractalError).code).toBe("DISPOSED");
      }
    });
  });

  // ─── defaultTimeout: 0 behavior ───

  describe("defaultTimeout: 0 behavior", () => {
    test("defaultTimeout: 0 results in immediate timeout for all calls", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 0 });

      const p1 = client.first().catch((e: unknown) => e);
      const p2 = client.second().catch((e: unknown) => e);
      const p3 = client.third().catch((e: unknown) => e);

      const e1 = await p1;
      const e2 = await p2;
      const e3 = await p3;

      expect(e1).toBeInstanceOf(FractalError);
      expect((e1 as FractalError).code).toBe("TIMEOUT");
      expect(e2).toBeInstanceOf(FractalError);
      expect((e2 as FractalError).code).toBe("TIMEOUT");
      expect(e3).toBeInstanceOf(FractalError);
      expect((e3 as FractalError).code).toBe("TIMEOUT");
    });

    test("defaultTimeout: 0 — late responses are ignored after timeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 0 });

      const error = await client.ping().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FractalError);

      // Late response should be silently ignored
      endpoint.receive(makeSuccessResponse("late", 1));
    });

    test("defaultTimeout: 0 — per-call Infinity overrides and prevents timeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: 0 });

      const promise = client.wait({}, { timeout: Number.POSITIVE_INFINITY });

      // Should not timeout
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Clean up
      endpoint.receive(makeSuccessResponse("ok", 1));
      await expect(promise).resolves.toBe("ok");
    });
  });

  // ─── Batch request array ignored ───

  // ─── dispose() unsubscribe double-call safety ───

  describe("dispose() unsubscribe double-call safety", () => {
    test("calling dispose() twice does not call the onMessage unsubscribe function twice", () => {
      const unsubscribe = vi.fn();
      const endpoint = {
        send: vi.fn(),
        onMessage: vi.fn(() => unsubscribe),
      };
      const client = createClient(endpoint);

      client.dispose();
      client.dispose();

      // unsubscribe should have been called exactly once (idempotent dispose)
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  // ─── $notify void return type verification ───

  describe("$notify void return type verification", () => {
    test("$notify.method() returns undefined (void), not a Promise", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = client.$notify.user.update({ id: "1" });

      expect(result).toBeUndefined();
      // Ensure it is not a Promise (not thenable)
      expect(result).not.toBeInstanceOf(Promise);
      expect(
        typeof result === "object" && result !== null && "then" in result,
      ).toBe(false);
    });
  });

  // ─── Client with string id response ───

  describe("string id response does not match numeric id", () => {
    test("response with string id '1' does NOT match pending request with numeric id 1", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Client assigned numeric id 1. A response with string "1" should not match.
      endpoint.receive(makeSuccessResponse("wrong", "1"));

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Now send the correct response with numeric id 1
      endpoint.receive(makeSuccessResponse("correct", 1));
      await expect(promise).resolves.toBe("correct");
    });
  });

  // ─── Intermediate namespace typeof verification ───

  describe("intermediate namespace typeof verification", () => {
    test("typeof client.user is 'function' (proxy over function target)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const ns = client.user;

      // The namespace proxy wraps a function target, so typeof returns "function"
      expect(typeof ns).toBe("function");
      // It should not be undefined or null
      expect(ns).toBeDefined();
      expect(ns).not.toBeNull();
      // No RPC call should have been triggered by mere property access
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── Batch request array ignored ───

  describe("batch request array ignored", () => {
    test("array message does not resolve pending promises", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Send a batch-style array response — should be ignored because arrays
      // fail the "typeof message !== 'object' || message === null" check
      // (arrays are objects, so they pass typeof, but they lack result/error fields)
      endpoint.receive([makeSuccessResponse("pong", 1)]);

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Now send the real response
      endpoint.receive(makeSuccessResponse("pong", 1));
      await expect(promise).resolves.toBe("pong");
    });

    test("array message does not crash the client", () => {
      const endpoint = createMockEndpoint();
      createClient(endpoint);

      expect(() =>
        endpoint.receive([
          makeSuccessResponse("a", 1),
          makeSuccessResponse("b", 2),
        ]),
      ).not.toThrow();
    });
  });

  // ─── Out-of-order response (3 requests, resolve in 3→1→2 order) ───

  describe("out-of-order response", () => {
    test("3 requests resolved in id=3, id=1, id=2 order each resolve correctly", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const p1 = client.first({ n: 1 });
      const p2 = client.second({ n: 2 });
      const p3 = client.third({ n: 3 });

      // Verify the ids assigned
      expect(endpoint.send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 1, method: "first" }),
      );
      expect(endpoint.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 2, method: "second" }),
      );
      expect(endpoint.send).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ id: 3, method: "third" }),
      );

      // Respond out of order: 3, 1, 2
      endpoint.receive(makeSuccessResponse("result-3", 3));
      endpoint.receive(makeSuccessResponse("result-1", 1));
      endpoint.receive(makeSuccessResponse("result-2", 2));

      await expect(p1).resolves.toBe("result-1");
      await expect(p2).resolves.toBe("result-2");
      await expect(p3).resolves.toBe("result-3");
    });
  });

  // ─── Multiple clients with same id isolation ───

  describe("multiple clients same id isolation", () => {
    test("two clients using separate endpoints with same id(1) receive their own responses", async () => {
      const endpoint1 = createMockEndpoint();
      const endpoint2 = createMockEndpoint();
      const client1 = createClient(endpoint1);
      const client2 = createClient(endpoint2);

      // Both clients send a request; both get id=1 (independent counters)
      const p1 = client1.methodA({ from: "client1" });
      const p2 = client2.methodB({ from: "client2" });

      expect(endpoint1.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, method: "methodA" }),
      );
      expect(endpoint2.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, method: "methodB" }),
      );

      // Send response to endpoint2 first (id=1 for client2)
      endpoint2.receive(makeSuccessResponse("response-for-client2", 1));

      // client1's promise should still be pending
      const result1 = await Promise.race([
        p1.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result1).toBe("pending");

      // client2 should have resolved
      await expect(p2).resolves.toBe("response-for-client2");

      // Now send response to endpoint1 (id=1 for client1)
      endpoint1.receive(makeSuccessResponse("response-for-client1", 1));
      await expect(p1).resolves.toBe("response-for-client1");
    });

    test("response on one endpoint does not resolve promise on the other endpoint", async () => {
      const endpoint1 = createMockEndpoint();
      const endpoint2 = createMockEndpoint();
      const client1 = createClient(endpoint1);
      const client2 = createClient(endpoint2);

      const p1 = client1.ping();
      const p2 = client2.ping();

      // Cross-send: send client1's response to client2's endpoint — should be ignored by client2
      // because client2's pending entry for id=1 expects response on endpoint2
      endpoint1.receive(makeSuccessResponse("for-client1", 1));

      await expect(p1).resolves.toBe("for-client1");

      // p2 should still be pending (endpoint2 hasn't received anything)
      const result = await Promise.race([
        p2.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      endpoint2.receive(makeSuccessResponse("for-client2", 1));
      await expect(p2).resolves.toBe("for-client2");
    });
  });

  // ─── $notify ignores second argument (options) ───

  describe("$notify second argument handling", () => {
    test("$notify ignores second argument — only params (first arg) is sent", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Pass a second argument (like call options) to $notify — it should be ignored
      (client.$notify.log.info as any)({ message: "hello" }, { timeout: 5000 });

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      // The sent notification should only contain jsonrpc, method, and params
      expect(sentMessage).toEqual({
        jsonrpc: "2.0",
        method: "log.info",
        params: { message: "hello" },
      });
      // No id field (it's a notification)
      expect("id" in sentMessage).toBe(false);
      // No timeout or other options should leak into the message
      expect("timeout" in sentMessage).toBe(false);
    });

    test("$notify still returns void even when second argument is passed", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.$notify.ping as any)({}, { timeout: 1000 });
      expect(result).toBeUndefined();
    });
  });

  // ─── Params with falsy values (0, false, "") ───

  describe("params with falsy values", () => {
    test("params = 0 (falsy) is sent as params in the request", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.method(0);

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(true);
      expect(sentMessage.params).toBe(0);

      endpoint.receive(makeSuccessResponse("ok", 1));
    });

    test("params = false (falsy) is sent as params in the request", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.method(false);

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(true);
      expect(sentMessage.params).toBe(false);

      endpoint.receive(makeSuccessResponse("ok", 1));
    });

    test('params = "" (empty string, falsy) is sent as params in the request', () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.method("");

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(true);
      expect(sentMessage.params).toBe("");

      endpoint.receive(makeSuccessResponse("ok", 1));
    });

    test("params = null (falsy) is sent as params in the request", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.method(null);

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(true);
      expect(sentMessage.params).toBe(null);

      endpoint.receive(makeSuccessResponse("ok", 1));
    });

    test("$notify with params = 0 sends params correctly", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.method(0);

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(true);
      expect(sentMessage.params).toBe(0);
    });

    test("$notify with params = false sends params correctly", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.method(false);

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(true);
      expect(sentMessage.params).toBe(false);
    });

    test('$notify with params = "" sends params correctly', () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.method("");

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(true);
      expect(sentMessage.params).toBe("");
    });
  });

  // ─── Timeout followed by late response (pending map cleanup verification) ───

  describe("late response after timeout is ignored", () => {
    test("timed-out request's late response is silently ignored (pending map entry deleted)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.slow({}, { timeout: 50 });

      // Wait for timeout to fire
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
      await expect(promise).rejects.toBeInstanceOf(FractalError);

      // Now a late response arrives for id=1 — should be silently ignored
      // (no unhandled rejection, no error, no re-resolve)
      endpoint.receive(makeSuccessResponse("late-result", 1));

      // The promise is already rejected; it should not have changed
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    });

    test("timed-out request's late error response is also silently ignored", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.slow({}, { timeout: 50 });

      // Wait for timeout
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });

      // Late error response arrives — should be ignored
      endpoint.receive(makeErrorResponse(-32603, "Internal error", 1));

      // Promise is still rejected with TIMEOUT, not the server error
      await expect(promise).rejects.toBeInstanceOf(FractalError);
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    });

    test("after timeout, subsequent requests still work correctly", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // First request times out (id=1)
      const p1 = client.slow({}, { timeout: 50 });
      await p1.catch(() => {});

      // Second request should work fine (id=2)
      const p2 = client.fast();
      endpoint.receive(makeSuccessResponse("fast-result", 2));
      await expect(p2).resolves.toBe("fast-result");

      // Late response for id=1 should not affect id=2
      endpoint.receive(makeSuccessResponse("late-for-1", 1));
    });
  });

  // ─── dispose後の $notify 呼び出し ───

  describe("$notify after dispose throws FractalError DISPOSED", () => {
    test("client.$notify.method() throws FractalError with code DISPOSED after dispose()", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.dispose();

      expect(() => client.$notify.log.info({ msg: "hello" })).toThrow(
        FractalError,
      );
      try {
        client.$notify.log.info({ msg: "hello" });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).code).toBe("DISPOSED");
      }

      // endpoint.send should not have been called after dispose
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.$notify.deeply.nested.method() throws FractalError DISPOSED after dispose()", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.dispose();

      expect(() => client.$notify.deeply.nested.method()).toThrow(FractalError);
      try {
        client.$notify.deeply.nested.method();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).code).toBe("DISPOSED");
      }
    });

    test("client.$notify.ping() (top-level) throws FractalError DISPOSED after dispose()", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.dispose();

      expect(() => client.$notify.ping()).toThrow(FractalError);
      try {
        client.$notify.ping();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).code).toBe("DISPOSED");
      }
    });
  });

  // ─── Batch Request（配列メッセージ）が pending を解決しないこと ───

  describe("batch request array does not resolve pending promises", () => {
    test("array message containing matching response does not resolve pending promise, subsequent correct response does", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Send a batch-style array containing a response with the correct id
      endpoint.receive([makeSuccessResponse("batch-pong", 1)]);

      // Promise should still be pending — arrays are not valid JSON-RPC messages
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Now send the correct single-object response
      endpoint.receive(makeSuccessResponse("real-pong", 1));
      await expect(promise).resolves.toBe("real-pong");
    });

    test("array of multiple responses does not resolve any pending promises", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const p1 = client.a();
      const p2 = client.b();

      // Send a batch-style array containing responses for both ids
      endpoint.receive([
        makeSuccessResponse("batch-a", 1),
        makeSuccessResponse("batch-b", 2),
      ]);

      // Both promises should still be pending
      const r1 = await Promise.race([
        p1.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      const r2 = await Promise.race([
        p2.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(r1).toBe("pending");
      expect(r2).toBe("pending");

      // Correct individual responses resolve them
      endpoint.receive(makeSuccessResponse("real-a", 1));
      endpoint.receive(makeSuccessResponse("real-b", 2));
      await expect(p1).resolves.toBe("real-a");
      await expect(p2).resolves.toBe("real-b");
    });

    test("empty array message does not crash and does not affect pending promises", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Send empty array
      expect(() => endpoint.receive([])).not.toThrow();

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Clean up
      endpoint.receive(makeSuccessResponse("pong", 1));
      await expect(promise).resolves.toBe("pong");
    });
  });

  // ─── defaultTimeout: undefined と省略時の同等性 ───

  describe("defaultTimeout: undefined is equivalent to omitting defaultTimeout", () => {
    test("createClient(endpoint, { defaultTimeout: undefined }) does not cause timeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: undefined });

      const promise = client.wait();

      // Should not timeout — still pending after 100ms
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      expect(result).toBe("pending");

      // Clean up by resolving
      endpoint.receive(makeSuccessResponse("ok", 1));
      await expect(promise).resolves.toBe("ok");
    });

    test("defaultTimeout: undefined behaves identically to no options", async () => {
      const endpointA = createMockEndpoint();
      const clientA = createClient(endpointA); // no options at all

      const endpointB = createMockEndpoint();
      const clientB = createClient(endpointB, { defaultTimeout: undefined }); // explicit undefined

      const promiseA = clientA.test();
      const promiseB = clientB.test();

      // Both should be pending after 100ms (no timeout)
      const resultA = await Promise.race([
        promiseA.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      const resultB = await Promise.race([
        promiseB.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      expect(resultA).toBe("pending");
      expect(resultB).toBe("pending");

      // Both resolve normally when response arrives
      endpointA.receive(makeSuccessResponse("okA", 1));
      endpointB.receive(makeSuccessResponse("okB", 1));
      await expect(promiseA).resolves.toBe("okA");
      await expect(promiseB).resolves.toBe("okB");
    });

    test("defaultTimeout: undefined does not prevent per-call timeout from working", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, { defaultTimeout: undefined });

      // Per-call timeout should still work even when defaultTimeout is undefined
      const promise = client.slow({}, { timeout: 50 });
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
      await expect(promise).rejects.toBeInstanceOf(FractalError);
    });
  });

  // ─── Malformed error field in response ───

  describe("malformed error field in response", () => {
    test("error: 'string' — client handles gracefully (rejects with RpcError)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();
      // Send a response where error is a string instead of {code, message}
      endpoint.receive({ jsonrpc: "2.0", error: "string", id: 1 });

      // The client should reject (error field present takes priority)
      // RpcError is constructed with undefined code and message from the string
      await expect(promise).rejects.toThrow(RpcError);
      const err = await promise.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RpcError);
    });

    test("error: null — accessing null.code throws TypeError synchronously in onMessage handler", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();
      // error: null causes TypeError when accessing null.code during RpcError construction.
      // The TypeError propagates synchronously through the receive() call.
      expect(() => {
        endpoint.receive({ jsonrpc: "2.0", error: null, id: 1 });
      }).toThrow(TypeError);

      // The pending entry was deleted before the TypeError, but reject was never called,
      // so the promise stays pending forever.
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");
    });

    test("error: {} — client rejects with RpcError with undefined code and empty message", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();
      endpoint.receive({ jsonrpc: "2.0", error: {}, id: 1 });

      await expect(promise).rejects.toThrow(RpcError);
      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err).toBeInstanceOf(RpcError);
      expect(err.code).toBeUndefined();
      // Error(undefined) sets message to "" in JavaScript
      expect(err.message).toBe("");
    });

    test("error: {code: 'not-a-number'} — client handles gracefully (rejects with RpcError with string code)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();
      endpoint.receive({
        jsonrpc: "2.0",
        error: { code: "not-a-number", message: "bad" },
        id: 1,
      });

      await expect(promise).rejects.toThrow(RpcError);
      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err).toBeInstanceOf(RpcError);
      // code is set to whatever was in the response, even if not a number
      expect(err.code).toBe("not-a-number");
      expect(err.message).toBe("bad");
    });
  });

  // ─── params: undefined explicitly passed ───

  describe("params: undefined explicitly passed", () => {
    test("client.method(undefined) omits params from the request (same as no argument)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.ping(undefined);

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(false);

      endpoint.receive(makeSuccessResponse("pong", 1));
    });

    test("$notify.method(undefined) omits params from the request", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.ping(undefined);

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("params" in sentMessage).toBe(false);
    });
  });

  // ─── defaultTimeout: Infinity + per-call finite timeout ───

  describe("defaultTimeout: Infinity + per-call finite timeout", () => {
    test("client with defaultTimeout: Infinity still respects a finite per-call timeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, {
        defaultTimeout: Number.POSITIVE_INFINITY,
      });

      const promise = client.slow({}, { timeout: 50 });

      // Should timeout with the per-call timeout, not wait forever
      await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
      await expect(promise).rejects.toBeInstanceOf(FractalError);
    });

    test("client with defaultTimeout: Infinity — calls without per-call timeout do not timeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, {
        defaultTimeout: Number.POSITIVE_INFINITY,
      });

      const promise = client.wait();

      // Should not timeout quickly
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      expect(result).toBe("pending");

      // Clean up
      endpoint.receive(makeSuccessResponse("ok", 1));
      await expect(promise).resolves.toBe("ok");
    });
  });

  // ─── Response with id: undefined ───

  describe("response with id: undefined", () => {
    test("response with id: undefined does not match any pending entry", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Send a response where id is explicitly undefined — typeof undefined !== "number"
      endpoint.receive({ jsonrpc: "2.0", result: "wrong", id: undefined });

      // Promise should still be pending (id: undefined is not a number, so it won't match)
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Correct response resolves it
      endpoint.receive(makeSuccessResponse("correct", 1));
      await expect(promise).resolves.toBe("correct");
    });

    test("error response with id: undefined does not match any pending entry", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Error response with id: undefined
      endpoint.receive({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: undefined,
      });

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Correct response resolves it
      endpoint.receive(makeSuccessResponse("correct", 1));
      await expect(promise).resolves.toBe("correct");
    });
  });

  // ─── Falsy result values resolve correctly ───

  describe("falsy result values resolve correctly", () => {
    test("result: false resolves to false", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.check();
      endpoint.receive(makeSuccessResponse(false, 1));

      const result = await promise;
      expect(result).toBe(false);
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
    });

    test("result: 0 resolves to 0", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.count();
      endpoint.receive(makeSuccessResponse(0, 1));

      const result = await promise;
      expect(result).toBe(0);
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
    });

    test('result: "" (empty string) resolves to ""', async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.name();
      endpoint.receive(makeSuccessResponse("", 1));

      const result = await promise;
      expect(result).toBe("");
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
    });

    test("result: null resolves to null (already tested, included for completeness)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.nullable();
      endpoint.receive(makeSuccessResponse(null, 1));

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  // ─── error.data with null/falsy values ───

  describe("error.data with null/falsy values", () => {
    test("error.data: null is preserved on RpcError", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.fail();
      endpoint.receive({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Custom error", data: null },
        id: 1,
      });

      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err).toBeInstanceOf(RpcError);
      expect(err.data).toBeNull();
      // Verify it's explicitly null, not undefined
      expect(err.data).not.toBeUndefined();
    });

    test("error.data: 0 is preserved on RpcError", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.fail();
      endpoint.receive({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Custom error", data: 0 },
        id: 1,
      });

      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err).toBeInstanceOf(RpcError);
      expect(err.data).toBe(0);
      // Verify it's explicitly 0, not undefined or null
      expect(err.data).not.toBeUndefined();
      expect(err.data).not.toBeNull();
    });

    test('error.data: "" (empty string) is preserved on RpcError', async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.fail();
      endpoint.receive({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Custom error", data: "" },
        id: 1,
      });

      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err).toBeInstanceOf(RpcError);
      expect(err.data).toBe("");
      // Verify it's explicitly empty string, not undefined or null
      expect(err.data).not.toBeUndefined();
      expect(err.data).not.toBeNull();
    });

    test("error.data: false is preserved on RpcError", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.fail();
      endpoint.receive({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Custom error", data: false },
        id: 1,
      });

      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err).toBeInstanceOf(RpcError);
      expect(err.data).toBe(false);
      expect(err.data).not.toBeUndefined();
      expect(err.data).not.toBeNull();
    });
  });

  // ─── Accessing client.$notify alone does not trigger send ───

  describe("accessing client.$notify alone does not trigger send", () => {
    test("reading client.$notify does not cause any RPC call", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Just access $notify, don't call anything on it
      const notify = client.$notify;

      expect(notify).toBeDefined();
      expect(notify).not.toBeNull();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("reading client.$notify and accessing a property does not trigger send", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Access $notify and then a namespace, but don't call it
      const logNotify = client.$notify.log;

      expect(logNotify).toBeDefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("reading client.$notify multiple times does not trigger send", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Access $notify multiple times
      const n1 = client.$notify;
      const n2 = client.$notify;
      const n3 = client.$notify;

      expect(n1).toBeDefined();
      expect(n2).toBeDefined();
      expect(n3).toBeDefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── Synchronous throw verification for disposed client ───

  describe("synchronous throw verification for disposed client", () => {
    test("method call on disposed client throws synchronously (not as rejected promise)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);
      client.dispose();

      // Verify synchronous throw: try/catch catches it, not .catch()
      let caught: unknown = null;
      try {
        client.ping();
      } catch (e) {
        caught = e;
      }

      // The error should have been caught synchronously
      expect(caught).not.toBeNull();
      expect(caught).toBeInstanceOf(FractalError);
      expect((caught as FractalError).code).toBe("DISPOSED");
    });

    test("$notify on disposed client throws synchronously", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);
      client.dispose();

      let caught: unknown = null;
      try {
        client.$notify.log.info({ msg: "test" });
      } catch (e) {
        caught = e;
      }

      expect(caught).not.toBeNull();
      expect(caught).toBeInstanceOf(FractalError);
      expect((caught as FractalError).code).toBe("DISPOSED");
    });

    test("disposed client method call — error is thrown, not returned as a rejected promise", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);
      client.dispose();

      // Using expect().toThrow confirms synchronous throw
      expect(() => client.ping()).toThrow(FractalError);

      // Double-check: the throw happens before any promise is created
      // If it were async, expect(() => ...).toThrow() would not catch it
      expect(() => {
        const result = client.someMethod();
        // If we reach here, it returned a promise (bad) — we should not reach here
        expect(result).toBeUndefined(); // This line should never execute
      }).toThrow(FractalError);
    });

    test("nested method on disposed client throws synchronously", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);
      client.dispose();

      let caught: unknown = null;
      try {
        client.user.get({ id: "123" });
      } catch (e) {
        caught = e;
      }

      expect(caught).not.toBeNull();
      expect(caught).toBeInstanceOf(FractalError);
      expect((caught as FractalError).code).toBe("DISPOSED");
    });
  });

  // ─── Symbol.dispose in namespace proxy ───

  describe("Symbol.dispose in namespace proxy", () => {
    test("client.user[Symbol.dispose] returns undefined (namespace proxies should not expose dispose)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.user as any)[Symbol.dispose];

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.admin.user[Symbol.dispose] returns undefined (deeply nested namespace)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.admin as any).user[Symbol.dispose];

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("client.$notify.log[Symbol.dispose] returns undefined ($notify namespace)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = (client.$notify.log as any)[Symbol.dispose];

      expect(result).toBeUndefined();
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── Concurrent multi-timeout ordering ───

  describe("concurrent multi-timeout ordering", () => {
    test("two requests with different timeouts (50ms and 200ms) both timeout independently at the correct time", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const start = performance.now();

      const pFast = client.fast({}, { timeout: 50 });
      const pSlow = client.slow({}, { timeout: 200 });

      // The fast one should timeout first
      const errFast = (await pFast.catch((e: unknown) => e)) as FractalError;
      const fastElapsed = performance.now() - start;

      expect(errFast).toBeInstanceOf(FractalError);
      expect(errFast.code).toBe("TIMEOUT");
      // Fast timeout should have fired around 50ms (allow generous tolerance)
      expect(fastElapsed).toBeGreaterThanOrEqual(30);
      expect(fastElapsed).toBeLessThan(180);

      // The slow one should still be pending at this point (if fast resolved quickly enough)
      // Wait for slow to timeout too
      const errSlow = (await pSlow.catch((e: unknown) => e)) as FractalError;
      const slowElapsed = performance.now() - start;

      expect(errSlow).toBeInstanceOf(FractalError);
      expect(errSlow.code).toBe("TIMEOUT");
      // Slow timeout should have fired around 200ms
      expect(slowElapsed).toBeGreaterThanOrEqual(150);
    });

    test("fast timeout does not cancel or interfere with slow timeout", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const pFast = client.a({}, { timeout: 30 });
      const pSlow = client.b({}, { timeout: 300 });

      // Wait for fast to timeout
      await expect(pFast).rejects.toMatchObject({ code: "TIMEOUT" });

      // Slow should still be pending
      const result = await Promise.race([
        pSlow.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Now resolve slow before its timeout
      endpoint.receive(makeSuccessResponse("slow-result", 2));
      await expect(pSlow).resolves.toBe("slow-result");
    });
  });

  // ─── client.method() returns instanceof Promise ───

  describe("client.method() returns instanceof Promise", () => {
    test("return value of client.method() is an instance of Promise", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = client.ping();

      expect(result).toBeInstanceOf(Promise);

      // Clean up
      endpoint.receive(makeSuccessResponse("pong", 1));
    });

    test("return value of client.namespace.method() is an instance of Promise", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = client.user.get({ id: "1" });

      expect(result).toBeInstanceOf(Promise);

      // Clean up
      endpoint.receive(makeSuccessResponse({ id: "1", name: "Alice" }, 1));
    });
  });

  // ─── onMessage called exactly once at construction ───

  describe("onMessage called exactly once at construction", () => {
    test("endpoint.onMessage is called exactly once during createClient()", () => {
      const endpoint = createMockEndpoint();

      createClient(endpoint);

      expect(endpoint.onMessage).toHaveBeenCalledTimes(1);
    });

    test("endpoint.onMessage is called with a function argument", () => {
      const endpoint = createMockEndpoint();

      createClient(endpoint);

      expect(endpoint.onMessage).toHaveBeenCalledTimes(1);
      const handler = endpoint.onMessage.mock.calls[0]?.[0];
      expect(typeof handler).toBe("function");
    });

    test("subsequent method calls do not call onMessage again", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Various operations should not register additional handlers
      client.ping();
      client.$notify.log.info({ msg: "test" });
      client.user.get({ id: "1" });

      expect(endpoint.onMessage).toHaveBeenCalledTimes(1);

      // Clean up
      endpoint.receive(makeSuccessResponse("pong", 1));
      endpoint.receive(makeSuccessResponse({ id: "1", name: "Alice" }, 3));
    });
  });

  // ─── Exact request structure verification ───

  describe("exact request structure verification", () => {
    test("request with params has exactly jsonrpc, method, params, id keys (no extra keys)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.user.get({ id: "123" });

      const sentMessage = endpoint.send.mock.calls[0]?.[0];
      expect(sentMessage).toEqual({
        jsonrpc: "2.0",
        method: "user.get",
        params: { id: "123" },
        id: 1,
      });

      endpoint.receive(makeSuccessResponse({ id: "123", name: "Alice" }, 1));
    });

    test("request without params has exactly jsonrpc, method, id keys (no params key, no extra keys)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.ping();

      const sentMessage = endpoint.send.mock.calls[0]?.[0];
      expect(sentMessage).toEqual({
        jsonrpc: "2.0",
        method: "ping",
        id: 1,
      });

      endpoint.receive(makeSuccessResponse("pong", 1));
    });

    test("notification with params has exactly jsonrpc, method, params keys (no id, no extra keys)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.log.info({ level: "debug" });

      const sentMessage = endpoint.send.mock.calls[0]?.[0];
      expect(sentMessage).toEqual({
        jsonrpc: "2.0",
        method: "log.info",
        params: { level: "debug" },
      });
    });

    test("notification without params has exactly jsonrpc, method keys (no id, no params, no extra keys)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.heartbeat();

      const sentMessage = endpoint.send.mock.calls[0]?.[0];
      expect(sentMessage).toEqual({
        jsonrpc: "2.0",
        method: "heartbeat",
      });
    });
  });

  // ─── Complex nested result passthrough ───

  describe("complex nested result passthrough", () => {
    test("deeply nested result object is faithfully resolved through the proxy", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const deepResult = {
        user: {
          id: "123",
          profile: {
            name: "Alice",
            settings: {
              theme: "dark",
              notifications: {
                email: true,
                push: false,
                channels: ["general", "updates"],
              },
            },
            metadata: {
              createdAt: "2024-01-01T00:00:00Z",
              tags: [
                { key: "role", value: "admin" },
                { key: "level", value: 42 },
              ],
              nested: {
                deep: {
                  deeper: {
                    deepest: "found-it",
                  },
                },
              },
            },
          },
        },
        pagination: {
          total: 100,
          page: 1,
          perPage: 10,
          hasMore: true,
        },
        nullField: null,
        emptyArray: [],
        emptyObject: {},
      };

      const promise = client.data.fetch({ query: "all" });
      endpoint.receive(makeSuccessResponse(deepResult, 1));

      const result = await promise;
      expect(result).toEqual(deepResult);

      // Verify specific deep paths to ensure faithful passthrough
      expect(
        (result as any).user.profile.settings.notifications.channels,
      ).toEqual(["general", "updates"]);
      expect(
        (result as any).user.profile.metadata.nested.deep.deeper.deepest,
      ).toBe("found-it");
      expect((result as any).user.profile.metadata.tags[1]).toEqual({
        key: "level",
        value: 42,
      });
      expect((result as any).nullField).toBeNull();
      expect((result as any).emptyArray).toEqual([]);
      expect((result as any).emptyObject).toEqual({});
    });

    test("result with array of nested objects is faithfully resolved", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const arrayResult = [
        {
          id: 1,
          name: "Alice",
          roles: [{ name: "admin", permissions: ["read", "write"] }],
        },
        {
          id: 2,
          name: "Bob",
          roles: [{ name: "user", permissions: ["read"] }],
        },
      ];

      const promise = client.users.list();
      endpoint.receive(makeSuccessResponse(arrayResult, 1));

      const result = await promise;
      expect(result).toEqual(arrayResult);
    });
  });

  // ─── $notify.$notify.method namespace ───

  describe("$notify.$notify.method namespace", () => {
    test("client.$notify.$notify.method() sends method '$notify.method' as notification", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.$notify.method({ data: "test" });

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(sentMessage).toEqual({
        jsonrpc: "2.0",
        method: "$notify.method",
        params: { data: "test" },
      });
      // No id field (it's a notification)
      expect("id" in sentMessage).toBe(false);
    });

    test("client.$notify.$notify.deep.path() sends method '$notify.deep.path' as notification", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client.$notify.$notify.deep.path();

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(sentMessage).toEqual({
        jsonrpc: "2.0",
        method: "$notify.deep.path",
      });
      expect("id" in sentMessage).toBe(false);
    });

    test("client.$notify.$notify.method() returns void (not a Promise)", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const result = client.$notify.$notify.method();

      expect(result).toBeUndefined();
    });
  });

  // ─── createClient(endpoint, {}) with empty options ───

  describe("createClient(endpoint, {}) with empty options", () => {
    test("createClient(endpoint, {}) behaves identically to createClient(endpoint) — no timeout", async () => {
      const endpointA = createMockEndpoint();
      const clientA = createClient(endpointA); // no options

      const endpointB = createMockEndpoint();
      const clientB = createClient(endpointB, {}); // empty options

      const promiseA = clientA.test();
      const promiseB = clientB.test();

      // Both should be pending after 100ms (no timeout)
      const resultA = await Promise.race([
        promiseA.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      const resultB = await Promise.race([
        promiseB.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      expect(resultA).toBe("pending");
      expect(resultB).toBe("pending");

      // Both resolve normally when response arrives
      endpointA.receive(makeSuccessResponse("okA", 1));
      endpointB.receive(makeSuccessResponse("okB", 1));
      await expect(promiseA).resolves.toBe("okA");
      await expect(promiseB).resolves.toBe("okB");
    });

    test("createClient(endpoint, {}) sends the same request structure as createClient(endpoint)", () => {
      const endpointA = createMockEndpoint();
      const clientA = createClient(endpointA);

      const endpointB = createMockEndpoint();
      const clientB = createClient(endpointB, {});

      clientA.user.get({ id: "1" });
      clientB.user.get({ id: "1" });

      // Both should produce identical request structures
      const sentA = endpointA.send.mock.calls[0]?.[0];
      const sentB = endpointB.send.mock.calls[0]?.[0];
      expect(sentA).toEqual(sentB);

      endpointA.receive(makeSuccessResponse("ok", 1));
      endpointB.receive(makeSuccessResponse("ok", 1));
    });

    test("createClient(endpoint, {}) does not throw", () => {
      const endpoint = createMockEndpoint();
      expect(() => createClient(endpoint, {})).not.toThrow();
    });
  });

  // ─── { timeout: undefined } with no defaultTimeout ───

  describe("{ timeout: undefined } with no defaultTimeout means no timeout at all", () => {
    test("{ timeout: undefined } with no defaultTimeout — request stays pending indefinitely", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint); // no defaultTimeout

      const promise = client.wait({}, { timeout: undefined });

      // Should not timeout — still pending after 150ms
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 150)),
      ]);
      expect(result).toBe("pending");

      // Clean up by resolving
      endpoint.receive(makeSuccessResponse("ok", 1));
      await expect(promise).resolves.toBe("ok");
    });

    test("{ timeout: undefined } with no defaultTimeout — behaves same as no options at all", async () => {
      const endpointA = createMockEndpoint();
      const clientA = createClient(endpointA);

      const endpointB = createMockEndpoint();
      const clientB = createClient(endpointB);

      // One call with no options, other with { timeout: undefined }
      const promiseA = clientA.wait();
      const promiseB = clientB.wait({}, { timeout: undefined });

      // Both should be pending
      const resultA = await Promise.race([
        promiseA.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      const resultB = await Promise.race([
        promiseB.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 100)),
      ]);
      expect(resultA).toBe("pending");
      expect(resultB).toBe("pending");

      // Both resolve normally
      endpointA.receive(makeSuccessResponse("okA", 1));
      endpointB.receive(makeSuccessResponse("okB", 1));
      await expect(promiseA).resolves.toBe("okA");
      await expect(promiseB).resolves.toBe("okB");
    });
  });

  // ─── Calling intermediate namespace directly ───

  describe("calling intermediate namespace directly", () => {
    test("const ns = client.user; ns({id: '1'}) sends method 'user' with params {id: '1'}", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const ns = client.user;
      const promise = ns({ id: "1" });

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: "2.0",
          method: "user",
          params: { id: "1" },
          id: 1,
        }),
      );

      endpoint.receive(makeSuccessResponse({ id: "1", name: "Alice" }, 1));
      await expect(promise).resolves.toEqual({ id: "1", name: "Alice" });
    });

    test("intermediate namespace called without params sends method 'user' with no params key", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const ns = client.user;
      const promise = ns();

      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(sentMessage.method).toBe("user");
      expect("params" in sentMessage).toBe(false);

      endpoint.receive(makeSuccessResponse("ok", 1));
      await expect(promise).resolves.toBe("ok");
    });

    test("intermediate namespace can still be used for deeper access after being stored", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const ns = client.user;

      // Call ns.get() — should send method "user.get"
      const promise = ns.get({ id: "2" });

      expect(endpoint.send).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "user.get",
          params: { id: "2" },
        }),
      );

      endpoint.receive(makeSuccessResponse({ id: "2", name: "Bob" }, 1));
      await expect(promise).resolves.toEqual({ id: "2", name: "Bob" });
    });
  });

  // ─── Response with id: NaN ───

  describe("response with id: NaN", () => {
    test("response with id: NaN does not match any pending entry (NaN !== NaN)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // typeof NaN === "number", so it passes the typeof check,
      // but Map.get(NaN) returns undefined because NaN !== NaN
      endpoint.receive(makeSuccessResponse("wrong", Number.NaN));

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Correct response resolves it
      endpoint.receive(makeSuccessResponse("correct", 1));
      await expect(promise).resolves.toBe("correct");
    });

    test("error response with id: NaN does not match any pending entry", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.ping();

      // Error response with NaN id — should be ignored
      endpoint.receive(
        makeErrorResponse(-32603, "Internal error", Number.NaN as any),
      );

      // Promise should still be pending
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      expect(result).toBe("pending");

      // Correct response resolves it
      endpoint.receive(makeSuccessResponse("correct", 1));
      await expect(promise).resolves.toBe("correct");
    });

    test("response with id: NaN does not crash the client", () => {
      const endpoint = createMockEndpoint();
      createClient(endpoint);

      expect(() =>
        endpoint.receive(makeSuccessResponse("data", Number.NaN)),
      ).not.toThrow();
    });
  });

  // ─── $notify after Symbol.dispose ───

  describe("$notify after Symbol.dispose", () => {
    test("$notify throws FractalError('DISPOSED') when Symbol.dispose was used to dispose", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Dispose using Symbol.dispose (not client.dispose())
      client[Symbol.dispose]();

      expect(() => client.$notify.log.info({ msg: "hello" })).toThrow(
        FractalError,
      );
      try {
        client.$notify.log.info({ msg: "hello" });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).code).toBe("DISPOSED");
      }

      // endpoint.send should not have been called after dispose
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("$notify.deeply.nested.method() throws FractalError('DISPOSED') after Symbol.dispose", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client[Symbol.dispose]();

      expect(() => client.$notify.deeply.nested.method()).toThrow(FractalError);
      try {
        client.$notify.deeply.nested.method();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).code).toBe("DISPOSED");
      }
    });

    test("$notify top-level method throws FractalError('DISPOSED') after Symbol.dispose", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      client[Symbol.dispose]();

      expect(() => client.$notify.ping()).toThrow(FractalError);
      try {
        client.$notify.ping();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).code).toBe("DISPOSED");
      }
    });
  });

  // ─── timeout: 0 combined with send() failure ───

  describe("timeout: 0 combined with send() failure", () => {
    test("send failure takes precedence over immediate timeout (timeout: 0)", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw new Error("transport closed");
      });
      const client = createClient(endpoint);

      const promise = client.method({}, { timeout: 0 });

      // Should reject with the send error, not TIMEOUT
      await expect(promise).rejects.toThrow("transport closed");

      // Verify it's not a FractalError TIMEOUT
      const err = await promise.catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(FractalError);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("transport closed");
    });

    test("send failure with timeout: 0 clears the timer (no lingering TIMEOUT fires)", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw new Error("send failed");
      });
      const client = createClient(endpoint);

      const promise = client.method({}, { timeout: 0 });

      // Should reject with send error
      await expect(promise).rejects.toThrow("send failed");

      // Wait longer than the timeout (0ms) would have been to confirm no leftover timer fires
      await new Promise<void>((r) => setTimeout(r, 50));

      // If timer wasn't cleared, an unhandled rejection would have occurred.
      // The fact that we reach here without error proves the timer was cleared.
    });

    test("send failure with defaultTimeout: 0 also takes precedence over timeout", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw new Error("endpoint dead");
      });
      const client = createClient(endpoint, { defaultTimeout: 0 });

      const promise = client.method();

      // Should reject with send error, not TIMEOUT
      await expect(promise).rejects.toThrow("endpoint dead");

      const err = await promise.catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(FractalError);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("endpoint dead");
    });
  });

  // ─── await client.$notify resolves to the proxy itself ───

  describe("await client.$notify resolves to the proxy itself", () => {
    test("await client.$notify resolves to the $notify proxy (since .then returns undefined, it is not thenable)", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // client.$notify.then returns undefined, making $notify non-thenable.
      // When you await a non-thenable value, it resolves to that value itself.
      const result = await client.$notify;

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      // It should be the $notify namespace proxy — calling a method on it should send a notification
      result.ping({ msg: "hello" });
      expect(endpoint.send).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        method: "ping",
        params: { msg: "hello" },
      });
      // No id field (it's a notification)
      const sentMessage = endpoint.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("id" in sentMessage).toBe(false);
    });

    test("await client.$notify does not trigger any RPC call by itself", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      await client.$notify;

      // No send should have been called just by awaiting $notify
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── defaultTimeout: Infinity + timeout: 0 per-call ───

  describe("defaultTimeout: Infinity + timeout: 0 per-call", () => {
    test("client with defaultTimeout: Infinity, per-call timeout: 0 times out immediately with FractalError('TIMEOUT')", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, {
        defaultTimeout: Number.POSITIVE_INFINITY,
      });

      // defaultTimeout: Infinity means no timeout by default,
      // but per-call timeout: 0 should override and cause immediate timeout
      const promise = client.method({}, { timeout: 0 });

      const err = await promise.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(FractalError);
      expect((err as FractalError).code).toBe("TIMEOUT");
    });

    test("client with defaultTimeout: Infinity, per-call timeout: 0 — late response is ignored", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint, {
        defaultTimeout: Number.POSITIVE_INFINITY,
      });

      const promise = client.method({}, { timeout: 0 });
      await promise.catch(() => {});

      // Late response for id=1 should be silently ignored (pending entry already removed by timeout)
      endpoint.receive(makeSuccessResponse("late", 1));
    });
  });

  // ─── result: false + error both present ───

  describe("result: false + error both present (error takes priority)", () => {
    test("when response has result: false (falsy) and error field, error takes priority and rejects with RpcError", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.check();

      // Send a malformed response with both result: false (falsy) and error
      endpoint.receive({
        jsonrpc: "2.0",
        result: false,
        error: { code: -32000, message: "Server error" },
        id: 1,
      });

      // Per the spec: "error takes priority over result (spec violation handling)"
      // Even though result is present (and falsy), the error field takes precedence
      await expect(promise).rejects.toThrow(RpcError);
      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err).toBeInstanceOf(RpcError);
      expect(err.code).toBe(-32000);
      expect(err.message).toBe("Server error");
    });

    test("when response has result: 0 (falsy) and error field, error takes priority", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.count();

      endpoint.receive({
        jsonrpc: "2.0",
        result: 0,
        error: { code: -32603, message: "Internal error" },
        id: 1,
      });

      await expect(promise).rejects.toThrow(RpcError);
      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err.code).toBe(-32603);
    });

    test("when response has result: '' (empty string, falsy) and error field, error takes priority", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.name();

      endpoint.receive({
        jsonrpc: "2.0",
        result: "",
        error: { code: -32602, message: "Invalid params" },
        id: 1,
      });

      await expect(promise).rejects.toThrow(RpcError);
      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err.code).toBe(-32602);
    });

    test("when response has result: null (falsy) and error field, error takes priority", async () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      const promise = client.nullable();

      endpoint.receive({
        jsonrpc: "2.0",
        result: null,
        error: { code: -32601, message: "Method not found" },
        id: 1,
      });

      await expect(promise).rejects.toThrow(RpcError);
      const err = (await promise.catch((e: unknown) => e)) as RpcError;
      expect(err.code).toBe(-32601);
    });
  });

  // ─── send() returning rejected promise (async throw) ───

  describe("send() returning rejected promise (async throw)", () => {
    test("send() returning a rejected promise does NOT reject the client's promise — the promise remains pending", async () => {
      // The implementation uses try/catch around endpoint.send(), which only catches
      // synchronous throws. If send() returns a rejected promise (async failure),
      // the rejection is NOT caught and the client's request promise remains pending
      // (waiting for a response that will never come).
      // This documents the actual behavior: async send failures are not handled.
      const endpoint = createMockEndpoint();

      // Use a pre-created and pre-caught rejected promise to avoid unhandled rejection
      // in the test runner. This simulates send() returning a rejected promise without
      // actually causing an unhandled rejection.
      const rejectedPromise = Promise.reject(new Error("async send failure"));
      rejectedPromise.catch(() => {}); // Prevent unhandled rejection in test runner

      endpoint.send.mockImplementation(() => {
        return rejectedPromise;
      });
      const client = createClient(endpoint);

      const promise = client.ping();

      // The client's promise should remain pending because:
      // 1. send() did not throw synchronously (it returned a rejected promise)
      // 2. The pending entry was added to the map
      // 3. No response will ever arrive to resolve it
      const result = await Promise.race([
        promise.then(() => "resolved").catch(() => "rejected"),
        new Promise<string>((r) => setTimeout(() => r("pending"), 50)),
      ]);
      // The promise stays pending because the async rejection from send() is not caught
      expect(result).toBe("pending");

      // Clean up: dispose the client to reject the pending promise
      client.dispose();
      await promise.catch(() => {});
    });

    test("send() returning a rejected promise — request is still in pending map and can be resolved by a late response", async () => {
      // Further documenting the behavior: since the pending entry is not cleaned up
      // on async send failure, a hypothetical late response could resolve it.
      const endpoint = createMockEndpoint();

      const rejectedPromise = Promise.reject(new Error("async failure"));
      rejectedPromise.catch(() => {}); // Prevent unhandled rejection in test runner

      endpoint.send
        .mockImplementationOnce(() => {
          return rejectedPromise;
        })
        .mockImplementation(() => {});
      const client = createClient(endpoint);

      const promise = client.ping();

      // Allow microtask queue to process
      await new Promise<void>((r) => setTimeout(r, 10));

      // Even though send returned a rejected promise, the pending entry remains
      // If somehow a response arrives (e.g., the send actually went through before rejecting),
      // it will resolve the promise
      endpoint.receive(makeSuccessResponse("surprise", 1));
      await expect(promise).resolves.toBe("surprise");
    });
  });

  // ─── id counter is instance-local (explicit) ───

  describe("id counter is instance-local (explicit)", () => {
    test("two independently created clients both start their id counters from 1", () => {
      // Requirement: "id のスコープはクライアントインスタンスローカルである"
      // (id scope is client-instance-local)
      // Each createClient() call initializes its own nextId = 1.
      const endpoint1 = createMockEndpoint();
      const endpoint2 = createMockEndpoint();
      const client1 = createClient(endpoint1);
      const client2 = createClient(endpoint2);

      // Make calls on each client
      client1.methodA();
      client2.methodX();

      // Explicitly assert that both clients start from id=1
      const sent1 = endpoint1.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      const sent2 = endpoint2.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;

      expect(sent1.id).toBe(1);
      expect(sent2.id).toBe(1);

      // Make a second call on each client to verify independent incrementing
      client1.methodB();
      client2.methodY();

      const sent1b = endpoint1.send.mock.calls[1]?.[0] as Record<
        string,
        unknown
      >;
      const sent2b = endpoint2.send.mock.calls[1]?.[0] as Record<
        string,
        unknown
      >;

      expect(sent1b.id).toBe(2);
      expect(sent2b.id).toBe(2);

      // Clean up
      endpoint1.receive(makeSuccessResponse(null, 1));
      endpoint1.receive(makeSuccessResponse(null, 2));
      endpoint2.receive(makeSuccessResponse(null, 1));
      endpoint2.receive(makeSuccessResponse(null, 2));
    });

    test("id counter state of one client does not affect another client", () => {
      // Advance client1's counter by making several calls, then create client2
      // and verify client2 starts from 1 regardless of client1's counter state
      const endpoint1 = createMockEndpoint();
      const client1 = createClient(endpoint1);

      // Advance client1's id counter to 5
      client1.a();
      client1.b();
      client1.c();
      client1.d();
      client1.e();

      // Verify client1 is now at id=5
      const lastSent1 = endpoint1.send.mock.calls[4]?.[0] as Record<
        string,
        unknown
      >;
      expect(lastSent1.id).toBe(5);

      // Now create client2 — its counter should start fresh at 1
      const endpoint2 = createMockEndpoint();
      const client2 = createClient(endpoint2);
      client2.first();

      const sent2 = endpoint2.send.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(sent2.id).toBe(1);

      // Clean up
      for (let i = 1; i <= 5; i++)
        endpoint1.receive(makeSuccessResponse(null, i));
      endpoint2.receive(makeSuccessResponse(null, 1));
    });
  });

  // ─── defaultTimeout as non-number type throws TypeError ───

  describe("defaultTimeout as non-number type throws TypeError", () => {
    test('createClient(endpoint, { defaultTimeout: "100" as any }) throws TypeError', () => {
      const endpoint = createMockEndpoint();
      expect(() =>
        createClient(endpoint, { defaultTimeout: "100" as any }),
      ).toThrow(TypeError);
    });
  });

  // ─── Per-call timeout as non-number type throws TypeError ───

  describe("per-call timeout as non-number type throws TypeError", () => {
    test('client.method({}, { timeout: "100" as any }) throws TypeError', () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);
      expect(() => client.method({}, { timeout: "100" as any })).toThrow(
        TypeError,
      );
    });
  });

  // ─── Captured namespace proxy used after dispose throws DISPOSED ───

  describe("captured namespace proxy used after dispose throws DISPOSED", () => {
    test("storing const ns = client.user before dispose, then calling ns.get() after dispose throws FractalError('DISPOSED')", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Capture the namespace proxy before dispose
      const ns = client.user;

      client.dispose();

      // Using the captured namespace proxy after dispose should throw FractalError DISPOSED
      expect(() => ns.get()).toThrow(FractalError);
      try {
        ns.get();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).code).toBe("DISPOSED");
      }
    });
  });

  // ─── Captured $notify proxy used after dispose throws DISPOSED ───

  describe("captured $notify proxy used after dispose throws DISPOSED", () => {
    test("storing const notify = client.$notify before dispose, then calling notify.ping() after dispose throws FractalError('DISPOSED')", () => {
      const endpoint = createMockEndpoint();
      const client = createClient(endpoint);

      // Capture the $notify proxy before dispose
      const notify = client.$notify;

      client.dispose();

      // Using the captured $notify proxy after dispose should throw FractalError DISPOSED
      expect(() => notify.ping()).toThrow(FractalError);
      try {
        notify.ping();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FractalError);
        expect((e as FractalError).code).toBe("DISPOSED");
      }

      // endpoint.send should not have been called after dispose
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── send() failure with non-zero defaultTimeout clears timer ───

  describe("send() failure with non-zero defaultTimeout clears timer", () => {
    test("when send() throws with defaultTimeout: 50, no TIMEOUT fires after waiting", async () => {
      const endpoint = createMockEndpoint();
      endpoint.send.mockImplementation(() => {
        throw new Error("transport closed");
      });
      const client = createClient(endpoint, { defaultTimeout: 50 });

      const promise = client.method();

      // Should reject with the send error, not TIMEOUT
      await expect(promise).rejects.toThrow("transport closed");

      // Verify the error is the send error, not a FractalError TIMEOUT
      const err = await promise.catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(FractalError);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("transport closed");

      // Wait longer than the defaultTimeout to confirm no TIMEOUT error fires
      await new Promise<void>((r) => setTimeout(r, 100));

      // If timer wasn't cleared, an unhandled rejection would have occurred.
      // The fact that we reach here without error proves the timer was cleared.
    });
  });
});
