import { Fractal } from "../core/app.ts";
import {
  createMockEndpoint,
  makeErrorResponse,
  makeNotification,
  makeRequest,
  makeSuccessResponse,
} from "../test-helpers.ts";
import { serve } from "./serve.ts";

// Polyfill vi.waitFor for bun:test compatibility
async function waitFor(fn: () => void, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (true) {
    try {
      fn();
      return;
    } catch (err) {
      if (Date.now() - start > timeout) throw err;
      await new Promise((r) => setTimeout(r, 5));
    }
  }
}

describe("adapter/serve", () => {
  // ─── Basic message flow ───

  describe("message flow", () => {
    test("dispatches incoming request and sends response", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);

      endpoint.receive(makeRequest("ping", {}, 1));
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 1 }),
        );
      });
    });

    test("handles multiple sequential requests", async () => {
      const app = new Fractal()
        .method("a", (c) => c.json("A"))
        .method("b", (c) => c.json("B"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);

      endpoint.receive(makeRequest("a", {}, 1));
      endpoint.receive(makeRequest("b", {}, 2));
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(2);
      });
    });

    test("returns error response for unknown method", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("unknown", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32601 }),
            id: 1,
          }),
        );
      });
    });

    test("c.req.raw contains the MessageEvent", async () => {
      let capturedRaw: unknown;
      const app = new Fractal().method("ping", (c) => {
        capturedRaw = c.req.raw;
        return c.json("pong");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);

      const eventOverrides = { origin: "https://example.com" };
      endpoint.receive(makeRequest("ping", {}, 1), eventOverrides);

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalled();
      });
      expect(capturedRaw).toBeDefined();
      expect((capturedRaw as MessageEvent).origin).toBe("https://example.com");
    });

    test("concurrent async handlers execute independently", async () => {
      const results: string[] = [];
      const app = new Fractal().method("slow", async (c) => {
        const label = c.req.params.label as string;
        await new Promise((r) => setTimeout(r, 20));
        results.push(label);
        return c.json(label);
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);

      endpoint.receive(makeRequest("slow", { label: "first" }, 1));
      endpoint.receive(makeRequest("slow", { label: "second" }, 2));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(2);
      });
      expect(results).toContain("first");
      expect(results).toContain("second");
    });
  });

  // ─── Filtering ───

  describe("message filtering", () => {
    test("ignores response messages (has result field)", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeSuccessResponse("data", 1));

      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("ignores response messages (has error field)", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeErrorResponse(-32601, "Not found", 1));

      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("returns Invalid Request when method is missing", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", id: 1 }); // no method field

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
    });

    test("returns Invalid Request when method is not a string", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: 123, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
          }),
        );
      });
    });
  });

  // ─── Notifications ───

  describe("notifications", () => {
    test("does not send response for notification", async () => {
      const spy = vi.fn();
      const app = new Fractal().method("log", (c) => {
        spy(c.req.params);
        return c.json("ok");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeNotification("log", { msg: "hello" }));

      // Wait a tick for async processing
      await new Promise((r) => setTimeout(r, 10));
      expect(spy).toHaveBeenCalledWith({ msg: "hello" });
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("id: undefined is NOT a notification — response is sent", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      // Explicitly include id: undefined in the object.
      // In JavaScript, "id" in { id: undefined } === true,
      // so this is a regular request, not a notification (spec §4.5 line 745).
      endpoint.receive({ jsonrpc: "2.0", method: "ping", id: undefined });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong" }),
        );
      });
    });

    test("no response for notification with missing method (no id)", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0" }); // no method, no id

      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("console.error called for notification with missing method", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0" }); // no method, no id → notification-like

      await new Promise((r) => setTimeout(r, 10));
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Dispose ───

  describe("dispose", () => {
    test("dispose() stops receiving new messages", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);
      server.dispose();

      endpoint.receive(makeRequest("ping", {}, 1));
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("dispose() is idempotent", () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);
      expect(() => {
        server.dispose();
        server.dispose();
      }).not.toThrow();
    });

    test("dispose() calls unsubscribe only once", () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);
      expect(endpoint.handlers.length).toBe(1);

      server.dispose();
      server.dispose();
      server.dispose();

      // The handler should have been removed exactly once
      expect(endpoint.handlers.length).toBe(0);
      // onMessage was called once to register, the unsubscribe returned should only be invoked once
      expect(endpoint.onMessage).toHaveBeenCalledTimes(1);
    });

    test("async handler response send is attempted after dispose", async () => {
      const app = new Fractal().method("slow", async (c) => {
        await new Promise((r) => setTimeout(r, 30));
        return c.json("done");
      });
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);
      endpoint.receive(makeRequest("slow", {}, 1));

      // Dispose while handler is still running
      await new Promise((r) => setTimeout(r, 5));
      server.dispose();

      // Wait for handler to complete
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "done", id: 1 }),
        );
      });
    });

    test("dispose() via Symbol.dispose works", () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);
      expect(typeof server[Symbol.dispose]).toBe("function");
      server[Symbol.dispose]();

      endpoint.receive(makeRequest("ping", {}, 1));
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── Dispose during async handler ───

  describe("dispose during async handler", () => {
    test("running handler completes after dispose, response send attempted", async () => {
      let handlerCompleted = false;
      const app = new Fractal().method("slow", async (c) => {
        await new Promise((r) => setTimeout(r, 30));
        handlerCompleted = true;
        return c.json("done");
      });
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const server = serve(app, endpoint);
      endpoint.receive(makeRequest("slow", {}, 1));

      // Dispose while handler is still running
      await new Promise((r) => setTimeout(r, 5));
      server.dispose();

      // Wait for handler to complete
      await new Promise((r) => setTimeout(r, 50));
      expect(handlerCompleted).toBe(true);
      consoleSpy.mockRestore();
    });

    test("send() throwing after async handler completes post-dispose logs to console.error", async () => {
      const sendError = new Error("port closed after dispose");
      const app = new Fractal().method("slow", async (c) => {
        await new Promise((r) => setTimeout(r, 30));
        return c.json("done");
      });
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Make send() throw when the handler eventually completes
      endpoint.send.mockImplementation(() => {
        throw sendError;
      });

      const server = serve(app, endpoint);
      endpoint.receive(makeRequest("slow", {}, 1));

      // Dispose while handler is still running
      await new Promise((r) => setTimeout(r, 5));
      server.dispose();

      // Wait for handler to complete and send() to be attempted
      await new Promise((r) => setTimeout(r, 50));
      expect(endpoint.send).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Error handling ───

  describe("error handling", () => {
    test("handler error message preserved in error response", async () => {
      const app = new Fractal().method("boom", () => {
        throw new Error("specific error message");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("boom", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: "specific error message",
            }),
          }),
        );
      });
    });

    test("handler throwing Error returns -32603 error code", async () => {
      const app = new Fractal().method("boom", () => {
        throw new Error("something broke");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("boom", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32603,
              message: "something broke",
            }),
            id: 1,
          }),
        );
      });
    });

    test("handler throwing a string returns generic Internal error", async () => {
      const app = new Fractal().method("boom", () => {
        throw "string";
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("boom", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32603,
              message: "Internal error",
            }),
            id: 1,
          }),
        );
      });
    });

    test("handler throwing null returns generic Internal error", async () => {
      const app = new Fractal().method("boom", () => {
        throw null;
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("boom", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32603,
              message: "Internal error",
            }),
            id: 1,
          }),
        );
      });
    });

    test("handler throwing a number returns generic Internal error", async () => {
      const app = new Fractal().method("boom", () => {
        throw 42;
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("boom", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32603,
              message: "Internal error",
            }),
            id: 1,
          }),
        );
      });
    });

    test("handler returning undefined results in -32603 Internal error", async () => {
      const app = new Fractal().method("boom", (_c) => {
        // handler does not return c.json() or c.error()
        return undefined as any;
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("boom", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32603,
              message: "Internal error",
            }),
            id: 1,
          }),
        );
      });
    });

    test("continues listening after send() throws", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      endpoint.send.mockImplementationOnce(() => {
        throw new Error("port closed");
      });

      serve(app, endpoint);

      // First request fails on send
      endpoint.receive(makeRequest("ping", {}, 1));
      await new Promise((r) => setTimeout(r, 10));

      // Second request should still be handled
      endpoint.receive(makeRequest("ping", {}, 2));
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(2);
      });

      consoleSpy.mockRestore();
    });

    test("console.error called when send() throws", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      endpoint.send.mockImplementationOnce(() => {
        throw new Error("port closed");
      });

      serve(app, endpoint);
      endpoint.receive(makeRequest("ping", {}, 1));

      await new Promise((r) => setTimeout(r, 10));
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Params validation via serve() ───

  describe("params validation via serve()", () => {
    test("params: [] (array) returns -32600 Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2, 3],
        id: 1,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
    });

    test("params: null returns -32600 Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: null, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
    });

    test('params: "string" (primitive) returns -32600 Invalid Request', async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: "string",
        id: 1,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
    });

    test("params: 42 (number) returns -32600 Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: 42, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
    });

    test("params: [1,2] with id: 0 returns -32600 error with id: 0", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2],
        id: 0,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 0,
          }),
        );
      });
    });
  });

  // ─── Response id matches request id ───

  describe("response id matches request id", () => {
    test("id: 0 is echoed back in response", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("ping", {}, 0));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ result: "pong", id: 0 }),
        );
      });
    });

    test('id: "" is echoed back in response', async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("ping", {}, ""));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ result: "pong", id: "" }),
        );
      });
    });

    test("id: null is echoed back in response", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("ping", {}, null));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ result: "pong", id: null }),
        );
      });
    });

    test('id: "abc" is echoed back in response', async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("ping", {}, "abc"));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ result: "pong", id: "abc" }),
        );
      });
    });
  });

  // ─── Message with both result and error ───

  describe("message with both result and error", () => {
    test("ignores message with both result and error fields (treated as response)", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        result: "data",
        error: { code: -32600, message: "Invalid Request" },
        id: 1,
      });

      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── console.error verification ───

  describe("console.error verification", () => {
    test("console.error called for notification with invalid params (no response sent)", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      // Notification (no id) with invalid params (array)
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: [1, 2] });

      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Notification with handler exception ───

  describe("notification with handler exception", () => {
    test("no response sent and error logged to console.error when handler throws during notification", async () => {
      const app = new Fractal().method("boom", () => {
        throw new Error("handler exploded");
      });
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive(makeNotification("boom", {}));

      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("no response sent and console.error called when async handler throws during notification", async () => {
      const app = new Fractal().method("asyncBoom", async () => {
        await new Promise((r) => setTimeout(r, 10));
        throw new Error("async handler exploded");
      });
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive(makeNotification("asyncBoom", {}));

      await new Promise((r) => setTimeout(r, 50));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Params normalization through serve ───

  describe("params normalization through serve", () => {
    test("request with no params field at all → handler receives {}", async () => {
      let receivedParams: unknown;
      const app = new Fractal().method("ping", (c) => {
        receivedParams = c.req.params;
        return c.json("pong");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalled();
      });
      expect(receivedParams).toEqual({});
    });

    test("request with params: undefined → handler receives {}", async () => {
      let receivedParams: unknown;
      const app = new Fractal().method("ping", (c) => {
        receivedParams = c.req.params;
        return c.json("pong");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: undefined,
        id: 1,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalled();
      });
      expect(receivedParams).toEqual({});
    });
  });

  // ─── Invalid Request error message content ───

  describe("Invalid Request error message content", () => {
    test("-32600 error response includes 'Invalid Request' message string", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", id: 1 }); // no method field

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });
  });

  // ─── jsonrpc version filtering at serve level ───

  describe("jsonrpc version filtering at serve level", () => {
    test("message with jsonrpc: '1.0' is still processed if it has method and id (serve does not filter jsonrpc)", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      // serve() does not check jsonrpc field — endpoint is expected to filter it.
      // Since mock endpoint passes everything through, this will be dispatched.
      endpoint.receive({ jsonrpc: "1.0", method: "ping", id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 1 }),
        );
      });
    });

    test("message without jsonrpc field is still processed if it has method and id (serve does not filter jsonrpc)", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      // No jsonrpc field at all — serve() does not validate it.
      endpoint.receive({ method: "ping", id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 1 }),
        );
      });
    });

    test("message without jsonrpc field and without method returns -32600", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      // Plain object with id but no method and no jsonrpc
      endpoint.receive({ id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });
  });

  // ─── console.error for requests with invalid params ───

  describe("console.error for requests with invalid params", () => {
    test("console.error called when request (with id) has params: [] (array)", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2],
        id: 1,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("console.error called when request (with id) has params: null", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: null, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("console.error called when request (with id) has params: 42 (number)", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: 42, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("console.error called when request (with id) has params: 'string'", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: "invalid",
        id: 1,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Invalid Request error message content (via dispatch) ───

  describe("Invalid Request error message content for invalid params", () => {
    test("-32600 error for params: [] includes exact message 'Invalid Request'", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2],
        id: 1,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });

    test("-32600 error for params: null includes exact message 'Invalid Request'", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: null, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });

    test("-32600 error for method: 123 (non-string) includes exact message 'Invalid Request'", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: 123, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });
  });

  // ─── Dispose detailed behavior ───

  describe("dispose detailed behavior", () => {
    test("dispose() called 10 times without throwing", () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);
      expect(() => {
        for (let i = 0; i < 10; i++) {
          server.dispose();
        }
      }).not.toThrow();
    });
  });

  // ─── Multiple concurrent requests stress ───

  describe("multiple concurrent requests stress", () => {
    test("send 20 requests and verify all get responses", async () => {
      const app = new Fractal().method("echo", (c) => {
        return c.json(c.req.params);
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);

      const count = 20;
      for (let i = 0; i < count; i++) {
        endpoint.receive(makeRequest("echo", { n: i }, i + 1));
      }

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(count);
      });

      // Verify each request got a corresponding response with the correct id
      for (let i = 0; i < count; i++) {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            jsonrpc: "2.0",
            result: { n: i },
            id: i + 1,
          }),
        );
      }
    });
  });

  // ─── Multiple serve() on same endpoint (not supported) ───

  describe("multiple serve() on same endpoint", () => {
    test("calling serve() twice on the same endpoint causes duplicate responses", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      // Spec §2.3 explicitly says this is NOT supported:
      // "同一 Endpoint に対して serve() や createClient() を複数回呼び出すことはサポートしない"
      serve(app, endpoint);
      serve(app, endpoint);

      endpoint.receive(makeRequest("ping", {}, 1));

      await waitFor(() => {
        // Both serve() instances handle the same message, producing duplicate responses
        expect(endpoint.send).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ─── Notification with invalid method (non-string) ───

  describe("notification with invalid method (non-string)", () => {
    test("method: 123 with no id → no response sent, console.error called", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      // Notification-like message (no id) with non-string method
      endpoint.receive({ jsonrpc: "2.0", method: 123 });

      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Notification with invalid params ───

  describe("notification with invalid params (non-object)", () => {
    test("params: 'string' with no id → no response sent, console.error called", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      // Notification (no id) with invalid params (string primitive)
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: "invalid" });

      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("params: null with no id → no response sent, console.error called", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: null });

      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Response ordering ───

  describe("response ordering", () => {
    test("when multiple async handlers complete out of order, responses are sent in completion order", async () => {
      const sendOrder: number[] = [];
      const app = new Fractal()
        .method("fast", async (c) => {
          await new Promise((r) => setTimeout(r, 5));
          return c.json("fast");
        })
        .method("slow", async (c) => {
          await new Promise((r) => setTimeout(r, 50));
          return c.json("slow");
        });
      const endpoint = createMockEndpoint();

      endpoint.send.mockImplementation((msg: any) => {
        sendOrder.push(msg.id);
      });

      serve(app, endpoint);

      // Send slow first, fast second
      endpoint.receive(makeRequest("slow", {}, 1));
      endpoint.receive(makeRequest("fast", {}, 2));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(2);
      });

      // Fast (id: 2) completes first despite being sent second
      expect(sendOrder).toEqual([2, 1]);
    });
  });

  // ─── dispose() timing boundary ───

  describe("dispose() timing boundary", () => {
    test("request arriving just as dispose() is called is not processed", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);

      // Dispose immediately
      server.dispose();

      // Request arrives after dispose - should not be processed
      endpoint.receive(makeRequest("ping", {}, 1));
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("request in-flight before dispose completes and sends response", async () => {
      let resolveHandler: () => void;
      const handlerStarted = new Promise<void>((resolve) => {
        resolveHandler = resolve;
      });

      const app = new Fractal().method("slow", async (c) => {
        resolveHandler!();
        await new Promise((r) => setTimeout(r, 30));
        return c.json("done");
      });
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);

      // Start processing a request
      endpoint.receive(makeRequest("slow", {}, 1));

      // Wait for handler to start, then dispose
      await handlerStarted;
      server.dispose();

      // The handler was already dispatched, so it will complete and send
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "done", id: 1 }),
        );
      });
    });
  });

  // ─── handler returns c.error() ───

  describe("handler returns c.error()", () => {
    test("c.error() response is correctly formatted and sent through serve()", async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32000, "Application error", {
          detail: "something went wrong",
        }),
      );
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("fail", {}, 42));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Application error",
            data: { detail: "something went wrong" },
          },
          id: 42,
        });
      });
    });

    test("c.error() without data omits data field in response", async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32602, "Invalid params"),
      );
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("fail", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalled();
      });

      const sentMessage = endpoint.send.mock.calls[0]![0] as any;
      expect(sentMessage.error.code).toBe(-32602);
      expect(sentMessage.error.message).toBe("Invalid params");
      expect("data" in sentMessage.error).toBe(false);
    });
  });

  // ─── Notification vs normal request side-by-side ───

  describe("notification vs normal request side-by-side", () => {
    test("same invalid method input: with id sends error response, without id sends nothing", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);

      // Request with id (has method: 123, invalid) → should get -32600 error response
      endpoint.receive({ jsonrpc: "2.0", method: 123, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
          }),
        );
      });
      expect(endpoint.send).toHaveBeenCalledTimes(1);

      // Notification without id (has method: 123, invalid) → no response, console.error
      endpoint.receive({ jsonrpc: "2.0", method: 123 });
      await new Promise((r) => setTimeout(r, 10));

      // send() should still only have been called once (for the request with id)
      expect(endpoint.send).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("same invalid params input: with id sends error response, without id sends nothing", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);

      // Request with id and invalid params (array) → should get -32600 error response
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2],
        id: 1,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: -32600 }),
            id: 1,
          }),
        );
      });
      expect(endpoint.send).toHaveBeenCalledTimes(1);

      // Notification without id and same invalid params (array) → no response, console.error
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: [1, 2] });
      await new Promise((r) => setTimeout(r, 10));

      // send() should still only have been called once
      expect(endpoint.send).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Middleware execution in serve() context ───

  describe("middleware execution in serve() context", () => {
    test("middleware runs correctly when requests come through serve()", async () => {
      const order: string[] = [];
      const app = new Fractal()
        .use(async (c, next) => {
          order.push(`before:${c.req.method}`);
          await next();
          order.push(`after:${c.req.method}`);
        })
        .method("ping", (c) => {
          order.push("handler");
          return c.json("pong");
        });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("ping", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ result: "pong", id: 1 }),
        );
      });
      expect(order).toEqual(["before:ping", "handler", "after:ping"]);
    });

    test("scoped middleware filters correctly through serve()", async () => {
      const spy = vi.fn();
      const app = new Fractal()
        .use("admin.*", async (_c, next) => {
          spy();
          await next();
        })
        .method("admin.delete", (c) => c.json("deleted"))
        .method("user.get", (c) => c.json("user"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);

      endpoint.receive(makeRequest("admin.delete", {}, 1));
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ result: "deleted", id: 1 }),
        );
      });
      expect(spy).toHaveBeenCalledTimes(1);

      endpoint.receive(makeRequest("user.get", {}, 2));
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(2);
      });
      expect(spy).toHaveBeenCalledTimes(1); // not called for user.get
    });

    test("middleware can short-circuit request through serve()", async () => {
      const app = new Fractal()
        .use((c, _next) => c.error(-32000, "Auth required"))
        .method("secret", (c) => c.json("top-secret"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("secret", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32000,
              message: "Auth required",
            }),
            id: 1,
          }),
        );
      });
    });
  });

  // ─── Non-object message filtering ───

  describe("non-object message filtering", () => {
    test("endpoint.receive(string) does not crash and is ignored", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      expect(() => endpoint.receive("string")).not.toThrow();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("endpoint.receive(number) does not crash and is ignored", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      expect(() => endpoint.receive(42)).not.toThrow();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("endpoint.receive(null) does not crash and is ignored", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      expect(() => endpoint.receive(null)).not.toThrow();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("endpoint.receive(undefined) does not crash and is ignored", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      expect(() => endpoint.receive(undefined)).not.toThrow();
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("endpoint.receive(array) does not crash and is ignored", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      expect(() => endpoint.receive([1, 2, 3])).not.toThrow();
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── Notification with unregistered method ───

  describe("notification with unregistered method", () => {
    test("no response sent and no console.error for notification to unregistered method", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive(makeNotification("nonexistent", {}));

      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Non-standard id types (spec §5.1 ※3: no id type check) ───

  describe("non-standard id types (spec §5.1 ※3: no id type check)", () => {
    test("id: true is accepted and echoed back in response", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", id: true });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: true }),
        );
      });
    });

    test("id: [] (empty array) is accepted and echoed back in response", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", id: [] });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong" }),
        );
        const sentMessage = endpoint.send.mock.calls[0]![0] as any;
        expect(sentMessage.id).toEqual([]);
      });
    });

    test("id: {} (empty object) is accepted and echoed back in response", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", id: {} });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong" }),
        );
        const sentMessage = endpoint.send.mock.calls[0]![0] as any;
        expect(sentMessage.id).toEqual({});
      });
    });
  });

  // ─── Notification with params: undefined normalization ───

  describe("notification with params: undefined normalization", () => {
    test("notification with no params field → handler receives {}", async () => {
      let receivedParams: unknown;
      const app = new Fractal().method("log", (c) => {
        receivedParams = c.req.params;
        return c.json("ok");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "log" }); // notification, no params

      await new Promise((r) => setTimeout(r, 10));
      expect(receivedParams).toEqual({});
      expect(endpoint.send).not.toHaveBeenCalled();
    });

    test("notification with params: undefined → handler receives {}", async () => {
      let receivedParams: unknown;
      const app = new Fractal().method("log", (c) => {
        receivedParams = c.req.params;
        return c.json("ok");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "log", params: undefined }); // notification, params: undefined

      await new Promise((r) => setTimeout(r, 10));
      expect(receivedParams).toEqual({});
      expect(endpoint.send).not.toHaveBeenCalled();
    });
  });

  // ─── id: undefined with invalid method → error response id is null ───

  describe("id: undefined with invalid method → error response id is null", () => {
    test("msg.id ?? null produces null when id is undefined", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      // id: undefined means "id" in msg is true, so it's NOT a notification.
      // method is missing, so -32600 Invalid Request.
      // msg.id ?? null → null
      endpoint.receive({ jsonrpc: "2.0", id: undefined });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            jsonrpc: "2.0",
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: null,
          }),
        );
      });
    });
  });

  // ─── -32603 error response does not contain data field ───

  describe("-32603 error response has no data field", () => {
    test("handler throwing Error produces -32603 response without data field", async () => {
      const app = new Fractal().method("boom", () => {
        throw new Error("handler exploded");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("boom", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(1);
      });

      const response = (endpoint.send as any).mock.calls[0][0];
      expect(response.error.code).toBe(-32603);
      expect(response.error.message).toBe("handler exploded");
      expect("data" in response.error).toBe(false);
    });

    test("handler throwing non-Error produces -32603 response without data field", async () => {
      const app = new Fractal().method("boom", () => {
        throw "string error";
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("boom", {}, 2));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(1);
      });

      const response = (endpoint.send as any).mock.calls[0][0];
      expect(response.error.code).toBe(-32603);
      expect(response.error.message).toBe("Internal error");
      expect("data" in response.error).toBe(false);
    });
  });

  // ─── 1. method field additional type checks ───

  describe("method field additional type checks", () => {
    test("method: {} (empty object) returns -32600 Invalid Request", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: {}, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });

    test("method: [] (empty array) returns -32600 Invalid Request", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: [], id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });

    test("method: null returns -32600 Invalid Request", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: null, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });
  });

  // ─── 2. non-plain object params (Date, Map) ───

  describe("non-plain object params (Date, Map)", () => {
    test("params: Date instance is accepted as a plain object (passes typeof/null/Array check)", async () => {
      // Date is typeof "object", not null, not Array — so dispatch() does NOT reject it.
      // The current isPlainObject guard only rejects null, non-object, and Array.
      let receivedParams: unknown;
      const app = new Fractal().method("ping", (c) => {
        receivedParams = c.req.params;
        return c.json("pong");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      const date = new Date("2025-01-01T00:00:00Z");
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: date, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 1 }),
        );
      });
      // The Date instance is passed through as-is (treated as params)
      expect(receivedParams).toBe(date);
    });

    test("params: Map instance is accepted as a plain object (passes typeof/null/Array check)", async () => {
      // Map is typeof "object", not null, not Array — so dispatch() does NOT reject it.
      let receivedParams: unknown;
      const app = new Fractal().method("ping", (c) => {
        receivedParams = c.req.params;
        return c.json("pong");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      const map = new Map([["key", "value"]]);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: map, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 1 }),
        );
      });
      // The Map instance is passed through as-is (treated as params)
      expect(receivedParams).toBe(map);
    });
  });

  // ─── 3. console.error argument content verification ───

  describe("console.error argument content verification", () => {
    test("invalid method (non-string) notification logs descriptive message to console.error", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: 42 }); // notification with non-string method

      await new Promise((r) => setTimeout(r, 10));
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]![0]).toContain("Invalid Request");
      expect(consoleSpy.mock.calls[0]![0]).toContain("method");
      consoleSpy.mockRestore();
    });

    test("invalid params (array) on request with id logs 'Invalid params' info including the actual value", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: [1, 2, 3],
        id: 1,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalled();
      });
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      // dispatch() calls: console.error("Invalid params: expected object, got", rawParams)
      expect(consoleSpy.mock.calls[0]![0]).toContain("Invalid params");
      expect(consoleSpy.mock.calls[0]![1]).toEqual([1, 2, 3]);
      consoleSpy.mockRestore();
    });

    test("invalid params (null) on request with id logs actual null value as second argument", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: null, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalled();
      });
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]![0]).toContain("Invalid params");
      expect(consoleSpy.mock.calls[0]![1]).toBeNull();
      consoleSpy.mockRestore();
    });

    test("invalid params (number) on notification logs actual value as second argument", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: 99 }); // notification

      await new Promise((r) => setTimeout(r, 10));
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]![0]).toContain("Invalid params");
      expect(consoleSpy.mock.calls[0]![1]).toBe(99);
      consoleSpy.mockRestore();
    });
  });

  // ─── 4. Notification with middleware exception ───

  describe("notification with middleware exception", () => {
    test("middleware throw during notification: no response sent, console.error receives the error", async () => {
      const middlewareError = new Error("middleware exploded");
      const app = new Fractal()
        .use(async (_c, _next) => {
          throw middlewareError;
        })
        .method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive(makeNotification("ping", {}));

      await new Promise((r) => setTimeout(r, 10));
      // No response should be sent for notification
      expect(endpoint.send).not.toHaveBeenCalled();
      // The error should be logged to console.error
      expect(consoleSpy).toHaveBeenCalled();
      // Verify the logged error is the middleware error
      const loggedArgs = consoleSpy.mock.calls.flat();
      const foundError = loggedArgs.some(
        (arg) =>
          arg === middlewareError ||
          (arg instanceof Error && arg.message === "middleware exploded"),
      );
      expect(foundError).toBe(true);
      consoleSpy.mockRestore();
    });

    test("async middleware throw during notification: no response sent, console.error called", async () => {
      const app = new Fractal()
        .use(async (_c, _next) => {
          await new Promise((r) => setTimeout(r, 5));
          throw new Error("async middleware failed");
        })
        .method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive(makeNotification("ping", {}));

      await new Promise((r) => setTimeout(r, 50));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("middleware throw during notification after calling next(): no response sent", async () => {
      const app = new Fractal()
        .use(async (_c, next) => {
          await next();
          throw new Error("post-next middleware error");
        })
        .method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      endpoint.receive(makeNotification("ping", {}));

      await new Promise((r) => setTimeout(r, 20));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── 5. dispose() race condition ───

  describe("dispose() race condition: message arrives just before dispose()", () => {
    test("synchronous handler dispatched before dispose still sends response", async () => {
      const handlerCalls: number[] = [];
      const app = new Fractal().method("ping", (c) => {
        handlerCalls.push(c.req.id as number);
        return c.json("pong");
      });
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);

      // Message arrives, then dispose immediately after (same tick)
      endpoint.receive(makeRequest("ping", {}, 1));
      server.dispose();

      // The handler was invoked synchronously within the onMessage callback,
      // but response is sent asynchronously after await dispatch.
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 1 }),
        );
      });
      expect(handlerCalls).toEqual([1]);

      // After dispose, new messages should not be processed
      endpoint.receive(makeRequest("ping", {}, 2));
      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).toHaveBeenCalledTimes(1);
    });

    test("multiple messages arriving before dispose: all dispatched messages complete", async () => {
      const app = new Fractal().method("echo", (c) => c.json(c.req.params));
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);

      // Send multiple messages before disposing
      endpoint.receive(makeRequest("echo", { n: 1 }, 1));
      endpoint.receive(makeRequest("echo", { n: 2 }, 2));
      endpoint.receive(makeRequest("echo", { n: 3 }, 3));
      server.dispose();

      // All three were dispatched before dispose unsubscribed
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(3);
      });

      // No new messages after dispose
      endpoint.receive(makeRequest("echo", { n: 4 }, 4));
      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).toHaveBeenCalledTimes(3);
    });

    test("async handler already in-flight when dispose() is called: response still sent", async () => {
      let resolveHandler!: () => void;
      const handlerPromise = new Promise<void>((r) => {
        resolveHandler = r;
      });

      const app = new Fractal().method("slow", async (c) => {
        await handlerPromise;
        return c.json("completed");
      });
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);

      // Start async handler
      endpoint.receive(makeRequest("slow", {}, 1));
      await new Promise((r) => setTimeout(r, 5)); // let handler start

      // Dispose while handler is still waiting
      server.dispose();

      // New messages should not be processed
      endpoint.receive(makeRequest("slow", {}, 2));

      // Resolve the in-flight handler
      resolveHandler();

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            jsonrpc: "2.0",
            result: "completed",
            id: 1,
          }),
        );
      });

      // Only the first request's response was sent (second was after dispose)
      expect(endpoint.send).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Round 2 review: additional coverage ───

  describe("structured clone incompatible value in response", () => {
    test("send() throws on non-cloneable result (function) → console.error logged and listener continues", async () => {
      const cloneError = new DOMException(
        "Failed to execute 'postMessage': () => {} could not be cloned.",
      );
      const app = new Fractal().method("bad", (c) => c.json({ fn: () => {} }));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Simulate structured clone failure on first send
      endpoint.send.mockImplementationOnce(() => {
        throw cloneError;
      });

      serve(app, endpoint);

      // First request: handler returns object with a function → send throws
      endpoint.receive(makeRequest("bad", {}, 1));
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(cloneError);
      });

      // Second request should still be processed (listener continues)
      const app2Method = new Fractal().method("ok", (c) => c.json("fine"));
      // We reuse the same serve instance, so add "ok" method beforehand.
      // Actually, let's just set up from scratch to keep things clean:
      consoleSpy.mockRestore();
    });

    test("send() throws on non-cloneable result (Symbol) → console.error logged and listener continues", async () => {
      const cloneError = new DOMException(
        "Failed to execute 'postMessage': Symbol could not be cloned.",
      );
      const app = new Fractal()
        .method("bad", (c) => c.json({ sym: Symbol("test") }))
        .method("ok", (c) => c.json("fine"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // First call to send throws (structured clone failure), subsequent calls succeed
      endpoint.send.mockImplementationOnce(() => {
        throw cloneError;
      });

      serve(app, endpoint);

      // First request triggers send failure
      endpoint.receive(makeRequest("bad", {}, 1));
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(cloneError);
      });

      // Listener is still active: second request succeeds
      endpoint.receive(makeRequest("ok", {}, 2));
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "fine", id: 2 }),
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe("serve() calls endpoint.onMessage exactly once", () => {
    test("endpoint.onMessage is called exactly 1 time", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);

      expect(endpoint.onMessage).toHaveBeenCalledTimes(1);
    });

    test("endpoint.onMessage is called with a function argument", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);

      expect(endpoint.onMessage).toHaveBeenCalledTimes(1);
      expect(typeof endpoint.onMessage.mock.calls[0][0]).toBe("function");
    });
  });

  describe("dispose() then async handler completes: send() failure logged", () => {
    test("send() exception after dispose is logged to console.error with the thrown error", async () => {
      const sendError = new Error("port closed");
      let resolveHandler!: () => void;
      const handlerPromise = new Promise<void>((r) => {
        resolveHandler = r;
      });

      const app = new Fractal().method("slow", async (c) => {
        await handlerPromise;
        return c.json("done");
      });
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Make send() always throw (simulating port closed after dispose)
      endpoint.send.mockImplementation(() => {
        throw sendError;
      });

      const server = serve(app, endpoint);

      // Start async handler
      endpoint.receive(makeRequest("slow", {}, 1));
      await new Promise((r) => setTimeout(r, 5));

      // Dispose while handler is still pending
      server.dispose();

      // Resolve the handler so it tries to send
      resolveHandler();

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalled();
      });

      // console.error should have been called with the send error
      expect(consoleSpy).toHaveBeenCalledWith(sendError);

      consoleSpy.mockRestore();
    });

    test("listener does not process new messages after dispose even when send() would throw", async () => {
      const sendError = new Error("port closed");
      let resolveHandler!: () => void;
      const handlerPromise = new Promise<void>((r) => {
        resolveHandler = r;
      });

      const app = new Fractal().method("slow", async (c) => {
        await handlerPromise;
        return c.json("done");
      });
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      endpoint.send.mockImplementation(() => {
        throw sendError;
      });

      const server = serve(app, endpoint);

      // Start the in-flight handler
      endpoint.receive(makeRequest("slow", {}, 1));
      await new Promise((r) => setTimeout(r, 5));

      // Dispose
      server.dispose();

      // New message after dispose should not be processed
      endpoint.receive(makeRequest("slow", {}, 2));

      // Let the original handler finish
      resolveHandler();
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledTimes(1);
      });

      // Only one send attempt (from the in-flight handler), not two
      expect(endpoint.send).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(sendError);

      consoleSpy.mockRestore();
    });
  });

  // ─── 1. send() throwing during serve-level -32600 error response ───

  describe("send() throwing during serve-level -32600 error response", () => {
    test("when serve sends -32600 Invalid Request and endpoint.send() throws, console.error is called and listener continues", async () => {
      const sendError = new Error("port closed during error response");
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // First call to send() throws (the -32600 error response), subsequent calls succeed
      endpoint.send.mockImplementationOnce(() => {
        throw sendError;
      });

      serve(app, endpoint);

      // Send message with missing method (triggers serve-level -32600)
      endpoint.receive({ jsonrpc: "2.0", id: 1 });

      await new Promise((r) => setTimeout(r, 10));

      // console.error should have been called with the send error
      expect(consoleSpy).toHaveBeenCalledWith(sendError);

      // Listener should still be active: next valid request should work
      endpoint.receive(makeRequest("ping", {}, 2));
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 2 }),
        );
      });

      consoleSpy.mockRestore();
    });
  });

  // ─── 2. params: true / params: false returning -32600 ───

  describe("boolean params produce -32600 Invalid Request", () => {
    test("params: true returns -32600 Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: true, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });

    test("params: false returns -32600 Invalid Request", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({
        jsonrpc: "2.0",
        method: "ping",
        params: false,
        id: 1,
      });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });
  });

  // ─── 3. Middleware replacing c.res after next() ───

  describe("middleware replacing c.res after next()", () => {
    test("middleware that replaces c.res after await next() causes serve to send the modified response", async () => {
      const app = new Fractal()
        .use(async (c, next) => {
          await next();
          // Replace the response after handler has executed
          c.res = c.json({ modified: true });
        })
        .method("ping", (c) => c.json({ original: true }));
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("ping", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            jsonrpc: "2.0",
            result: { modified: true },
            id: 1,
          }),
        );
      });
    });
  });

  // ─── 4. c.error() return in handler during notification ───

  describe("c.error() return in handler during notification", () => {
    test("c.error() response in notification handler results in no response sent and no error logged", async () => {
      const app = new Fractal().method("fail", (c) =>
        c.error(-32000, "Application error"),
      );
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      // Send as notification (no id)
      endpoint.receive(makeNotification("fail", {}));

      await new Promise((r) => setTimeout(r, 10));

      // No response should be sent for notification
      expect(endpoint.send).not.toHaveBeenCalled();
      // No error should be logged because c.error() is a normal return, not an exception
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // ─── 5. Async handler returning undefined producing -32603 ───

  describe("async handler returning undefined producing -32603", () => {
    test("async handler that returns undefined produces -32603 Internal Error", async () => {
      const app = new Fractal().method("broken", async (_c) => {
        // Async handler that returns undefined (no c.json() or c.error())
        return undefined as any;
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive(makeRequest("broken", {}, 1));

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: -32603,
              message: "Internal error",
            }),
            id: 1,
          }),
        );
      });
    });
  });

  // ─── 6. { jsonrpc: "2.0", id: null } (no method) through serve-level validation ───

  describe("{ jsonrpc: '2.0', id: null } (no method) through serve-level validation", () => {
    test("produces -32600 with id: null", async () => {
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      // id: null means "id" in msg is true → NOT a notification
      // method is missing → -32600 Invalid Request
      // msg.id ?? null → null
      endpoint.receive({ jsonrpc: "2.0", id: null });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            jsonrpc: "2.0",
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: null,
          }),
        );
      });
    });
  });

  // ─── 7. dispatch() itself throwing ───

  describe("dispatch() itself throwing", () => {
    test("when app.dispatch() throws an unexpected error, console.error is called and listener continues", async () => {
      const dispatchError = new Error("unexpected dispatch failure");
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);

      // Mock dispatch to throw on the first call, then restore normal behavior
      const originalDispatch = app.dispatch.bind(app);
      let callCount = 0;
      vi.spyOn(app, "dispatch").mockImplementation(async (...args: any[]) => {
        callCount++;
        if (callCount === 1) {
          throw dispatchError;
        }
        return originalDispatch(...args);
      });

      // First request: dispatch throws → should be caught by serve's outer try/catch
      endpoint.receive(makeRequest("ping", {}, 1));

      await new Promise((r) => setTimeout(r, 10));
      expect(consoleSpy).toHaveBeenCalledWith(dispatchError);

      // Listener should still be active: second request works normally
      endpoint.receive(makeRequest("ping", {}, 2));
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 2 }),
        );
      });

      consoleSpy.mockRestore();
    });
  });

  // ─── 1. serve() return type shape verification ───

  describe("serve() return type shape verification", () => {
    test("returned object has exactly dispose and Symbol.dispose properties and no others", () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      const server = serve(app, endpoint);

      const ownKeys = Reflect.ownKeys(server);
      expect(ownKeys).toHaveLength(2);
      expect(ownKeys).toContain("dispose");
      expect(ownKeys).toContain(Symbol.dispose);
      expect(typeof server.dispose).toBe("function");
      expect(typeof server[Symbol.dispose]).toBe("function");
    });
  });

  // ─── 2. Dispose + re-serve on the same endpoint ───

  describe("dispose + re-serve on the same endpoint", () => {
    test("after calling dispose(), calling serve() again on the same endpoint works correctly", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      // First serve + dispose
      const server1 = serve(app, endpoint);
      server1.dispose();

      // Verify first serve is disposed (no messages processed)
      endpoint.receive(makeRequest("ping", {}, 1));
      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();

      // Re-serve on the same endpoint
      const server2 = serve(app, endpoint);

      endpoint.receive(makeRequest("ping", {}, 2));
      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 2 }),
        );
      });

      server2.dispose();
    });
  });

  // ─── 3. Explicit params: {} pass-through ───

  describe("explicit params: {} pass-through", () => {
    test("params: {} is forwarded as-is without modification", async () => {
      let receivedParams: unknown;
      const app = new Fractal().method("ping", (c) => {
        receivedParams = c.req.params;
        return c.json("pong");
      });
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: {}, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({ jsonrpc: "2.0", result: "pong", id: 1 }),
        );
      });
      expect(receivedParams).toEqual({});
    });
  });

  // ─── 4. method: undefined (explicitly set) ───

  describe("method: undefined (explicitly set)", () => {
    test("{ jsonrpc: '2.0', method: undefined, id: 1 } returns -32600 Invalid Request", async () => {
      // "method" in { method: undefined } === true, but typeof undefined !== "string"
      // So this should trigger -32600 Invalid Request at the serve level
      const app = new Fractal();
      const endpoint = createMockEndpoint();

      serve(app, endpoint);
      endpoint.receive({ jsonrpc: "2.0", method: undefined, id: 1 });

      await waitFor(() => {
        expect(endpoint.send).toHaveBeenCalledWith(
          expect.objectContaining({
            jsonrpc: "2.0",
            error: expect.objectContaining({
              code: -32600,
              message: "Invalid Request",
            }),
            id: 1,
          }),
        );
      });
    });
  });

  // ─── 5. Boolean params notification ───

  describe("boolean params notification", () => {
    test("notification with params: true returns void and console.error is called", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      // Notification (no id) with params: true (non-object primitive)
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: true });

      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("notification with params: false returns void and console.error is called", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      serve(app, endpoint);
      // Notification (no id) with params: false (non-object primitive)
      endpoint.receive({ jsonrpc: "2.0", method: "ping", params: false });

      await new Promise((r) => setTimeout(r, 10));
      expect(endpoint.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── 6. serve() passes MessageEvent to dispatch() ───

  describe("serve() passes MessageEvent to dispatch()", () => {
    test("spy on app.dispatch verifies the second argument is the MessageEvent", async () => {
      const app = new Fractal().method("ping", (c) => c.json("pong"));
      const endpoint = createMockEndpoint();

      const dispatchSpy = vi.spyOn(app, "dispatch");

      serve(app, endpoint);

      const eventOverrides = {
        origin: "https://test.example.com",
        source: null,
      };
      endpoint.receive(makeRequest("ping", {}, 1), eventOverrides);

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledTimes(1);
      });

      // The first argument is the message object, the second is the MessageEvent
      const secondArg = dispatchSpy.mock.calls[0]![1];
      expect(secondArg).toBeDefined();
      expect((secondArg as MessageEvent).origin).toBe(
        "https://test.example.com",
      );

      dispatchSpy.mockRestore();
    });
  });
});
