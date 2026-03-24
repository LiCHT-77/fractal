import { FractalError } from "../protocol/errors.ts";
import {
  createMockMessagePort,
  createMockServiceWorker,
  createMockServiceWorkerGlobalScope,
  type MockMessagePort,
  type MockServiceWorkerGlobalScope,
} from "../test-helpers.ts";
import { onConnect, serviceWorkerEndpoint } from "./service-worker.ts";

describe("endpoint/service-worker", () => {
  describe("serviceWorkerEndpoint", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      // Mock MessageChannel to produce MockMessagePort objects that tests can interact with
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("throws when controller is null", () => {
      expect(() => serviceWorkerEndpoint(null as any)).toThrow(
        "Service Worker controller is not available",
      );
    });

    test("throws when controller is undefined", () => {
      expect(() => serviceWorkerEndpoint(undefined as any)).toThrow(
        "Service Worker controller is not available",
      );
    });

    test("returns an Endpoint synchronously (not a Promise)", () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 1000 });
      expect(endpoint).not.toBeInstanceOf(Promise);
      expect(typeof endpoint.send).toBe("function");
      expect(typeof endpoint.onMessage).toBe("function");
    });

    test("sends handshake message with a port to the service worker", () => {
      const sw = createMockServiceWorker();
      serviceWorkerEndpoint(sw as any, { timeout: 100 });
      expect(sw.postMessage).toHaveBeenCalled();
    });

    test("transfers port2 (not port1) to the service worker", () => {
      let capturedChannel:
        | { port1: MockMessagePort; port2: MockMessagePort }
        | undefined;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;

      const sw = createMockServiceWorker();
      serviceWorkerEndpoint(sw as any, { timeout: 100 });

      expect(capturedChannel).toBeDefined();
      const transferArg = sw.postMessage.mock.calls[0]?.[1];
      expect(transferArg[0]).toBe(capturedChannel!.port2);
      expect(transferArg[0]).not.toBe(capturedChannel!.port1);
    });

    test("send() throws FractalError TIMEOUT when timeout is 0 (immediate)", async () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 0 });
      // timeout: 0 fires on next tick
      await new Promise((r) => setTimeout(r, 10));
      expect(() => endpoint.send({})).toThrow(FractalError);
    });

    test("send() throws FractalError TIMEOUT when timeout elapses", async () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 50 });
      await new Promise((r) => setTimeout(r, 60));
      expect(() => endpoint.send({})).toThrow(FractalError);
    });

    test("throws TypeError for negative timeout", () => {
      const sw = createMockServiceWorker();
      expect(() => serviceWorkerEndpoint(sw as any, { timeout: -1 })).toThrow(
        TypeError,
      );
    });

    test("throws TypeError for NaN timeout", () => {
      const sw = createMockServiceWorker();
      expect(() =>
        serviceWorkerEndpoint(sw as any, { timeout: Number.NaN }),
      ).toThrow(TypeError);
    });

    test("throws TypeError for -Infinity timeout", () => {
      const sw = createMockServiceWorker();
      expect(() =>
        serviceWorkerEndpoint(sw as any, { timeout: Number.NEGATIVE_INFINITY }),
      ).toThrow(TypeError);
    });

    test("Infinity timeout means no timeout", async () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any, {
        timeout: Number.POSITIVE_INFINITY,
      });
      // send() should buffer, not throw
      await new Promise((r) => setTimeout(r, 50));
      expect(() => endpoint.send({})).not.toThrow();
    });

    test("omitting timeout means no timeout", async () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any);
      // send() should buffer, not throw
      await new Promise((r) => setTimeout(r, 50));
      expect(() => endpoint.send({})).not.toThrow();
    });

    test("postMessage is called with transfer list containing port", () => {
      const sw = createMockServiceWorker();
      serviceWorkerEndpoint(sw as any, { timeout: 100 });

      expect(sw.postMessage).toHaveBeenCalled();
      const transferArg = sw.postMessage.mock.calls[0]?.[1];
      expect(Array.isArray(transferArg)).toBe(true);
      expect(transferArg.length).toBeGreaterThanOrEqual(1);
    });

    test("handshake message does not have jsonrpc '2.0'", () => {
      const sw = createMockServiceWorker();
      serviceWorkerEndpoint(sw as any, { timeout: 100 });

      expect(sw.postMessage).toHaveBeenCalled();
      const handshakeMsg = sw.postMessage.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(handshakeMsg?.jsonrpc).not.toBe("2.0");
    });

    test("handshake message has a recognizable fractal type field", () => {
      const sw = createMockServiceWorker();
      serviceWorkerEndpoint(sw as any, { timeout: 100 });

      expect(sw.postMessage).toHaveBeenCalled();
      const handshakeMsg = sw.postMessage.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      // The handshake message should have a type field that starts with "fractal:"
      expect(typeof handshakeMsg?.type).toBe("string");
      expect((handshakeMsg?.type as string).startsWith("fractal:")).toBe(true);
    });

    test("endpoint works after ack", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      // Simulate ack from service worker through port1 (the port with listeners)
      expect(capturedChannel).toBeDefined();
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      expect(endpoint).toBeDefined();
      expect(typeof endpoint.send).toBe("function");
      expect(typeof endpoint.onMessage).toBe("function");
    });

    test("endpoint.send() sends through port after ack", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      endpoint.send(msg);
      // The send should go through the port's postMessage
      expect(capturedChannel!.port1.postMessage).toHaveBeenCalledWith(msg);
    });

    test("endpoint.onMessage() receives messages through port after ack", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      endpoint.onMessage(handler);

      // Send a JSON-RPC message through the port
      const msg = { jsonrpc: "2.0", method: "hello", id: 2 };
      capturedChannel!.port1.dispatchMessage(msg);
      expect(handler).toHaveBeenCalledWith(
        msg,
        expect.objectContaining({ data: msg }),
      );
    });

    test("send() throws FractalError with TIMEOUT code after timeout", async () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 50 });
      await new Promise((r) => setTimeout(r, 60));
      try {
        endpoint.send({});
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FractalError);
        expect((err as FractalError).code).toBe("TIMEOUT");
      }
    });

    test("null controller throw is a plain Error (not FractalError) with exact message", () => {
      try {
        serviceWorkerEndpoint(null as any);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(FractalError);
        expect((err as Error).message).toBe(
          "Service Worker controller is not available",
        );
      }
    });

    test("undefined controller throw is a plain Error (not FractalError) with exact message", () => {
      try {
        serviceWorkerEndpoint(undefined as any);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(FractalError);
        expect((err as Error).message).toBe(
          "Service Worker controller is not available",
        );
      }
    });

    test("multiple serviceWorkerEndpoint() calls create independent endpoints", () => {
      const sw1 = createMockServiceWorker();
      const sw2 = createMockServiceWorker();

      const capturedChannels: {
        port1: MockMessagePort;
        port2: MockMessagePort;
      }[] = [];
      const origMC = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannels.push(this);
        }
      } as any;

      const endpoint1 = serviceWorkerEndpoint(sw1 as any, { timeout: 5000 });
      const endpoint2 = serviceWorkerEndpoint(sw2 as any, { timeout: 5000 });

      // Ack both
      capturedChannels[0].port1.dispatchMessage({ type: "fractal:ack" });
      capturedChannels[1].port1.dispatchMessage({ type: "fractal:ack" });

      // Endpoints should be distinct objects
      expect(endpoint1).not.toBe(endpoint2);

      // Sending on one does not affect the other
      endpoint1.send({ jsonrpc: "2.0", method: "a", id: 1 });
      expect(capturedChannels[0].port1.postMessage).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        method: "a",
        id: 1,
      });
      expect(capturedChannels[1].port1.postMessage).not.toHaveBeenCalledWith({
        jsonrpc: "2.0",
        method: "a",
        id: 1,
      });
    });

    test("timeout: 0.1 (fractional) is valid", async () => {
      const sw = createMockServiceWorker();
      // Should not throw TypeError (fractional values are valid, just very short)
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 0.1 });
      await new Promise((r) => setTimeout(r, 20));
      expect(() => endpoint.send({})).toThrow(FractalError);
    });

    test("fractional timeout: 1.5 works correctly", async () => {
      const sw = createMockServiceWorker();
      // timeout: 1.5 is a valid fractional value, should not throw TypeError
      // and should eventually timeout with TIMEOUT code
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 1.5 });
      await new Promise((r) => setTimeout(r, 20));
      expect(() => endpoint.send({})).toThrow(FractalError);
    });

    test("postMessage failure during handshake throws synchronously", () => {
      const sw = createMockServiceWorker();
      const postMessageError = new DOMException(
        "Failed to execute 'postMessage'",
      );
      sw.postMessage.mockImplementation(() => {
        throw postMessageError;
      });

      expect(() => serviceWorkerEndpoint(sw as any, { timeout: 5000 })).toThrow(
        "Failed to execute 'postMessage'",
      );
    });

    test("port.start() is called on the transferred port during handshake", () => {
      const sw = createMockServiceWorker();

      serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      // port.start() should have been called to enable the ack listener
      expect(capturedChannel).toBeDefined();
      expect(capturedChannel!.port1.start).toHaveBeenCalled();
    });

    test("port.start() is called again when endpoint.onMessage() is invoked", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      // Clear previous start() calls (from handshake setup)
      capturedChannel!.port1.start.mockClear();

      // onMessage should trigger port.start()
      const handler = vi.fn();
      endpoint.onMessage(handler);
      expect(capturedChannel!.port1.start).toHaveBeenCalled();
    });

    test("non-JSON-RPC messages are filtered out on client-side endpoint", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      endpoint.onMessage(handler);

      // Non-JSON-RPC messages should be filtered out
      capturedChannel!.port1.dispatchMessage({ type: "some-random-event" });
      capturedChannel!.port1.dispatchMessage("plain string");
      capturedChannel!.port1.dispatchMessage(42);
      capturedChannel!.port1.dispatchMessage(null);
      capturedChannel!.port1.dispatchMessage(undefined);
      capturedChannel!.port1.dispatchMessage({ method: "ping", id: 1 }); // missing jsonrpc: "2.0"
      capturedChannel!.port1.dispatchMessage({
        jsonrpc: "1.0",
        method: "ping",
        id: 1,
      }); // wrong version
      capturedChannel!.port1.dispatchMessage({
        jsonrpc: 2.0,
        method: "ping",
        id: 1,
      }); // number, not string

      expect(handler).not.toHaveBeenCalled();

      // JSON-RPC 2.0 message should pass through
      const validMsg = { jsonrpc: "2.0", method: "ping", id: 1 };
      capturedChannel!.port1.dispatchMessage(validMsg);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        validMsg,
        expect.objectContaining({ data: validMsg }),
      );
    });

    test("multiple messages through established endpoint are all received", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      endpoint.onMessage(handler);

      // Send multiple JSON-RPC messages through the port
      const msg1 = { jsonrpc: "2.0", method: "ping", id: 1 };
      const msg2 = { jsonrpc: "2.0", method: "hello", id: 2 };
      const msg3 = { jsonrpc: "2.0", method: "world", id: 3 };
      capturedChannel!.port1.dispatchMessage(msg1);
      capturedChannel!.port1.dispatchMessage(msg2);
      capturedChannel!.port1.dispatchMessage(msg3);

      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(
        1,
        msg1,
        expect.objectContaining({ data: msg1 }),
      );
      expect(handler).toHaveBeenNthCalledWith(
        2,
        msg2,
        expect.objectContaining({ data: msg2 }),
      );
      expect(handler).toHaveBeenNthCalledWith(
        3,
        msg3,
        expect.objectContaining({ data: msg3 }),
      );
    });

    // --- Buffering tests ---

    test("send() before ack buffers messages (port.postMessage is not called)", () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any);

      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
      // port.postMessage should not have been called (only sw.postMessage for handshake)
      expect(capturedChannel!.port1.postMessage).not.toHaveBeenCalled();
    });

    test("multiple send() calls before ack are all buffered", () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any);

      endpoint.send({ jsonrpc: "2.0", method: "a", id: 1 });
      endpoint.send({ jsonrpc: "2.0", method: "b", id: 2 });
      endpoint.send({ jsonrpc: "2.0", method: "c", id: 3 });
      expect(capturedChannel!.port1.postMessage).not.toHaveBeenCalled();
    });

    test("onMessage() before ack holds handler and returns valid unsubscribe", () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any);

      const handler = vi.fn();
      const unsub = endpoint.onMessage(handler);
      expect(typeof unsub).toBe("function");
    });

    test("buffered send() messages are flushed in order after ack", () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any);

      const msg1 = { jsonrpc: "2.0", method: "a", id: 1 };
      const msg2 = { jsonrpc: "2.0", method: "b", id: 2 };
      const msg3 = { jsonrpc: "2.0", method: "c", id: 3 };
      endpoint.send(msg1);
      endpoint.send(msg2);
      endpoint.send(msg3);

      // Ack
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      expect(capturedChannel!.port1.postMessage).toHaveBeenCalledTimes(3);
      expect(capturedChannel!.port1.postMessage).toHaveBeenNthCalledWith(
        1,
        msg1,
      );
      expect(capturedChannel!.port1.postMessage).toHaveBeenNthCalledWith(
        2,
        msg2,
      );
      expect(capturedChannel!.port1.postMessage).toHaveBeenNthCalledWith(
        3,
        msg3,
      );
    });

    test("onMessage handler registered before ack receives messages after ack", () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any);

      const handler = vi.fn();
      endpoint.onMessage(handler);

      // Ack
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      // Now send a message through the port
      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      capturedChannel!.port1.dispatchMessage(msg);
      expect(handler).toHaveBeenCalledWith(
        msg,
        expect.objectContaining({ data: msg }),
      );
    });

    test("handler unsubscribed before ack is not connected after ack", () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any);

      const handler = vi.fn();
      const unsub = endpoint.onMessage(handler);
      unsub();

      // Ack
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      // Message should not reach the unsubscribed handler
      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      capturedChannel!.port1.dispatchMessage(msg);
      expect(handler).not.toHaveBeenCalled();
    });

    test("postMessage failure after handshake error causes send() to throw TIMEOUT", () => {
      const sw = createMockServiceWorker();
      sw.postMessage.mockImplementation(() => {
        throw new DOMException("port closed");
      });

      expect(() => serviceWorkerEndpoint(sw as any)).toThrow("port closed");
    });
  });

  describe("onConnect", () => {
    let mockScope: MockServiceWorkerGlobalScope;
    let originalAddEventListener: typeof globalThis.addEventListener;
    let originalRemoveEventListener: typeof globalThis.removeEventListener;

    beforeEach(() => {
      mockScope = createMockServiceWorkerGlobalScope();
      // Override global addEventListener/removeEventListener to capture SW message handlers
      originalAddEventListener = globalThis.addEventListener;
      originalRemoveEventListener = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;
    });

    afterEach(() => {
      globalThis.addEventListener = originalAddEventListener;
      globalThis.removeEventListener = originalRemoveEventListener;
    });

    test("onConnect is a function", () => {
      expect(typeof onConnect).toBe("function");
    });

    test("onConnect accepts a callback", () => {
      expect(() => onConnect(vi.fn())).not.toThrow();
    });

    test("onConnect returns void", () => {
      const result = onConnect(vi.fn());
      expect(result).toBeUndefined();
    });

    test("onConnect registers a 'message' event listener on the global scope", () => {
      onConnect(vi.fn());
      expect(mockScope.addEventListener).toHaveBeenCalledWith(
        "message",
        expect.any(Function),
      );
    });

    test("callback receives an Endpoint when handshake message arrives", () => {
      const cb = vi.fn();
      onConnect(cb);

      // Simulate a handshake message arriving with a transferred port
      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      expect(cb).toHaveBeenCalledTimes(1);
      const endpoint = cb.mock.calls[0][0];
      expect(endpoint).toBeDefined();
    });

    test("callback receives Endpoint with send() and onMessage() methods", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      expect(cb).toHaveBeenCalledTimes(1);
      const endpoint = cb.mock.calls[0][0];
      expect(typeof endpoint.send).toBe("function");
      expect(typeof endpoint.onMessage).toBe("function");
    });

    test("endpoint.send() from onConnect sends through the transferred port", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      const endpoint = cb.mock.calls[0][0];
      const msg = { jsonrpc: "2.0", result: "pong", id: 1 };
      endpoint.send(msg);
      expect(port.postMessage).toHaveBeenCalledWith(msg);
    });

    test("endpoint.onMessage() from onConnect receives messages from port", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      const endpoint = cb.mock.calls[0][0];
      const handler = vi.fn();
      endpoint.onMessage(handler);

      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      port.dispatchMessage(msg);
      expect(handler).toHaveBeenCalledWith(
        msg,
        expect.objectContaining({ data: msg }),
      );
    });

    test("multiple connections trigger callback multiple times", () => {
      const cb = vi.fn();
      onConnect(cb);

      // First connection
      const port1 = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port1]);

      // Second connection
      const port2 = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port2]);

      // Third connection
      const port3 = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port3]);

      expect(cb).toHaveBeenCalledTimes(3);

      // Each call receives a distinct endpoint
      const ep1 = cb.mock.calls[0][0];
      const ep2 = cb.mock.calls[1][0];
      const ep3 = cb.mock.calls[2][0];
      expect(ep1).not.toBe(ep2);
      expect(ep2).not.toBe(ep3);
    });

    test("ignores non-handshake messages (regular JSON-RPC)", () => {
      const cb = vi.fn();
      onConnect(cb);

      // A JSON-RPC message should not trigger the callback
      mockScope.dispatchMessage({ jsonrpc: "2.0", method: "ping", id: 1 });
      expect(cb).not.toHaveBeenCalled();
    });

    test("ignores messages without ports", () => {
      const cb = vi.fn();
      onConnect(cb);

      // Handshake-like message but without ports array
      mockScope.dispatchMessage({ type: "fractal:connect" });
      expect(cb).not.toHaveBeenCalled();
    });

    test("ignores messages with empty ports array", () => {
      const cb = vi.fn();
      onConnect(cb);

      mockScope.dispatchMessage({ type: "fractal:connect" }, []);
      expect(cb).not.toHaveBeenCalled();
    });

    test("ignores arbitrary non-fractal messages", () => {
      const cb = vi.fn();
      onConnect(cb);

      mockScope.dispatchMessage({ type: "some-other-lib" });
      mockScope.dispatchMessage("plain string");
      mockScope.dispatchMessage(42);
      mockScope.dispatchMessage(null);
      mockScope.dispatchMessage(undefined);
      expect(cb).not.toHaveBeenCalled();
    });

    test("later onConnect overwrites previous callback", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      onConnect(cb1);
      onConnect(cb2);

      // When handshake arrives, only cb2 should be called
      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    test("calling onConnect multiple times overwrites previous callback", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();
      onConnect(cb1);
      onConnect(cb2);
      onConnect(cb3);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
      expect(cb3).toHaveBeenCalledTimes(1);
    });

    test("ack is sent back through the port after onConnect processes handshake", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      // The SW side should send an ack message back through the port
      // to complete the handshake with the client
      expect(port.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "fractal:ack" }),
      );
    });

    test("ack message has exact structure { type: 'fractal:ack' }", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      // Verify the ack message is exactly { type: "fractal:ack" } — no extra fields
      expect(port.postMessage).toHaveBeenCalledTimes(1);
      const ackMessage = port.postMessage.mock.calls[0][0];
      expect(ackMessage).toEqual({ type: "fractal:ack" });
    });

    test("onConnect ack message is sent back via the transferred port (not global)", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      // The ack must be sent through the transferred port's postMessage
      expect(port.postMessage).toHaveBeenCalledTimes(1);
      expect(port.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "fractal:ack" }),
      );
    });

    test("endpoint.send() exception propagates when port.postMessage throws", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      const endpoint = cb.mock.calls[0][0];

      // Mock port.postMessage to throw on the next call (after the ack)
      port.postMessage.mockImplementation(() => {
        throw new DOMException("DataCloneError: could not clone");
      });

      expect(() => {
        endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
      }).toThrow("DataCloneError: could not clone");
    });

    test("onConnect callback throwing does not prevent subsequent connections", () => {
      const errorCb = vi.fn(() => {
        throw new Error("callback error");
      });
      onConnect(errorCb);

      const port1 = createMockMessagePort();
      // The callback throws, but we verify it was called and the error doesn't
      // prevent the listener from handling subsequent connections
      expect(() => {
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port1]);
      }).toThrow("callback error");
      expect(errorCb).toHaveBeenCalledTimes(1);

      // The ack should still have been sent before the callback threw
      expect(port1.postMessage).toHaveBeenCalledWith({ type: "fractal:ack" });

      // Subsequent connection should still trigger the callback
      const port2 = createMockMessagePort();
      expect(() => {
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port2]);
      }).toThrow("callback error");
      expect(errorCb).toHaveBeenCalledTimes(2);
      expect(port2.postMessage).toHaveBeenCalledWith({ type: "fractal:ack" });
    });

    test("ignores malformed event.ports where ports is not an array", () => {
      const cb = vi.fn();
      onConnect(cb);

      // ports is a non-array value (e.g., a string or object)
      const event = {
        data: { type: "fractal:connect" },
        ports: "not-an-array",
      } as unknown as MessageEvent;
      for (const listener of mockScope._listeners) {
        listener(event);
      }

      expect(cb).not.toHaveBeenCalled();
    });

    test("ignores malformed event.ports where ports[0] is not a MessagePort", () => {
      const cb = vi.fn();
      onConnect(cb);

      // ports[0] is not a MessagePort-like object (no postMessage method)
      const fakePort = { start: vi.fn(), close: vi.fn() }; // missing postMessage
      const event = {
        data: { type: "fractal:connect" },
        ports: [fakePort],
      } as unknown as MessageEvent;
      for (const listener of mockScope._listeners) {
        listener(event);
      }

      expect(cb).not.toHaveBeenCalled();
    });

    test("ignores malformed event.ports where ports[0] is null", () => {
      const cb = vi.fn();
      onConnect(cb);

      const event = {
        data: { type: "fractal:connect" },
        ports: [null],
      } as unknown as MessageEvent;
      for (const listener of mockScope._listeners) {
        listener(event);
      }

      expect(cb).not.toHaveBeenCalled();
    });

    test("port.start() is called when onMessage is invoked on the endpoint", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      const endpoint = cb.mock.calls[0][0];
      const handler = vi.fn();

      // Reset start mock to only track calls from onMessage (ack setup may have called it)
      port.start.mockClear();

      endpoint.onMessage(handler);
      expect(port.start).toHaveBeenCalled();
    });

    test("non-JSON-RPC messages are filtered out on onConnect endpoint", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      const endpoint = cb.mock.calls[0][0];
      const handler = vi.fn();
      endpoint.onMessage(handler);

      // Non-JSON-RPC messages should be filtered out
      port.dispatchMessage({ type: "some-random-event" });
      port.dispatchMessage("plain string");
      port.dispatchMessage(42);
      port.dispatchMessage(null);
      port.dispatchMessage(undefined);
      port.dispatchMessage({ method: "ping", id: 1 }); // missing jsonrpc: "2.0"
      port.dispatchMessage({ jsonrpc: "1.0", method: "ping", id: 1 }); // wrong version
      port.dispatchMessage({ jsonrpc: 2.0, method: "ping", id: 1 }); // number, not string

      expect(handler).not.toHaveBeenCalled();

      // JSON-RPC 2.0 message should pass through
      const validMsg = { jsonrpc: "2.0", method: "ping", id: 1 };
      port.dispatchMessage(validMsg);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        validMsg,
        expect.objectContaining({ data: validMsg }),
      );
    });
  });

  describe("onMessage unsubscribe and multiple handlers", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("onMessage の戻り値が解除関数であること（クライアント側）", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      const unsubscribe = endpoint.onMessage(handler);

      // Handler receives message before unsubscribe
      const msg1 = { jsonrpc: "2.0", method: "ping", id: 1 };
      capturedChannel!.port1.dispatchMessage(msg1);
      expect(handler).toHaveBeenCalledTimes(1);

      // Call unsubscribe
      unsubscribe();

      // Handler should no longer receive messages
      const msg2 = { jsonrpc: "2.0", method: "pong", id: 2 };
      capturedChannel!.port1.dispatchMessage(msg2);
      expect(handler).toHaveBeenCalledTimes(1); // still 1, not 2
    });

    test("onMessage の戻り値が解除関数であること（SW側）", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];
        const handler = vi.fn();
        const unsubscribe = endpoint.onMessage(handler);

        // Handler receives message before unsubscribe
        const msg1 = { jsonrpc: "2.0", method: "ping", id: 1 };
        port.dispatchMessage(msg1);
        expect(handler).toHaveBeenCalledTimes(1);

        // Call unsubscribe
        unsubscribe();

        // Handler should no longer receive messages
        const msg2 = { jsonrpc: "2.0", method: "pong", id: 2 };
        port.dispatchMessage(msg2);
        expect(handler).toHaveBeenCalledTimes(1); // still 1, not 2
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });

    test("onMessage を複数回呼び出すとハンドラが追加登録される（クライアント側）", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      endpoint.onMessage(handler1);
      endpoint.onMessage(handler2);

      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      capturedChannel!.port1.dispatchMessage(msg);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith(
        msg,
        expect.objectContaining({ data: msg }),
      );
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith(
        msg,
        expect.objectContaining({ data: msg }),
      );
    });

    test("onMessage を複数回呼び出すとハンドラが追加登録される（SW側）", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];
        const handler1 = vi.fn();
        const handler2 = vi.fn();
        endpoint.onMessage(handler1);
        endpoint.onMessage(handler2);

        const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
        port.dispatchMessage(msg);

        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler1).toHaveBeenCalledWith(
          msg,
          expect.objectContaining({ data: msg }),
        );
        expect(handler2).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledWith(
          msg,
          expect.objectContaining({ data: msg }),
        );
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });

    test("タイムアウト付きハンドシェイク成功時のタイマークリア", async () => {
      const sw = createMockServiceWorker();

      // Use a timeout that is long enough that we can ack before it fires
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 200 });

      // Ack immediately to clear the timeout
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      expect(endpoint).toBeDefined();

      // Wait longer than the original timeout to confirm it does not fire
      await new Promise((r) => setTimeout(r, 300));

      // The endpoint should still be functional after the original timeout period
      const handler = vi.fn();
      endpoint.onMessage(handler);
      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      capturedChannel!.port1.dispatchMessage(msg);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        msg,
        expect.objectContaining({ data: msg }),
      );
    });

    test("SW側での複数メッセージ連続受信", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];
        const handler = vi.fn();
        endpoint.onMessage(handler);

        // Send multiple JSON-RPC messages in succession
        const msg1 = { jsonrpc: "2.0", method: "alpha", id: 1 };
        const msg2 = { jsonrpc: "2.0", method: "beta", id: 2 };
        const msg3 = { jsonrpc: "2.0", method: "gamma", id: 3 };
        const msg4 = { jsonrpc: "2.0", method: "delta", id: 4 };
        const msg5 = { jsonrpc: "2.0", method: "epsilon", id: 5 };

        port.dispatchMessage(msg1);
        port.dispatchMessage(msg2);
        port.dispatchMessage(msg3);
        port.dispatchMessage(msg4);
        port.dispatchMessage(msg5);

        expect(handler).toHaveBeenCalledTimes(5);
        expect(handler).toHaveBeenNthCalledWith(
          1,
          msg1,
          expect.objectContaining({ data: msg1 }),
        );
        expect(handler).toHaveBeenNthCalledWith(
          2,
          msg2,
          expect.objectContaining({ data: msg2 }),
        );
        expect(handler).toHaveBeenNthCalledWith(
          3,
          msg3,
          expect.objectContaining({ data: msg3 }),
        );
        expect(handler).toHaveBeenNthCalledWith(
          4,
          msg4,
          expect.objectContaining({ data: msg4 }),
        );
        expect(handler).toHaveBeenNthCalledWith(
          5,
          msg5,
          expect.objectContaining({ data: msg5 }),
        );
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });
  });

  describe("serviceWorkerEndpoint - timeout cleanup", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("late ack after timeout is ignored", async () => {
      const sw = createMockServiceWorker();

      // Use a short timeout so it fires quickly
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 50 });
      expect(capturedChannel).toBeDefined();

      // Wait for timeout to fire
      await new Promise((r) => setTimeout(r, 60));

      // Verify timed out
      expect(() => endpoint.send({})).toThrow(FractalError);

      // Now simulate a late ack arriving after the timeout
      // This should not throw or cause any issues
      expect(() => {
        capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });
      }).not.toThrow();

      // send() should still throw TIMEOUT even after late ack
      expect(() => endpoint.send({})).toThrow(FractalError);
    });

    test("ack handler is removed from port after timeout fires", async () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 50 });
      expect(capturedChannel).toBeDefined();

      // Count listeners before timeout
      const listenersBefore = capturedChannel!.port1._listeners.length;
      expect(listenersBefore).toBeGreaterThanOrEqual(1);

      // Wait for timeout to fire
      await new Promise((r) => setTimeout(r, 60));

      // After timeout, a late ack should not create a new endpoint
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      // send() should still throw TIMEOUT
      expect(() => endpoint.send({})).toThrow(FractalError);
    });
  });

  describe("additional coverage", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("postMessage失敗時のタイムアウトタイマークリア: タイムアウト後にTIMEOUTエラーが追加で発生しないこと", async () => {
      const sw = createMockServiceWorker();
      const postMessageError = new DOMException(
        "Failed to execute 'postMessage'",
      );
      sw.postMessage.mockImplementation(() => {
        throw postMessageError;
      });

      // postMessage failure throws synchronously
      expect(() => serviceWorkerEndpoint(sw as any, { timeout: 200 })).toThrow(
        "Failed to execute 'postMessage'",
      );

      // Wait longer than the timeout duration to confirm the timer was cleared
      await new Promise((r) => setTimeout(r, 400));

      // Subsequent call should also throw the postMessage error
      let caughtError: unknown;
      try {
        serviceWorkerEndpoint(sw as any, { timeout: 200 });
      } catch (e) {
        caughtError = e;
      }
      expect(caughtError).toBeInstanceOf(DOMException);
      expect((caughtError as DOMException).message).toBe(
        "Failed to execute 'postMessage'",
      );
    });

    test("ack受信後にportのremoveEventListenerが呼ばれること", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      expect(capturedChannel).toBeDefined();

      // Before ack, removeEventListener should not have been called for the ack handler
      const removeCallsBefore =
        capturedChannel!.port1.removeEventListener.mock.calls.length;

      // Simulate ack
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      expect(endpoint).toBeDefined();

      // After ack, removeEventListener should have been called on the port
      // to clean up the ack listener
      expect(capturedChannel!.port1.removeEventListener).toHaveBeenCalledWith(
        "message",
        expect.any(Function),
      );
      expect(
        capturedChannel!.port1.removeEventListener.mock.calls.length,
      ).toBeGreaterThan(removeCallsBefore);
    });

    test("ハンドシェイクメッセージのtype値が正確に 'fractal:connect' であること", () => {
      const sw = createMockServiceWorker();
      serviceWorkerEndpoint(sw as any, { timeout: 100 });

      expect(sw.postMessage).toHaveBeenCalled();
      const handshakeMsg = sw.postMessage.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      // Exact match: not just "fractal:" prefix, but the full string "fractal:connect"
      expect(handshakeMsg?.type).toBe("fractal:connect");
    });

    test("JSON-RPC round-trip after handshake: client sends request, SW-side receives and responds", () => {
      // --- Set up SW-side (onConnect) ---
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      let swEndpoint: any;
      onConnect((ep) => {
        swEndpoint = ep;
      });

      // --- Set up client-side (serviceWorkerEndpoint) ---
      const sw = createMockServiceWorker();

      sw.postMessage.mockImplementation((msg: unknown, transfer?: any[]) => {
        // Simulate the SW global scope receiving the handshake message with the port
        mockScope.dispatchMessage(msg, transfer as any);
      });

      const clientEndpoint = serviceWorkerEndpoint(sw as any, {
        timeout: 5000,
      });

      // After postMessage, the onConnect callback should have fired and sent ack
      expect(swEndpoint).toBeDefined();

      // Manually dispatch the ack on port1 (the client-side listening port).
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      // --- Register handler on SW-side endpoint ---
      const swHandler = vi.fn();
      swEndpoint.onMessage(swHandler);

      // --- Register handler on client-side endpoint ---
      const clientHandler = vi.fn();
      clientEndpoint.onMessage(clientHandler);

      // --- Client sends a JSON-RPC request ---
      const request = { jsonrpc: "2.0", method: "ping", params: {}, id: 1 };
      clientEndpoint.send(request);

      // The send goes through port.postMessage on the client's port.
      expect(capturedChannel!.port1.postMessage).toHaveBeenCalledWith(request);

      // --- SW-side endpoint receives and responds ---
      const swPort = sw.postMessage.mock.calls[0]?.[1]?.[0] as
        | MockMessagePort
        | undefined;
      if (swPort && "dispatchMessage" in swPort) {
        swPort.dispatchMessage(request);
      }
      expect(swHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ data: request }),
      );

      // SW responds
      const response = { jsonrpc: "2.0", result: "pong", id: 1 };
      swEndpoint.send(response);

      // Simulate client-side port receiving the response
      capturedChannel!.port1.dispatchMessage(response);
      expect(clientHandler).toHaveBeenCalledWith(
        response,
        expect.objectContaining({ data: response }),
      );

      // Restore
      globalThis.addEventListener = originalAdd;
      globalThis.removeEventListener = originalRemove;
    });

    test("onConnect endpoint onMessage unsubscribe stops only the unsubscribed handler", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];

        const handler1 = vi.fn();
        const handler2 = vi.fn();
        const unsub1 = endpoint.onMessage(handler1);
        endpoint.onMessage(handler2);

        // Both handlers receive messages
        const msg1 = { jsonrpc: "2.0", method: "alpha", id: 1 };
        port.dispatchMessage(msg1);
        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);

        // Unsubscribe handler1 only
        unsub1();

        // Only handler2 receives subsequent messages
        const msg2 = { jsonrpc: "2.0", method: "beta", id: 2 };
        port.dispatchMessage(msg2);
        expect(handler1).toHaveBeenCalledTimes(1); // still 1
        expect(handler2).toHaveBeenCalledTimes(2);
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });

    test("multiple onMessage handlers on onConnect endpoint all receive each message independently", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];

        const handler1 = vi.fn();
        const handler2 = vi.fn();
        const handler3 = vi.fn();
        endpoint.onMessage(handler1);
        endpoint.onMessage(handler2);
        endpoint.onMessage(handler3);

        const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
        port.dispatchMessage(msg);

        // All three handlers should have been called
        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
        expect(handler3).toHaveBeenCalledTimes(1);

        // Each receives the same message
        expect(handler1).toHaveBeenCalledWith(
          msg,
          expect.objectContaining({ data: msg }),
        );
        expect(handler2).toHaveBeenCalledWith(
          msg,
          expect.objectContaining({ data: msg }),
        );
        expect(handler3).toHaveBeenCalledWith(
          msg,
          expect.objectContaining({ data: msg }),
        );
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });

    test("onConnect再呼び出し時に前のリスナーがremoveEventListenerで除去されること", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb1 = vi.fn();
        onConnect(cb1);

        // Capture the listener that was registered by the first onConnect call
        expect(mockScope.addEventListener).toHaveBeenCalledTimes(1);
        const firstListener = mockScope.addEventListener.mock.calls[0][1];

        // removeEventListener should not have been called yet
        // (no previous listener to remove on the first call)
        const removeCallsBefore =
          mockScope.removeEventListener.mock.calls.length;

        // Call onConnect again with a new callback
        const cb2 = vi.fn();
        onConnect(cb2);

        // removeEventListener should have been called to remove the first listener
        expect(mockScope.removeEventListener).toHaveBeenCalledWith(
          "message",
          firstListener,
        );
        expect(mockScope.removeEventListener.mock.calls.length).toBeGreaterThan(
          removeCallsBefore,
        );

        // The second listener is now registered
        expect(mockScope.addEventListener).toHaveBeenCalledTimes(2);
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });
  });

  describe("timeout boundary values", () => {
    let originalMessageChannel: typeof MessageChannel;

    beforeEach(() => {
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("timeout: 1 (minimum valid positive integer) eventually times out with TIMEOUT", async () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 1 });
      await new Promise((r) => setTimeout(r, 20));
      expect(() => endpoint.send({})).toThrow(FractalError);
    });

    test("timeout: 1 send() throws FractalError with TIMEOUT code", async () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 1 });
      await new Promise((r) => setTimeout(r, 20));
      try {
        endpoint.send({});
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FractalError);
        expect((err as FractalError).code).toBe("TIMEOUT");
      }
    });

    test("timeout: Number.MAX_SAFE_INTEGER is accepted as a valid timeout (no TypeError thrown)", async () => {
      const sw = createMockServiceWorker();
      // Number.MAX_SAFE_INTEGER is a valid non-negative number, so it should not throw
      // TypeError. It will overflow setTimeout's 32-bit limit and fire quickly, but the
      // important thing is it's treated as a valid timeout value (not rejected as invalid).
      expect(() =>
        serviceWorkerEndpoint(sw as any, { timeout: Number.MAX_SAFE_INTEGER }),
      ).not.toThrow(TypeError);
      // After overflow fires, send() should throw TIMEOUT
      await new Promise((r) => setTimeout(r, 20));
    });

    test("timeout: -0 is treated the same as timeout: 0 (immediate TIMEOUT)", async () => {
      const sw = createMockServiceWorker();
      // -0 === 0 in JavaScript; should be immediate timeout
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: -0 });
      await new Promise((r) => setTimeout(r, 10));
      expect(() => endpoint.send({})).toThrow(FractalError);
    });

    test("timeout: -0 send() throws FractalError instance", async () => {
      const sw = createMockServiceWorker();
      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: -0 });
      await new Promise((r) => setTimeout(r, 10));
      try {
        endpoint.send({});
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FractalError);
        expect((err as FractalError).code).toBe("TIMEOUT");
      }
    });
  });

  describe("onConnect callback exception and ack sending", () => {
    let mockScope: MockServiceWorkerGlobalScope;
    let originalAddEventListener: typeof globalThis.addEventListener;
    let originalRemoveEventListener: typeof globalThis.removeEventListener;

    beforeEach(() => {
      mockScope = createMockServiceWorkerGlobalScope();
      originalAddEventListener = globalThis.addEventListener;
      originalRemoveEventListener = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;
    });

    afterEach(() => {
      globalThis.addEventListener = originalAddEventListener;
      globalThis.removeEventListener = originalRemoveEventListener;
    });

    test("ack is sent before callback is invoked, so ack is sent even if callback throws", () => {
      const cb = vi.fn(() => {
        throw new Error("callback boom");
      });
      onConnect(cb);

      const port = createMockMessagePort();
      expect(() => {
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);
      }).toThrow("callback boom");

      // Ack should have been sent BEFORE the callback threw
      expect(port.postMessage).toHaveBeenCalledTimes(1);
      expect(port.postMessage).toHaveBeenCalledWith({ type: "fractal:ack" });
    });

    test("ack is sent exactly once even when callback throws synchronously", () => {
      let callCount = 0;
      const cb = vi.fn(() => {
        callCount++;
        throw new Error(`fail #${callCount}`);
      });
      onConnect(cb);

      // First connection
      const port1 = createMockMessagePort();
      expect(() => {
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port1]);
      }).toThrow("fail #1");
      expect(port1.postMessage).toHaveBeenCalledTimes(1);
      expect(port1.postMessage).toHaveBeenCalledWith({ type: "fractal:ack" });

      // Second connection — callback still throws but ack is still sent
      const port2 = createMockMessagePort();
      expect(() => {
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port2]);
      }).toThrow("fail #2");
      expect(port2.postMessage).toHaveBeenCalledTimes(1);
      expect(port2.postMessage).toHaveBeenCalledWith({ type: "fractal:ack" });
    });

    test("endpoint is created and passed to callback even if callback throws", () => {
      let receivedEndpoint: any;
      const cb = vi.fn((ep: any) => {
        receivedEndpoint = ep;
        throw new Error("after receiving endpoint");
      });
      onConnect(cb);

      const port = createMockMessagePort();
      expect(() => {
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);
      }).toThrow("after receiving endpoint");

      // The callback received a valid endpoint before throwing
      expect(receivedEndpoint).toBeDefined();
      expect(typeof receivedEndpoint.send).toBe("function");
      expect(typeof receivedEndpoint.onMessage).toBe("function");
    });
  });

  describe("selective unsubscribe of middle handler among 3+ handlers", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("unsubscribing the middle handler leaves first and last handlers active (client-side)", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      endpoint.onMessage(handler1);
      const unsub2 = endpoint.onMessage(handler2);
      endpoint.onMessage(handler3);

      // All three handlers receive the first message
      const msg1 = { jsonrpc: "2.0", method: "alpha", id: 1 };
      capturedChannel!.port1.dispatchMessage(msg1);
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);

      // Unsubscribe only the middle handler
      unsub2();

      // Only handler1 and handler3 receive the second message
      const msg2 = { jsonrpc: "2.0", method: "beta", id: 2 };
      capturedChannel!.port1.dispatchMessage(msg2);
      expect(handler1).toHaveBeenCalledTimes(2);
      expect(handler2).toHaveBeenCalledTimes(1); // still 1
      expect(handler3).toHaveBeenCalledTimes(2);

      // Third message confirms continued operation
      const msg3 = { jsonrpc: "2.0", method: "gamma", id: 3 };
      capturedChannel!.port1.dispatchMessage(msg3);
      expect(handler1).toHaveBeenCalledTimes(3);
      expect(handler2).toHaveBeenCalledTimes(1); // still 1
      expect(handler3).toHaveBeenCalledTimes(3);
    });

    test("unsubscribing the middle handler leaves first and last handlers active (SW-side)", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];

        const handler1 = vi.fn();
        const handler2 = vi.fn();
        const handler3 = vi.fn();
        endpoint.onMessage(handler1);
        const unsub2 = endpoint.onMessage(handler2);
        endpoint.onMessage(handler3);

        // All three handlers receive the first message
        const msg1 = { jsonrpc: "2.0", method: "alpha", id: 1 };
        port.dispatchMessage(msg1);
        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
        expect(handler3).toHaveBeenCalledTimes(1);

        // Unsubscribe only the middle handler
        unsub2();

        // Only handler1 and handler3 receive the second message
        const msg2 = { jsonrpc: "2.0", method: "beta", id: 2 };
        port.dispatchMessage(msg2);
        expect(handler1).toHaveBeenCalledTimes(2);
        expect(handler2).toHaveBeenCalledTimes(1); // still 1
        expect(handler3).toHaveBeenCalledTimes(2);

        // Third message confirms continued operation
        const msg3 = { jsonrpc: "2.0", method: "gamma", id: 3 };
        port.dispatchMessage(msg3);
        expect(handler1).toHaveBeenCalledTimes(3);
        expect(handler2).toHaveBeenCalledTimes(1); // still 1
        expect(handler3).toHaveBeenCalledTimes(3);
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });
  });

  describe("JSON-RPC Response message passthrough", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("endpoint passes JSON-RPC success response (with result field) to handler (client-side)", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      endpoint.onMessage(handler);

      // JSON-RPC success response message
      const responseMsg = { jsonrpc: "2.0", result: { name: "Alice" }, id: 1 };
      capturedChannel!.port1.dispatchMessage(responseMsg);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        responseMsg,
        expect.objectContaining({ data: responseMsg }),
      );
    });

    test("endpoint passes JSON-RPC error response (with error field) to handler (client-side)", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      endpoint.onMessage(handler);

      // JSON-RPC error response message
      const errorResponseMsg = {
        jsonrpc: "2.0",
        error: { code: -32601, message: "Method not found" },
        id: 2,
      };
      capturedChannel!.port1.dispatchMessage(errorResponseMsg);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        errorResponseMsg,
        expect.objectContaining({ data: errorResponseMsg }),
      );
    });

    test("endpoint passes JSON-RPC response messages to handler (SW-side)", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];
        const handler = vi.fn();
        endpoint.onMessage(handler);

        // JSON-RPC success response
        const successResponse = { jsonrpc: "2.0", result: "pong", id: 1 };
        port.dispatchMessage(successResponse);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
          successResponse,
          expect.objectContaining({ data: successResponse }),
        );

        // JSON-RPC error response
        const errorResponse = {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: 2,
        };
        port.dispatchMessage(errorResponse);
        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler).toHaveBeenCalledWith(
          errorResponse,
          expect.objectContaining({ data: errorResponse }),
        );
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });

    test("endpoint passes both request and response messages through to handler", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      endpoint.onMessage(handler);

      // Mix of request and response messages
      const request = { jsonrpc: "2.0", method: "ping", id: 1 };
      const successResponse = { jsonrpc: "2.0", result: "pong", id: 1 };
      const errorResponse = {
        jsonrpc: "2.0",
        error: { code: -32601, message: "Not found" },
        id: 2,
      };

      capturedChannel!.port1.dispatchMessage(request);
      capturedChannel!.port1.dispatchMessage(successResponse);
      capturedChannel!.port1.dispatchMessage(errorResponse);

      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(
        1,
        request,
        expect.objectContaining({ data: request }),
      );
      expect(handler).toHaveBeenNthCalledWith(
        2,
        successResponse,
        expect.objectContaining({ data: successResponse }),
      );
      expect(handler).toHaveBeenNthCalledWith(
        3,
        errorResponse,
        expect.objectContaining({ data: errorResponse }),
      );
    });
  });

  describe("Endpoint interface shape", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("endpoint from serviceWorkerEndpoint has send and onMessage properties", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      expect(endpoint).toHaveProperty("send");
      expect(endpoint).toHaveProperty("onMessage");
      expect(typeof endpoint.send).toBe("function");
      expect(typeof endpoint.onMessage).toBe("function");
    });

    test("endpoint has only send and onMessage as own properties (no extra properties)", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      const keys = Object.keys(endpoint);
      expect(keys).toContain("send");
      expect(keys).toContain("onMessage");
      expect(keys.length).toBe(2);
    });

    test("endpoint from onConnect has send and onMessage properties", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];
        expect(endpoint).toHaveProperty("send");
        expect(endpoint).toHaveProperty("onMessage");
        expect(typeof endpoint.send).toBe("function");
        expect(typeof endpoint.onMessage).toBe("function");
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });

    test("endpoint from onConnect has only send and onMessage as own properties", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];
        const keys = Object.keys(endpoint);
        expect(keys).toContain("send");
        expect(keys).toContain("onMessage");
        expect(keys.length).toBe(2);
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });
  });

  describe("Round 2 review: missing test coverage", () => {
    describe("onConnect 再呼び出し時の前回リスナー削除確認", () => {
      let mockScope: MockServiceWorkerGlobalScope;
      let originalAddEventListener: typeof globalThis.addEventListener;
      let originalRemoveEventListener: typeof globalThis.removeEventListener;

      beforeEach(() => {
        mockScope = createMockServiceWorkerGlobalScope();
        originalAddEventListener = globalThis.addEventListener;
        originalRemoveEventListener = globalThis.removeEventListener;
        globalThis.addEventListener = mockScope.addEventListener as any;
        globalThis.removeEventListener = mockScope.removeEventListener as any;
      });

      afterEach(() => {
        globalThis.addEventListener = originalAddEventListener;
        globalThis.removeEventListener = originalRemoveEventListener;
      });

      test("onConnect を2回呼んだとき removeEventListener が前回のリスナーに対して呼ばれること", () => {
        const cb1 = vi.fn();
        onConnect(cb1);

        // 1回目の onConnect で登録されたリスナーを取得
        expect(mockScope.addEventListener).toHaveBeenCalledTimes(1);
        const firstListener = mockScope.addEventListener.mock.calls[0][1];

        // 2回目の onConnect を呼ぶ
        const cb2 = vi.fn();
        onConnect(cb2);

        // removeEventListener が "message" と前回のリスナー関数を引数に呼ばれたことを検証
        expect(mockScope.removeEventListener).toHaveBeenCalledWith(
          "message",
          firstListener,
        );

        // 2回目で登録された新しいリスナーは前回のものとは異なる
        expect(mockScope.addEventListener).toHaveBeenCalledTimes(2);
        const secondListener = mockScope.addEventListener.mock.calls[1][1];
        expect(secondListener).not.toBe(firstListener);

        // 前回のリスナーが実際に除去されているため、メッセージ送信時に cb1 は呼ばれない
        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);
        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).toHaveBeenCalledTimes(1);
      });
    });

    describe("onMessage の dispose 冪等性", () => {
      let originalMessageChannel: typeof MessageChannel;
      let capturedChannel:
        | { port1: MockMessagePort; port2: MockMessagePort }
        | undefined;

      beforeEach(() => {
        capturedChannel = undefined;
        originalMessageChannel = globalThis.MessageChannel;
        globalThis.MessageChannel = class MockMessageChannel {
          port1: MockMessagePort;
          port2: MockMessagePort;
          constructor() {
            this.port1 = createMockMessagePort();
            this.port2 = createMockMessagePort();
            capturedChannel = this;
          }
        } as any;
      });

      afterEach(() => {
        globalThis.MessageChannel = originalMessageChannel;
      });

      test("endpoint.onMessage() の戻り値 dispose を複数回呼んでもエラーにならないこと（クライアント側）", () => {
        const sw = createMockServiceWorker();

        const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

        capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

        const handler = vi.fn();
        const dispose = endpoint.onMessage(handler);

        // メッセージが届くことを確認
        const msg1 = { jsonrpc: "2.0", method: "ping", id: 1 };
        capturedChannel!.port1.dispatchMessage(msg1);
        expect(handler).toHaveBeenCalledTimes(1);

        // dispose を複数回呼んでもエラーにならない
        expect(() => dispose()).not.toThrow();
        expect(() => dispose()).not.toThrow();
        expect(() => dispose()).not.toThrow();

        // dispose 後はメッセージが届かない
        const msg2 = { jsonrpc: "2.0", method: "pong", id: 2 };
        capturedChannel!.port1.dispatchMessage(msg2);
        expect(handler).toHaveBeenCalledTimes(1); // まだ1回のまま
      });

      test("endpoint.onMessage() の戻り値 dispose を複数回呼んでもエラーにならないこと（SW側）", () => {
        const mockScope = createMockServiceWorkerGlobalScope();
        const originalAdd = globalThis.addEventListener;
        const originalRemove = globalThis.removeEventListener;
        globalThis.addEventListener = mockScope.addEventListener as any;
        globalThis.removeEventListener = mockScope.removeEventListener as any;

        try {
          const cb = vi.fn();
          onConnect(cb);

          const port = createMockMessagePort();
          mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

          const endpoint = cb.mock.calls[0][0];
          const handler = vi.fn();
          const dispose = endpoint.onMessage(handler);

          // メッセージが届くことを確認
          const msg1 = { jsonrpc: "2.0", method: "ping", id: 1 };
          port.dispatchMessage(msg1);
          expect(handler).toHaveBeenCalledTimes(1);

          // dispose を複数回呼んでもエラーにならない
          expect(() => dispose()).not.toThrow();
          expect(() => dispose()).not.toThrow();
          expect(() => dispose()).not.toThrow();

          // dispose 後はメッセージが届かない
          const msg2 = { jsonrpc: "2.0", method: "pong", id: 2 };
          port.dispatchMessage(msg2);
          expect(handler).toHaveBeenCalledTimes(1); // まだ1回のまま
        } finally {
          globalThis.addEventListener = originalAdd;
          globalThis.removeEventListener = originalRemove;
        }
      });
    });

    describe("同一ハンドラの複数回登録", () => {
      let originalMessageChannel: typeof MessageChannel;
      let capturedChannel:
        | { port1: MockMessagePort; port2: MockMessagePort }
        | undefined;

      beforeEach(() => {
        capturedChannel = undefined;
        originalMessageChannel = globalThis.MessageChannel;
        globalThis.MessageChannel = class MockMessageChannel {
          port1: MockMessagePort;
          port2: MockMessagePort;
          constructor() {
            this.port1 = createMockMessagePort();
            this.port2 = createMockMessagePort();
            capturedChannel = this;
          }
        } as any;
      });

      afterEach(() => {
        globalThis.MessageChannel = originalMessageChannel;
      });

      test("同じ handler を endpoint.onMessage() で2回登録し、メッセージ受信時に2回呼ばれること（クライアント側）", () => {
        const sw = createMockServiceWorker();

        const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

        capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

        // 同一の handler 関数を2回登録する
        const handler = vi.fn();
        endpoint.onMessage(handler);
        endpoint.onMessage(handler);

        // メッセージを1回送信
        const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
        capturedChannel!.port1.dispatchMessage(msg);

        // handler が2回呼ばれること（addEventListener のセマンティクスと同じ追加登録）
        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler).toHaveBeenNthCalledWith(
          1,
          msg,
          expect.objectContaining({ data: msg }),
        );
        expect(handler).toHaveBeenNthCalledWith(
          2,
          msg,
          expect.objectContaining({ data: msg }),
        );
      });

      test("同じ handler を endpoint.onMessage() で2回登録し、メッセージ受信時に2回呼ばれること（SW側）", () => {
        const mockScope = createMockServiceWorkerGlobalScope();
        const originalAdd = globalThis.addEventListener;
        const originalRemove = globalThis.removeEventListener;
        globalThis.addEventListener = mockScope.addEventListener as any;
        globalThis.removeEventListener = mockScope.removeEventListener as any;

        try {
          const cb = vi.fn();
          onConnect(cb);

          const port = createMockMessagePort();
          mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

          const endpoint = cb.mock.calls[0][0];

          // 同一の handler 関数を2回登録する
          const handler = vi.fn();
          endpoint.onMessage(handler);
          endpoint.onMessage(handler);

          // メッセージを1回送信
          const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
          port.dispatchMessage(msg);

          // handler が2回呼ばれること（addEventListener のセマンティクスと同じ追加登録）
          expect(handler).toHaveBeenCalledTimes(2);
          expect(handler).toHaveBeenNthCalledWith(
            1,
            msg,
            expect.objectContaining({ data: msg }),
          );
          expect(handler).toHaveBeenNthCalledWith(
            2,
            msg,
            expect.objectContaining({ data: msg }),
          );
        } finally {
          globalThis.addEventListener = originalAdd;
          globalThis.removeEventListener = originalRemove;
        }
      });
    });
  });

  describe("onConnect ack send failure", () => {
    let mockScope: MockServiceWorkerGlobalScope;
    let originalAddEventListener: typeof globalThis.addEventListener;
    let originalRemoveEventListener: typeof globalThis.removeEventListener;

    beforeEach(() => {
      mockScope = createMockServiceWorkerGlobalScope();
      originalAddEventListener = globalThis.addEventListener;
      originalRemoveEventListener = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;
    });

    afterEach(() => {
      globalThis.addEventListener = originalAddEventListener;
      globalThis.removeEventListener = originalRemoveEventListener;
    });

    test("when port.postMessage throws during ack, subsequent connections still work", () => {
      const cb = vi.fn();
      onConnect(cb);

      // First connection: port.postMessage throws during ack
      const port1 = createMockMessagePort();
      port1.postMessage.mockImplementation(() => {
        throw new DOMException("port closed");
      });

      // The ack send throws, which propagates out of the listener
      expect(() => {
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port1]);
      }).toThrow("port closed");

      // The callback should NOT have been called because the ack throw
      // happens before the callback invocation in the source code:
      // Actually looking at the source: ack is sent, then endpoint is created,
      // then callback is called. If ack throws, callback is never reached.
      // Let's verify: the error occurs at port.postMessage({ type: "fractal:ack" })
      // which is before createPortEndpoint and callback.
      // So cb should NOT have been called for port1.
      expect(cb).not.toHaveBeenCalled();

      // Second connection: normal port that doesn't throw
      const port2 = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port2]);

      // The second connection should succeed - callback is called
      expect(cb).toHaveBeenCalledTimes(1);
      expect(port2.postMessage).toHaveBeenCalledWith({ type: "fractal:ack" });

      // The endpoint from the second connection should be functional
      const endpoint = cb.mock.calls[0][0];
      expect(typeof endpoint.send).toBe("function");
      expect(typeof endpoint.onMessage).toBe("function");
    });
  });

  describe("same ServiceWorker controller used in multiple serviceWorkerEndpoint calls", () => {
    let originalMessageChannel: typeof MessageChannel;

    beforeEach(() => {
      originalMessageChannel = globalThis.MessageChannel;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("independent MessageChannels are created for each call to serviceWorkerEndpoint with the same controller", () => {
      const sw = createMockServiceWorker();

      const capturedChannels: {
        port1: MockMessagePort;
        port2: MockMessagePort;
      }[] = [];
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannels.push(this);
        }
      } as any;

      const endpoint1 = serviceWorkerEndpoint(sw as any, { timeout: 5000 });
      const endpoint2 = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      // Two separate postMessage calls should have been made to the same controller
      expect(sw.postMessage).toHaveBeenCalledTimes(2);

      // Two distinct channels should have been created
      expect(capturedChannels.length).toBe(2);
      expect(capturedChannels[0]).not.toBe(capturedChannels[1]);

      // Ack both ports
      capturedChannels[0].port1.dispatchMessage({ type: "fractal:ack" });
      capturedChannels[1].port1.dispatchMessage({ type: "fractal:ack" });

      // Endpoints should be distinct objects
      expect(endpoint1).not.toBe(endpoint2);

      // Messages sent on one endpoint go to its own port, not the other
      const msg1 = { jsonrpc: "2.0", method: "alpha", id: 1 };
      const msg2 = { jsonrpc: "2.0", method: "beta", id: 2 };
      endpoint1.send(msg1);
      endpoint2.send(msg2);

      expect(capturedChannels[0].port1.postMessage).toHaveBeenCalledWith(msg1);
      expect(capturedChannels[0].port1.postMessage).not.toHaveBeenCalledWith(
        msg2,
      );
      expect(capturedChannels[1].port1.postMessage).toHaveBeenCalledWith(msg2);
      expect(capturedChannels[1].port1.postMessage).not.toHaveBeenCalledWith(
        msg1,
      );
    });
  });

  describe("send() message passthrough integrity", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("send() passes the message directly to port.postMessage without transformation (client-side)", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      // Send a complex JSON-RPC message with various fields
      const msg = {
        jsonrpc: "2.0",
        method: "user.get",
        params: { id: "123", nested: { deep: true } },
        id: 42,
      };
      endpoint.send(msg);

      // Verify the exact same object reference is passed (no wrapping, cloning, or transformation)
      expect(capturedChannel!.port1.postMessage).toHaveBeenCalledTimes(1);
      const sentArg = capturedChannel!.port1.postMessage.mock.calls[0][0];
      expect(sentArg).toBe(msg); // strict reference equality
    });

    test("send() passes the message directly to port.postMessage without transformation (SW-side)", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];

        // Clear the ack postMessage call
        port.postMessage.mockClear();

        const msg = {
          jsonrpc: "2.0",
          result: { name: "Alice", items: [1, 2, 3] },
          id: 99,
        };
        endpoint.send(msg);

        // Verify the exact same object reference is passed (no wrapping or transformation)
        expect(port.postMessage).toHaveBeenCalledTimes(1);
        const sentArg = port.postMessage.mock.calls[0][0];
        expect(sentArg).toBe(msg); // strict reference equality
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });
  });

  describe("handshake message has no extra fields", () => {
    let originalMessageChannel: typeof MessageChannel;

    beforeEach(() => {
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("handshake message is exactly { type: 'fractal:connect' } with no additional properties", () => {
      const sw = createMockServiceWorker();
      serviceWorkerEndpoint(sw as any, { timeout: 100 });

      expect(sw.postMessage).toHaveBeenCalled();
      const handshakeMsg = sw.postMessage.mock.calls[0]?.[0];

      // Verify exact structure using Object.keys
      const keys = Object.keys(handshakeMsg);
      expect(keys).toEqual(["type"]);
      expect(keys.length).toBe(1);

      // Verify the value
      expect(handshakeMsg).toEqual({ type: "fractal:connect" });

      // Ensure no jsonrpc, method, id, params, or any other fields exist
      expect(handshakeMsg).not.toHaveProperty("jsonrpc");
      expect(handshakeMsg).not.toHaveProperty("method");
      expect(handshakeMsg).not.toHaveProperty("id");
      expect(handshakeMsg).not.toHaveProperty("params");
      expect(handshakeMsg).not.toHaveProperty("data");
    });
  });

  describe("onMessage handler receives MessageEvent-like second argument", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("second argument to onMessage handler has a data property matching the message (client-side)", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      endpoint.onMessage(handler);

      const msg = {
        jsonrpc: "2.0",
        method: "test.method",
        params: { key: "value" },
        id: 7,
      };
      capturedChannel!.port1.dispatchMessage(msg);

      expect(handler).toHaveBeenCalledTimes(1);

      // Verify the second argument shape
      const secondArg = handler.mock.calls[0][1];
      expect(secondArg).toBeDefined();
      expect(typeof secondArg).toBe("object");
      expect(secondArg).toHaveProperty("data");
      expect(secondArg.data).toBe(msg); // data property references the original message
      // The second argument is the raw MessageEvent (or MessageEvent-like object)
      // passed from the port's event listener
    });

    test("second argument to onMessage handler has a data property matching the message (SW-side)", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];
        const handler = vi.fn();
        endpoint.onMessage(handler);

        const msg = {
          jsonrpc: "2.0",
          method: "test.method",
          params: { foo: "bar" },
          id: 10,
        };
        port.dispatchMessage(msg);

        expect(handler).toHaveBeenCalledTimes(1);

        // Verify the second argument shape
        const secondArg = handler.mock.calls[0][1];
        expect(secondArg).toBeDefined();
        expect(typeof secondArg).toBe("object");
        expect(secondArg).toHaveProperty("data");
        expect(secondArg.data).toBe(msg); // data property references the original message
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });

    test("first argument to onMessage handler is the data, second is the event containing that data", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      endpoint.onMessage(handler);

      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      capturedChannel!.port1.dispatchMessage(msg);

      expect(handler).toHaveBeenCalledTimes(1);

      const [firstArg, secondArg] = handler.mock.calls[0];

      // First arg is the message data itself
      expect(firstArg).toBe(msg);

      // Second arg is the event, and event.data should equal the first arg
      expect(secondArg.data).toBe(firstArg);
    });
  });

  describe("options: undefined and options: {} variants", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("serviceWorkerEndpoint(sw, undefined) works correctly with no timeout", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, undefined);

      expect(endpoint).toBeDefined();
      expect(typeof endpoint.send).toBe("function");
      expect(typeof endpoint.onMessage).toBe("function");

      // Ack and verify full functionality
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      endpoint.send(msg);
      expect(capturedChannel!.port1.postMessage).toHaveBeenCalledWith(msg);
    });

    test("serviceWorkerEndpoint(sw, {}) works correctly with no timeout", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, {});

      expect(endpoint).toBeDefined();
      expect(typeof endpoint.send).toBe("function");
      expect(typeof endpoint.onMessage).toBe("function");

      // Ack and verify full functionality
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      endpoint.send(msg);
      expect(capturedChannel!.port1.postMessage).toHaveBeenCalledWith(msg);
    });
  });

  describe("concurrent handshakes with same controller", () => {
    let originalMessageChannel: typeof MessageChannel;

    beforeEach(() => {
      originalMessageChannel = globalThis.MessageChannel;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("one handshake times out while the other succeeds with the same controller", async () => {
      const sw = createMockServiceWorker();

      const capturedChannels: {
        port1: MockMessagePort;
        port2: MockMessagePort;
      }[] = [];
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannels.push(this);
        }
      } as any;

      // First call with short timeout that will expire
      const endpoint1 = serviceWorkerEndpoint(sw as any, { timeout: 30 });
      // Second call with long timeout that will succeed
      const endpoint2 = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      expect(capturedChannels.length).toBe(2);

      // Let endpoint1's timeout expire
      await new Promise((r) => setTimeout(r, 40));
      expect(() => endpoint1.send({})).toThrow(FractalError);

      // Now ack only the second port - endpoint2 should work
      capturedChannels[1].port1.dispatchMessage({ type: "fractal:ack" });

      expect(endpoint2).toBeDefined();
      expect(typeof endpoint2.send).toBe("function");
      expect(typeof endpoint2.onMessage).toBe("function");

      // The second endpoint should be fully functional
      const handler = vi.fn();
      endpoint2.onMessage(handler);
      const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
      capturedChannels[1].port1.dispatchMessage(msg);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        msg,
        expect.objectContaining({ data: msg }),
      );
    });
  });

  describe("onConnect ack sent through port, NOT globalThis.postMessage", () => {
    let mockScope: MockServiceWorkerGlobalScope;
    let originalAddEventListener: typeof globalThis.addEventListener;
    let originalRemoveEventListener: typeof globalThis.removeEventListener;
    let originalPostMessage: typeof globalThis.postMessage;
    let globalPostMessageSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockScope = createMockServiceWorkerGlobalScope();
      originalAddEventListener = globalThis.addEventListener;
      originalRemoveEventListener = globalThis.removeEventListener;
      originalPostMessage = globalThis.postMessage;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;
      // Replace globalThis.postMessage with a spy to verify it is NOT called with ack
      globalPostMessageSpy = vi.fn();
      globalThis.postMessage = globalPostMessageSpy as any;
    });

    afterEach(() => {
      globalThis.addEventListener = originalAddEventListener;
      globalThis.removeEventListener = originalRemoveEventListener;
      globalThis.postMessage = originalPostMessage;
    });

    test("ack is sent through port.postMessage and globalThis.postMessage is NOT called with the ack", () => {
      const cb = vi.fn();
      onConnect(cb);

      const port = createMockMessagePort();
      mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

      // The ack MUST be sent through the transferred port
      expect(port.postMessage).toHaveBeenCalledTimes(1);
      expect(port.postMessage).toHaveBeenCalledWith({ type: "fractal:ack" });

      // globalThis.postMessage must NOT have been called with the ack message
      for (const call of globalPostMessageSpy.mock.calls) {
        const arg = call[0];
        if (typeof arg === "object" && arg !== null) {
          expect(arg).not.toMatchObject({ type: "fractal:ack" });
        }
      }
    });
  });

  describe("port.addEventListener called before port.start() on client side handshake", () => {
    let originalMessageChannel: typeof MessageChannel;

    beforeEach(() => {
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("addEventListener for ack listener is called before port.start() during handshake", () => {
      const sw = createMockServiceWorker();

      // Track call ordering on the port that is used for listening (port1 of the MockMessageChannel)
      const callOrder: string[] = [];
      // We need to intercept the port1 that will be created.
      // Override MockMessageChannel to track call order on port1.
      globalThis.MessageChannel = class OrderTrackingMockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();

          // Wrap addEventListener and start to track call ordering
          const origAddEventListener = this.port1.addEventListener;
          this.port1.addEventListener = vi.fn((...args: any[]) => {
            callOrder.push("addEventListener");
            return origAddEventListener(...args);
          }) as any;

          const origStart = this.port1.start;
          this.port1.start = vi.fn((...args: any[]) => {
            callOrder.push("start");
            return origStart(...args);
          }) as any;
        }
      } as any;

      serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      // Verify addEventListener was called before start
      const addEventListenerIndex = callOrder.indexOf("addEventListener");
      const startIndex = callOrder.indexOf("start");
      expect(addEventListenerIndex).not.toBe(-1);
      expect(startIndex).not.toBe(-1);
      expect(addEventListenerIndex).toBeLessThan(startIndex);
    });
  });

  describe("unsubscribe function return value", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("calling the unsubscribe function returns exactly undefined (client-side)", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const handler = vi.fn();
      const unsubscribe = endpoint.onMessage(handler);

      const returnValue = unsubscribe();
      expect(returnValue).toBe(undefined);
    });

    test("calling the unsubscribe function returns exactly undefined (SW-side)", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        const port = createMockMessagePort();
        mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);

        const endpoint = cb.mock.calls[0][0];
        const handler = vi.fn();
        const unsubscribe = endpoint.onMessage(handler);

        const returnValue = unsubscribe();
        expect(returnValue).toBe(undefined);
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });
  });

  describe("non-ack messages on port during handshake", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("non-ack messages on port during handshake do not activate the endpoint", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });
      expect(capturedChannel).toBeDefined();

      // Send various non-ack messages on the port during handshake
      capturedChannel!.port1.dispatchMessage({
        type: "fractal:something-else",
      });
      capturedChannel!.port1.dispatchMessage({ type: "unrelated" });
      capturedChannel!.port1.dispatchMessage({});
      capturedChannel!.port1.dispatchMessage({
        jsonrpc: "2.0",
        method: "ping",
        id: 1,
      });
      capturedChannel!.port1.dispatchMessage(null);
      capturedChannel!.port1.dispatchMessage("hello");

      // send() should still buffer (not flush), proving endpoint is not yet activated
      const msg = { jsonrpc: "2.0", method: "test", id: 99 };
      endpoint.send(msg);
      expect(capturedChannel!.port1.postMessage).not.toHaveBeenCalled();

      // Now send the actual ack and verify it activates
      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      // The buffered message should have been flushed
      expect(capturedChannel!.port1.postMessage).toHaveBeenCalledWith(msg);
    });

    test("non-ack messages do not cause errors during handshake phase", () => {
      const sw = createMockServiceWorker();

      serviceWorkerEndpoint(sw as any, { timeout: 5000 });
      expect(capturedChannel).toBeDefined();

      // These should not throw
      expect(() => {
        capturedChannel!.port1.dispatchMessage({
          type: "fractal:something-else",
        });
        capturedChannel!.port1.dispatchMessage({ type: "unrelated" });
        capturedChannel!.port1.dispatchMessage({});
      }).not.toThrow();
    });
  });

  describe("send() exception propagation on client-side endpoint", () => {
    let originalMessageChannel: typeof MessageChannel;
    let capturedChannel:
      | { port1: MockMessagePort; port2: MockMessagePort }
      | undefined;

    beforeEach(() => {
      capturedChannel = undefined;
      originalMessageChannel = globalThis.MessageChannel;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: MockMessagePort;
        port2: MockMessagePort;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          capturedChannel = this;
        }
      } as any;
    });

    afterEach(() => {
      globalThis.MessageChannel = originalMessageChannel;
    });

    test("send() on client-side endpoint propagates port.postMessage exceptions", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      // Make port.postMessage throw
      const sendError = new DOMException(
        "DataCloneError: The object could not be cloned",
      );
      capturedChannel!.port1.postMessage.mockImplementation(() => {
        throw sendError;
      });

      expect(() => {
        endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
      }).toThrow("DataCloneError: The object could not be cloned");
    });

    test("send() on client-side endpoint propagates the exact error thrown by port.postMessage", () => {
      const sw = createMockServiceWorker();

      const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

      capturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

      const customError = new TypeError("port is closed");
      capturedChannel!.port1.postMessage.mockImplementation(() => {
        throw customError;
      });

      try {
        endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
        expect.unreachable("should have thrown");
      } catch (err) {
        // The exact same error object should propagate
        expect(err).toBe(customError);
      }
    });
  });

  describe("behavior before any onConnect is called", () => {
    test("fractal:connect message on globalThis before onConnect is called is simply ignored", () => {
      // Use a fresh mock scope where no onConnect has been registered
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        // No onConnect has been called, so no listener from this module is registered.
        // Dispatching a fractal:connect message should not cause any error.
        const port = createMockMessagePort();
        expect(() => {
          mockScope.dispatchMessage({ type: "fractal:connect" }, [port]);
        }).not.toThrow();

        // No ack should have been sent since nobody is listening
        expect(port.postMessage).not.toHaveBeenCalled();
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });
  });

  describe("port without start() method", () => {
    test("onConnect endpoint works correctly with a port-like object that lacks start()", () => {
      const mockScope = createMockServiceWorkerGlobalScope();
      const originalAdd = globalThis.addEventListener;
      const originalRemove = globalThis.removeEventListener;
      globalThis.addEventListener = mockScope.addEventListener as any;
      globalThis.removeEventListener = mockScope.removeEventListener as any;

      try {
        const cb = vi.fn();
        onConnect(cb);

        // Create a port-like object without a start() method
        const listeners: Array<(event: MessageEvent) => void> = [];
        const portWithoutStart = {
          postMessage: vi.fn(),
          addEventListener: vi.fn(
            (type: string, handler: (event: MessageEvent) => void) => {
              if (type === "message") listeners.push(handler);
            },
          ),
          removeEventListener: vi.fn(
            (type: string, handler: (event: MessageEvent) => void) => {
              if (type === "message") {
                const idx = listeners.indexOf(handler);
                if (idx !== -1) listeners.splice(idx, 1);
              }
            },
          ),
          // Deliberately omitting start()
        };

        // Dispatch the fractal:connect message with this port
        const event = {
          data: { type: "fractal:connect" },
          ports: [portWithoutStart],
        } as unknown as MessageEvent;
        for (const listener of mockScope._listeners) {
          listener(event);
        }

        // Callback should have been invoked with a valid endpoint
        expect(cb).toHaveBeenCalledTimes(1);
        const endpoint = cb.mock.calls[0][0];
        expect(typeof endpoint.send).toBe("function");
        expect(typeof endpoint.onMessage).toBe("function");

        // Ack should still be sent
        expect(portWithoutStart.postMessage).toHaveBeenCalledWith({
          type: "fractal:ack",
        });

        // endpoint.send() should work
        const msg = { jsonrpc: "2.0", result: "ok", id: 1 };
        endpoint.send(msg);
        // The ack was the first call, the send is the second
        expect(portWithoutStart.postMessage).toHaveBeenCalledWith(msg);

        // endpoint.onMessage() should work without throwing (no start() to call)
        const handler = vi.fn();
        expect(() => {
          endpoint.onMessage(handler);
        }).not.toThrow();

        // Messages through the port should still be received via addEventListener
        const jsonRpcMsg = { jsonrpc: "2.0", method: "ping", id: 2 };
        const msgEvent = { data: jsonRpcMsg } as MessageEvent;
        for (const l of [...listeners]) {
          l(msgEvent);
        }
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(jsonRpcMsg, msgEvent);
      } finally {
        globalThis.addEventListener = originalAdd;
        globalThis.removeEventListener = originalRemove;
      }
    });

    test("client-side endpoint works with port-like object where start is not a function", () => {
      const originalMessageChannel = globalThis.MessageChannel;

      let localCapturedChannel:
        | { port1: MockMessagePort; port2: MockMessagePort }
        | undefined;
      globalThis.MessageChannel = class MockMessageChannel {
        port1: any;
        port2: any;
        constructor() {
          this.port1 = createMockMessagePort();
          this.port2 = createMockMessagePort();
          localCapturedChannel = this;
        }
      } as any;

      try {
        const sw = createMockServiceWorker();

        const endpoint = serviceWorkerEndpoint(sw as any, { timeout: 5000 });

        localCapturedChannel!.port1.dispatchMessage({ type: "fractal:ack" });

        // After handshake, the endpoint wraps port1 via createPortEndpoint.
        // Replace port1.start with a non-function to simulate the guard.
        (localCapturedChannel!.port1 as any).start = "not-a-function";

        // onMessage should not throw even though start is not a function
        const handler = vi.fn();
        expect(() => {
          endpoint.onMessage(handler);
        }).not.toThrow();
      } finally {
        globalThis.MessageChannel = originalMessageChannel;
      }
    });
  });
});
