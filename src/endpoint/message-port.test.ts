import { messagePortEndpoint } from "./message-port.ts";
import { createMockMessagePort } from "../test-helpers.ts";

describe("endpoint/message-port", () => {
  test("send() calls port.postMessage", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(port.postMessage).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      method: "ping",
      id: 1,
    });
  });

  test("onMessage calls port.start() automatically", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    endpoint.onMessage(vi.fn());
    expect(port.start).toHaveBeenCalled();
  });

  test("onMessage registers event listener on port", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);
    expect(port.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));
  });

  test("onMessage ignores non-JSON-RPC messages", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Messages without jsonrpc: "2.0" should not be forwarded to handler
    port.dispatchMessage({ type: "not-jsonrpc" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("onMessage forwards JSON-RPC messages to handler", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    port.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("onMessage returns a dispose function", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    expect(typeof dispose).toBe("function");
  });

  test("dispose removes the event listener", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    dispose();
    expect(port.removeEventListener).toHaveBeenCalledWith("message", expect.any(Function));
  });

  test("multiple onMessage calls each call port.start()", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    endpoint.onMessage(vi.fn());
    endpoint.onMessage(vi.fn());
    expect(port.start).toHaveBeenCalledTimes(2);
  });

  test("multiple handlers receive the same message independently", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const h1 = vi.fn();
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    port.dispatchMessage(msg);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("dispose then receive → handler not called", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    dispose();

    port.dispatchMessage({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  test("multiple handlers: dispose one, other still receives", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const h1 = vi.fn();
    const h2 = vi.fn();
    const d1 = endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    d1();

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    port.dispatchMessage(msg);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("ignores null message data", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage(null);
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores empty object", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage({});
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores message with jsonrpc !== '2.0'", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage({ jsonrpc: "1.0", method: "ping" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("handler receives (message, event) arguments", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    port.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledWith(msg, expect.objectContaining({ data: msg }));
  });

  test("port.start() is called each time onMessage() is called (idempotent)", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    endpoint.onMessage(vi.fn());
    expect(port.start).toHaveBeenCalledTimes(1);

    endpoint.onMessage(vi.fn());
    expect(port.start).toHaveBeenCalledTimes(2);

    endpoint.onMessage(vi.fn());
    expect(port.start).toHaveBeenCalledTimes(3);
  });

  test("send() propagates exception if port.postMessage() throws", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const error = new Error("port is closed");
    (port.postMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw error;
    });

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow(error);
  });

  test("handler exception does not crash other handlers or the endpoint", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const throwingHandler = vi.fn(() => {
      throw new Error("handler exploded");
    });
    const safeHandler = vi.fn();

    endpoint.onMessage(throwingHandler);
    endpoint.onMessage(safeHandler);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    port.dispatchMessage(msg);

    expect(throwingHandler).toHaveBeenCalledTimes(1);
    expect(safeHandler).toHaveBeenCalledTimes(1);

    // Endpoint continues to work after handler exception
    const msg2 = { jsonrpc: "2.0", method: "test", id: 2 };
    port.dispatchMessage(msg2);
    expect(safeHandler).toHaveBeenCalledTimes(2);
  });

  test("dispose is idempotent — calling multiple times does not throw", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);

    dispose();
    expect(() => dispose()).not.toThrow();
    expect(() => dispose()).not.toThrow();
  });

  test("re-registration after dispose: port.start() called again, new handler receives messages", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const h1 = vi.fn();
    const dispose1 = endpoint.onMessage(h1);
    expect(port.start).toHaveBeenCalledTimes(1);

    dispose1();

    const h2 = vi.fn();
    endpoint.onMessage(h2);
    expect(port.start).toHaveBeenCalledTimes(2);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    port.dispatchMessage(msg);

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  // ─── MessageEvent data property verification ───

  test("handler's event argument has data property matching the sent message exactly", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    port.dispatchMessage(msg);

    const [receivedMessage, receivedEvent] = handler.mock.calls[0];
    expect(receivedMessage).toBe(msg);
    expect(receivedEvent.data).toBe(msg);
  });

  // ─── Handler execution order ───

  test("multiple onMessage handlers execute in registration order (FIFO)", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const order: number[] = [];
    endpoint.onMessage(() => order.push(1));
    endpoint.onMessage(() => order.push(2));
    endpoint.onMessage(() => order.push(3));

    port.dispatchMessage({ jsonrpc: "2.0", method: "test", id: 1 });
    expect(order).toEqual([1, 2, 3]);
  });

  // ─── SharedWorker scenario ───

  test("works with SharedWorker.port (MessagePort from SharedWorker)", () => {
    // SharedWorker.port is a MessagePort, so messagePortEndpoint should work
    // as documented in section 2.2 of external-design.md
    const port = createMockMessagePort();

    // Simulate: const worker = new SharedWorker("./shared-worker.ts");
    //           const endpoint = messagePortEndpoint(worker.port);
    const sharedWorker = { port };
    const endpoint = messagePortEndpoint(sharedWorker.port as any);

    // send works
    endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(port.postMessage).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      method: "ping",
      id: 1,
    });

    // onMessage works and calls port.start()
    const handler = vi.fn();
    endpoint.onMessage(handler);
    expect(port.start).toHaveBeenCalled();

    // Receiving messages works
    const msg = { jsonrpc: "2.0", method: "data.fetch", id: 2 };
    port.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledWith(msg, expect.objectContaining({ data: msg }));
  });

  // ─── port.start() timing ───

  test("port.start() is NOT called until onMessage is registered", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    // After creating the endpoint, port.start() should not have been called yet
    expect(port.start).not.toHaveBeenCalled();

    // Calling send() also should not trigger port.start()
    endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(port.start).not.toHaveBeenCalled();

    // Only when onMessage is registered should port.start() be called
    endpoint.onMessage(vi.fn());
    expect(port.start).toHaveBeenCalledTimes(1);
  });

  // ─── Multiple port.start() calls are safe (idempotent) ───

  test("calling onMessage multiple times calls port.start() each time and is safe", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    // port.start() is idempotent per the MessagePort spec —
    // calling it multiple times is safe and has no adverse effect
    endpoint.onMessage(vi.fn());
    endpoint.onMessage(vi.fn());
    endpoint.onMessage(vi.fn());
    expect(port.start).toHaveBeenCalledTimes(3);

    // All handlers still work correctly after multiple start() calls
    const handler = vi.fn();
    endpoint.onMessage(handler);
    expect(port.start).toHaveBeenCalledTimes(4);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    port.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Same handler registered twice ───

  test("same handler function registered twice is called twice per message", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    // addEventListener semantics: same handler registered twice = called twice
    const handler = vi.fn();
    const dispose1 = endpoint.onMessage(handler);
    const dispose2 = endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    port.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledTimes(2);

    // Disposing one registration should leave the other active
    dispose1();
    port.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledTimes(3);

    // Disposing the second registration should stop all calls
    dispose2();
    port.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  // ─── Large message payload ───

  test("send() works with a large message payload", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    // Build a large params object with many keys
    const largeParams: Record<string, unknown> = {};
    for (let i = 0; i < 10000; i++) {
      largeParams[`key_${i}`] = `value_${i}_${"x".repeat(100)}`;
    }

    const largeMessage = {
      jsonrpc: "2.0",
      method: "bulk.upload",
      params: largeParams,
      id: 1,
    };

    endpoint.send(largeMessage);
    expect(port.postMessage).toHaveBeenCalledWith(largeMessage);

    // Also verify receiving a large message works
    const handler = vi.fn();
    endpoint.onMessage(handler);
    port.dispatchMessage(largeMessage);
    expect(handler).toHaveBeenCalledWith(largeMessage, expect.objectContaining({ data: largeMessage }));
  });

  // ─── Batch Request (array message) is ignored ───

  test("batch request (array of JSON-RPC messages) is ignored", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage([{ jsonrpc: "2.0", method: "ping", id: 1 }]);
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── Primitive value messages are ignored ───

  test("string primitive message is ignored", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage("hello");
    expect(handler).not.toHaveBeenCalled();
  });

  test("number primitive message is ignored", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage(42);
    expect(handler).not.toHaveBeenCalled();
  });

  test("boolean true message is ignored", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage(true);
    expect(handler).not.toHaveBeenCalled();
  });

  test("boolean false message is ignored", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage(false);
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── JSON-RPC Response messages pass through ───

  test("JSON-RPC Response message is passed to handler (endpoint does not distinguish Request/Response)", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const response = { jsonrpc: "2.0", result: "ok", id: 1 };
    port.dispatchMessage(response);
    expect(handler).toHaveBeenCalledWith(response, expect.any(Object));
  });

  // ─── Structured clone incompatible values ───

  test("send() with structured-clone-incompatible value propagates postMessage exception", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    // Simulate the DOMException that postMessage throws for non-cloneable values
    const cloneError = new DOMException(
      "Failed to execute 'postMessage': function could not be cloned.",
      "DataCloneError",
    );
    (port.postMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw cloneError;
    });

    // Passing an object containing a function
    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "test", id: 1, params: { fn: () => {} } });
    }).toThrow(cloneError);

    // Passing an object containing a Symbol
    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "test", id: 2, params: { sym: Symbol("x") } });
    }).toThrow(cloneError);
  });

  // ─── dispose → re-register multiple cycles ───

  test("dispose → onMessage re-register → dispose cycle works multiple times", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };

    // Cycle 1: register → verify → dispose
    const h1 = vi.fn();
    const d1 = endpoint.onMessage(h1);
    expect(port.start).toHaveBeenCalledTimes(1);
    port.dispatchMessage(msg);
    expect(h1).toHaveBeenCalledTimes(1);
    d1();
    port.dispatchMessage(msg);
    expect(h1).toHaveBeenCalledTimes(1); // no further calls after dispose

    // Cycle 2: register → verify → dispose
    const h2 = vi.fn();
    const d2 = endpoint.onMessage(h2);
    expect(port.start).toHaveBeenCalledTimes(2);
    port.dispatchMessage(msg);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(h1).toHaveBeenCalledTimes(1); // h1 still not called
    d2();
    port.dispatchMessage(msg);
    expect(h2).toHaveBeenCalledTimes(1);

    // Cycle 3: register → verify → dispose
    const h3 = vi.fn();
    const d3 = endpoint.onMessage(h3);
    expect(port.start).toHaveBeenCalledTimes(3);
    port.dispatchMessage(msg);
    expect(h3).toHaveBeenCalledTimes(1);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    d3();
    port.dispatchMessage(msg);
    expect(h3).toHaveBeenCalledTimes(1);
  });

  // ─── Endpoint interface shape ───

  test("returned endpoint has exactly send and onMessage function properties", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    // Verify only send and onMessage exist as own properties
    const keys = Object.keys(endpoint).sort();
    expect(keys).toEqual(["onMessage", "send"]);

    // Verify both are functions
    expect(typeof endpoint.send).toBe("function");
    expect(typeof endpoint.onMessage).toBe("function");
  });

  // ─── undefined data is ignored (MessagePort-specific) ───

  test("undefined message data is ignored", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage(undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── listener reference identity (addEventListener / removeEventListener) ───

  test("dispose passes the same listener reference to removeEventListener that was passed to addEventListener", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);

    // Capture the listener that was registered via addEventListener
    const addedListener = (port.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === "message",
    )![1];

    dispose();

    // Capture the listener that was removed via removeEventListener
    const removedListener = (port.removeEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === "message",
    )![1];

    // The exact same function reference must be used for both add and remove
    expect(removedListener).toBe(addedListener);
  });

  // ─── port closed: send() propagates exception ───

  test("send() propagates exception when port is closed (port.postMessage throws DOMException)", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    // Simulate a closed port: postMessage throws an InvalidStateError
    const closedError = new DOMException(
      "Failed to execute 'postMessage' on 'MessagePort': The port is closed.",
      "InvalidStateError",
    );
    (port.postMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw closedError;
    });

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow(closedError);

    // Verify the thrown error is the exact same instance
    try {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 2 });
    } catch (e) {
      expect(e).toBe(closedError);
    }
  });

  // ─── jsonrpc: "2.0" only message (no method, no result, no error) passes filter ───

  test("message with only jsonrpc: '2.0' (no method/result/error) is passed to handler", () => {
    const port = createMockMessagePort();
    const endpoint = messagePortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Endpoint layer only checks for jsonrpc: "2.0"; further validation
    // (e.g. method presence) is the responsibility of upper layers (serve/client)
    const minimalMessage = { jsonrpc: "2.0" };
    port.dispatchMessage(minimalMessage);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(minimalMessage, expect.objectContaining({ data: minimalMessage }));
  });
});
