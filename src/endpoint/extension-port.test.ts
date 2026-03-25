import { createMockExtensionPort } from "../test-helpers.ts";
import { extensionPortEndpoint } from "./extension-port.ts";

describe("endpoint/extension-port", () => {
  test("send() calls port.postMessage", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(port.postMessage).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      method: "ping",
      id: 1,
    });
  });

  test("onMessage registers listener via port.onMessage.addListener", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    endpoint.onMessage(vi.fn());
    expect(port.onMessage.addListener).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  test("onMessage forwards JSON-RPC messages to handler", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    port.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledWith(msg, expect.objectContaining({ data: msg }));
  });

  test("handler receives (message, synthesized MessageEvent) arguments", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    port.dispatchMessage(msg);

    const [receivedMessage, receivedEvent] = handler.mock.calls[0];
    expect(receivedMessage).toBe(msg);
    expect(receivedEvent.data).toBe(msg);
  });

  test("onMessage ignores non-JSON-RPC messages", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage({ type: "not-jsonrpc" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores null message", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage(null);
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores undefined message", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage(undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores empty object", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage({});
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores message with jsonrpc !== '2.0'", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage({ jsonrpc: "1.0", method: "ping" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores array messages", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage([{ jsonrpc: "2.0", method: "ping", id: 1 }]);
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores string primitive", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage("hello");
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores number primitive", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    port.dispatchMessage(42);
    expect(handler).not.toHaveBeenCalled();
  });

  test("onMessage returns a dispose function", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const dispose = endpoint.onMessage(vi.fn());
    expect(typeof dispose).toBe("function");
  });

  test("dispose calls port.onMessage.removeListener", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const dispose = endpoint.onMessage(vi.fn());
    dispose();
    expect(port.onMessage.removeListener).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  test("dispose passes the same listener reference to removeListener that was passed to addListener", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const dispose = endpoint.onMessage(vi.fn());

    const addedListener = (
      port.onMessage.addListener as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];

    dispose();

    const removedListener = (
      port.onMessage.removeListener as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];

    expect(removedListener).toBe(addedListener);
  });

  test("dispose is idempotent — calling multiple times does not throw or call removeListener again", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const dispose = endpoint.onMessage(vi.fn());
    dispose();
    expect(port.onMessage.removeListener).toHaveBeenCalledTimes(1);

    expect(() => dispose()).not.toThrow();
    expect(() => dispose()).not.toThrow();
    expect(port.onMessage.removeListener).toHaveBeenCalledTimes(1);
  });

  test("dispose then receive → handler not called", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    dispose();

    port.dispatchMessage({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  test("handler exception does not crash other handlers or the endpoint", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

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

    // Endpoint continues to work
    port.dispatchMessage({ jsonrpc: "2.0", method: "test", id: 2 });
    expect(safeHandler).toHaveBeenCalledTimes(2);
  });

  test("multiple handlers receive the same message independently", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const h1 = vi.fn();
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    port.dispatchMessage(msg);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("multiple handlers: dispose one, other still receives", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

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

  test("multiple onMessage handlers execute in registration order (FIFO)", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const order: number[] = [];
    endpoint.onMessage(() => order.push(1));
    endpoint.onMessage(() => order.push(2));
    endpoint.onMessage(() => order.push(3));

    port.dispatchMessage({ jsonrpc: "2.0", method: "test", id: 1 });
    expect(order).toEqual([1, 2, 3]);
  });

  test("dispose → re-registration cycle works", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const h1 = vi.fn();
    const d1 = endpoint.onMessage(h1);
    d1();

    const h2 = vi.fn();
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    port.dispatchMessage(msg);

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("send() propagates exception if port.postMessage() throws", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const error = new Error("port disconnected");
    (port.postMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw error;
    });

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow(error);
  });

  test("JSON-RPC Response message is passed to handler", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const response = { jsonrpc: "2.0", result: "ok", id: 1 };
    port.dispatchMessage(response);
    expect(handler).toHaveBeenCalledWith(response, expect.any(Object));
  });

  test("message with only jsonrpc: '2.0' is passed to handler", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const minimal = { jsonrpc: "2.0" };
    port.dispatchMessage(minimal);
    expect(handler).toHaveBeenCalledWith(
      minimal,
      expect.objectContaining({ data: minimal }),
    );
  });

  test("same handler registered twice is called twice per message", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const handler = vi.fn();
    const d1 = endpoint.onMessage(handler);
    const d2 = endpoint.onMessage(handler);

    port.dispatchMessage({ jsonrpc: "2.0", method: "test", id: 1 });
    expect(handler).toHaveBeenCalledTimes(2);

    d1();
    port.dispatchMessage({ jsonrpc: "2.0", method: "test", id: 2 });
    expect(handler).toHaveBeenCalledTimes(3);

    d2();
    port.dispatchMessage({ jsonrpc: "2.0", method: "test", id: 3 });
    expect(handler).toHaveBeenCalledTimes(3);
  });

  test("returned endpoint has exactly send and onMessage function properties", () => {
    const port = createMockExtensionPort();
    const endpoint = extensionPortEndpoint(port as any);

    const keys = Object.keys(endpoint).sort();
    expect(keys).toEqual(["onMessage", "send"]);
    expect(typeof endpoint.send).toBe("function");
    expect(typeof endpoint.onMessage).toBe("function");
  });
});
