import { windowEndpoint } from "./window.ts";
import { createMockWindow } from "../test-helpers.ts";

describe("endpoint/window", () => {
  // We need a "listener" window (simulating globalThis) that the endpoint listens on.
  // The windowEndpoint receives target (the remote window to postMessage to)
  // and optionally a listener window for receiving messages.
  // In tests we use createMockWindow for both and wire them up.

  test("send() calls target.postMessage with origin", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://example.com", listener: listener as any });

    endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(target.postMessage).toHaveBeenCalledWith(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      "https://example.com",
    );
  });

  test("send() uses '*' as targetOrigin when origin is '*'", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    endpoint.send({ data: "test" });
    expect(target.postMessage).toHaveBeenCalledWith({ data: "test" }, "*");
  });

  test("send() uses configured origin as targetOrigin", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://app.example.com", listener: listener as any });

    endpoint.send({ jsonrpc: "2.0", method: "test", id: 1 });
    expect(target.postMessage).toHaveBeenCalledWith(
      expect.any(Object),
      "https://app.example.com",
    );
  });

  test("onMessage registers a listener", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://example.com", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);
    expect(listener.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));
  });

  test("onMessage filters messages by origin", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://trusted.com", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Wrong origin
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://evil.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("onMessage filters messages by source", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const otherWindow = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://example.com", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Correct origin but wrong source
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: otherWindow },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("onMessage ignores non-JSON-RPC messages", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Not a JSON-RPC message (no jsonrpc field)
    listener.dispatchMessage(
      { type: "custom" },
      { origin: "https://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("origin '*' disables origin filtering", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Any origin + correct source should be accepted
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://any-origin.com", source: target },
    );
    expect(handler).toHaveBeenCalled();
  });

  test("source check is always active even with '*'", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const otherWindow = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // origin '*' but wrong source
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://any.com", source: otherWindow },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("dispose removes listener", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    dispose();

    // After dispose, messages should not reach handler
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("multiple handlers: dispose one, other still works", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const h1 = vi.fn();
    const h2 = vi.fn();
    const d1 = endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    d1();

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  test("passes MessageEvent to handler", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    listener.dispatchMessage(msg, { origin: "https://example.com", source: target });
    expect(handler).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("handler receives valid JSON-RPC message with correct source/origin", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://example.com", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    listener.dispatchMessage(msg, { origin: "https://example.com", source: target });
    expect(handler).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("send() propagates postMessage exceptions to the caller", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    target.postMessage.mockImplementation(() => {
      throw new DOMException("Failed to execute 'postMessage'");
    });

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow("Failed to execute 'postMessage'");
  });

  test("messages with null event.source are filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: null },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("messages with undefined event.source are filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: undefined },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("multiple onMessage calls are additive (addEventListener semantics)", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const h1 = vi.fn();
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    listener.dispatchMessage(msg, { origin: "https://example.com", source: target });
    expect(h1).toHaveBeenCalledWith(msg, expect.any(Object));
    expect(h2).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("handler exception does not crash other handlers", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const h1 = vi.fn(() => {
      throw new Error("handler 1 exploded");
    });
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  test("handler exception does not break the endpoint (new messages still processed)", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error("first call explodes");
      })
      .mockImplementation(() => {});
    endpoint.onMessage(handler);

    // First message: handler throws
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).toHaveBeenCalledTimes(1);

    // Second message: handler should still be called
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test("same origin, different source (different iframe) → message filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const otherIframe = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://example.com", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Same origin as configured, but source is a different iframe (not target)
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: otherIframe },
    );
    expect(handler).not.toHaveBeenCalled();

    // Verify the target source IS accepted
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("jsonrpc: 2.0 (number) → filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // jsonrpc as number 2.0 instead of string "2.0"
    listener.dispatchMessage(
      { jsonrpc: 2.0, method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("null message data → filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(
      null,
      { origin: "https://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("undefined message data → filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(
      undefined,
      { origin: "https://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("empty object {} message data → filtered out (handler not called)", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Empty object has no jsonrpc field, so it should be filtered out
    listener.dispatchMessage(
      {},
      { origin: "https://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("dispose → re-register new handler → new handler receives messages", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const oldHandler = vi.fn();
    const dispose = endpoint.onMessage(oldHandler);
    dispose();

    // Register a new handler after disposing the old one
    const newHandler = vi.fn();
    endpoint.onMessage(newHandler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    listener.dispatchMessage(msg, { origin: "https://example.com", source: target });

    // Old handler should not be called (was disposed)
    expect(oldHandler).not.toHaveBeenCalled();
    // New handler should receive the message
    expect(newHandler).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("dispose is idempotent (calling multiple times does not throw)", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);

    expect(() => {
      dispose();
      dispose();
      dispose();
    }).not.toThrow();

    // Confirm handler is still removed after multiple disposes
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── Additional coverage ───

  test("default listener behavior: omitting listener uses globalThis", () => {
    const target = createMockWindow();

    // Temporarily install addEventListener/removeEventListener on globalThis
    const origAdd = globalThis.addEventListener;
    const origRemove = globalThis.removeEventListener;
    const addSpy = vi.fn(origAdd.bind(globalThis));
    const removeSpy = vi.fn(origRemove.bind(globalThis));
    globalThis.addEventListener = addSpy;
    globalThis.removeEventListener = removeSpy;

    try {
      const endpoint = windowEndpoint(target as any, { origin: "*" });
      const handler = vi.fn();
      const dispose = endpoint.onMessage(handler);

      expect(addSpy).toHaveBeenCalledWith("message", expect.any(Function));

      dispose();
      expect(removeSpy).toHaveBeenCalledWith("message", expect.any(Function));
    } finally {
      globalThis.addEventListener = origAdd;
      globalThis.removeEventListener = origRemove;
    }
  });

  test("origin case sensitivity: mixed-case origin does NOT match lowercase", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://Example.COM", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Incoming event has lowercase origin — should NOT match "https://Example.COM"
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();

    // Exact case match should be accepted
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      { origin: "https://Example.COM", source: target },
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("similar origins distinction: port difference is a different origin", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://example.com", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // "https://example.com:8080" !== "https://example.com"
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com:8080", source: target },
    );
    expect(handler).not.toHaveBeenCalled();

    // Exact origin match should succeed
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("multiple iframes same origin: source check distinguishes target from other iframe", () => {
    const targetIframe = createMockWindow();
    const otherIframe = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(targetIframe as any, { origin: "https://example.com", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Both iframes share origin, but only target's messages should be accepted
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "from-other", id: 1 },
      { origin: "https://example.com", source: otherIframe },
    );
    expect(handler).not.toHaveBeenCalled();

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "from-target", id: 2 },
      { origin: "https://example.com", source: targetIframe },
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { jsonrpc: "2.0", method: "from-target", id: 2 },
      expect.any(Object),
    );
  });

  test("send() with structured clone incompatible data: error propagates", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    // Simulate postMessage throwing a DOMException for non-cloneable data
    target.postMessage.mockImplementation(() => {
      throw new DOMException("Failed to execute 'postMessage': function could not be cloned.");
    });

    const nonCloneable = { fn: () => {}, sym: Symbol("test") };
    expect(() => {
      endpoint.send(nonCloneable);
    }).toThrow("Failed to execute 'postMessage'");
  });

  test("MessageEvent passed to handler has correct origin, source, and data properties", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "https://example.com", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    listener.dispatchMessage(msg, { origin: "https://example.com", source: target });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][1];
    expect(event.data).toEqual(msg);
    expect(event.origin).toBe("https://example.com");
    expect(event.source).toBe(target);
  });

  test("multiple onMessage handlers execute in registration order (FIFO)", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const callOrder: number[] = [];
    const h1 = vi.fn(() => callOrder.push(1));
    const h2 = vi.fn(() => callOrder.push(2));
    const h3 = vi.fn(() => callOrder.push(3));
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);
    endpoint.onMessage(h3);

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );
    expect(callOrder).toEqual([1, 2, 3]);
  });

  test("origin '*' accepts any origin but still rejects wrong source in a single flow", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const otherWindow = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Wrong source → rejected even though origin "*" disables origin filtering
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://any-origin.com", source: otherWindow },
    );
    expect(handler).not.toHaveBeenCalled();

    // Correct source + arbitrary origin → accepted
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      { origin: "https://completely-different.com", source: target },
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      expect.objectContaining({ source: target, origin: "https://completely-different.com" }),
    );
  });

  // ─── Batch Request (array message) is ignored ───

  test("batch request (array of JSON-RPC messages) is ignored", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(
      [{ jsonrpc: "2.0", method: "ping", id: 1 }],
      { origin: "https://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── Primitive value messages are ignored ───

  test("string primitive message is ignored", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage("hello", { origin: "https://example.com", source: target });
    expect(handler).not.toHaveBeenCalled();
  });

  test("number primitive message is ignored", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(42, { origin: "https://example.com", source: target });
    expect(handler).not.toHaveBeenCalled();
  });

  test("boolean true message is ignored", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(true, { origin: "https://example.com", source: target });
    expect(handler).not.toHaveBeenCalled();
  });

  test("boolean false message is ignored", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(false, { origin: "https://example.com", source: target });
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── JSON-RPC Response messages pass through ───

  // ─── Async handler exception handling ───

  test("async handler that rejects: endpoint continues processing (rejection caught externally)", async () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    // Use a deferred promise to simulate an async handler that eventually rejects,
    // but we catch the rejection ourselves so it doesn't become unhandled.
    let rejectFn!: (reason: Error) => void;
    const rejectedPromise = new Promise<void>((_resolve, reject) => {
      rejectFn = reject;
    });
    // Attach a catch so the rejection is handled
    const caughtRejection = rejectedPromise.catch((e) => e);

    const handler = vi.fn()
      .mockImplementationOnce(() => rejectedPromise)
      .mockImplementation(() => {});
    endpoint.onMessage(handler);

    // First message: handler returns the promise (not yet rejected)
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).toHaveBeenCalledTimes(1);

    // Reject the promise
    rejectFn(new Error("async handler exploded"));
    const reason = await caughtRejection;
    expect((reason as Error).message).toBe("async handler exploded");

    // Second message: handler should still be called (endpoint not broken)
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test("async handler that rejects does not prevent other handlers from executing", async () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    // Create a manually-controlled rejected promise, with a catch handler so it's not unhandled.
    let rejectFn!: (reason: Error) => void;
    const rejectedPromise = new Promise<void>((_resolve, reject) => {
      rejectFn = reject;
    });
    const caughtRejection = rejectedPromise.catch((e) => e);

    const h1 = vi.fn(() => rejectedPromise);
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target },
    );

    // h2 should still have been called synchronously since the endpoint uses
    // try/catch which doesn't await the handler's return value
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();

    // Reject and verify
    rejectFn(new Error("async h1 exploded"));
    const reason = await caughtRejection;
    expect((reason as Error).message).toBe("async h1 exploded");
  });

  // ─── addEventListener exception propagation ───

  test("addEventListener exception propagates to onMessage caller", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    listener.addEventListener.mockImplementation(() => {
      throw new Error("addEventListener failed");
    });
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    expect(() => {
      endpoint.onMessage(handler);
    }).toThrow("addEventListener failed");
  });

  // ─── Falsy source boundary values ───

  test("event.source === 0 (falsy) is filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: 0 as any },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("event.source === false (falsy) is filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: false as any },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("event.source === '' (empty string, falsy) is filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: "" as any },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── JSON-RPC Response messages pass through ───

  test("JSON-RPC Response message is passed to handler (endpoint does not distinguish Request/Response)", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const response = { jsonrpc: "2.0", result: "ok", id: 1 };
    listener.dispatchMessage(response, { origin: "https://example.com", source: target });
    expect(handler).toHaveBeenCalledWith(response, expect.any(Object));
  });

  // ─── Round 2 review: additional coverage ───

  test("jsonrpc: '2.0' only message (no method, no result, no error) passes through to handler", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    const endpoint = windowEndpoint(target as any, { origin: "*", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Endpoint layer only checks jsonrpc === "2.0"; it does not require method/result/error
    const msg = { jsonrpc: "2.0" };
    listener.dispatchMessage(msg, { origin: "https://example.com", source: target });
    expect(handler).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("origin with different scheme (http vs https) is filtered out", () => {
    const target = createMockWindow();
    const listener = createMockWindow();
    // Endpoint configured with https
    const endpoint = windowEndpoint(target as any, { origin: "https://example.com", listener: listener as any });

    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Incoming event has http (not https) — scheme differs, so it must be rejected
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "http://example.com", source: target },
    );
    expect(handler).not.toHaveBeenCalled();

    // Verify that exact https origin is accepted
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      { origin: "https://example.com", source: target },
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("multiple windowEndpoint instances are independent: disposing one does not affect the other", () => {
    const target1 = createMockWindow();
    const target2 = createMockWindow();
    const listener = createMockWindow();

    const endpoint1 = windowEndpoint(target1 as any, { origin: "*", listener: listener as any });
    const endpoint2 = windowEndpoint(target2 as any, { origin: "*", listener: listener as any });

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const dispose1 = endpoint1.onMessage(handler1);
    endpoint2.onMessage(handler2);

    // Dispose endpoint1's handler
    dispose1();

    // Messages from target1 should no longer reach handler1
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { origin: "https://example.com", source: target1 },
    );
    expect(handler1).not.toHaveBeenCalled();

    // Messages from target2 should still reach handler2 (unaffected by dispose1)
    listener.dispatchMessage(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      { origin: "https://example.com", source: target2 },
    );
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith(
      { jsonrpc: "2.0", method: "ping", id: 2 },
      expect.any(Object),
    );

    // endpoint2's send should still work after endpoint1's dispose
    endpoint2.send({ jsonrpc: "2.0", method: "test", id: 3 });
    expect(target2.postMessage).toHaveBeenCalledWith(
      { jsonrpc: "2.0", method: "test", id: 3 },
      "*",
    );
  });
});
