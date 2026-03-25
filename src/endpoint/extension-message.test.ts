import { createMockExtensionBrowser } from "../test-helpers.ts";
import {
  extensionRuntimeEndpoint,
  extensionTabEndpoint,
} from "./extension-message.ts";

describe("endpoint/extension-message — extensionRuntimeEndpoint", () => {
  test("send() calls browser.runtime.sendMessage", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      method: "ping",
      id: 1,
    });
  });

  test("onMessage registers listener via browser.runtime.onMessage.addListener", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    endpoint.onMessage(vi.fn());
    expect(browser.runtime.onMessage.addListener).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  test("onMessage forwards JSON-RPC messages to handler", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    browser.dispatchRuntimeMessage(msg, { tab: { id: 1 } });
    expect(handler).toHaveBeenCalledWith(
      msg,
      expect.objectContaining({ data: msg }),
    );
  });

  test("receives messages regardless of sender (with tab)", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    browser.dispatchRuntimeMessage(msg, { tab: { id: 42 } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("receives messages regardless of sender (without tab)", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    browser.dispatchRuntimeMessage(msg, {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("receives messages regardless of sender (tab without id)", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    browser.dispatchRuntimeMessage(msg, { tab: {} });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("ignores non-JSON-RPC messages", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    browser.dispatchRuntimeMessage({ type: "not-jsonrpc" }, {});
    browser.dispatchRuntimeMessage(null, {});
    browser.dispatchRuntimeMessage("hello", {});
    browser.dispatchRuntimeMessage(42, {});
    browser.dispatchRuntimeMessage([{ jsonrpc: "2.0" }], {});
    expect(handler).not.toHaveBeenCalled();
  });

  test("dispose calls browser.runtime.onMessage.removeListener", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const dispose = endpoint.onMessage(vi.fn());
    dispose();
    expect(browser.runtime.onMessage.removeListener).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  test("dispose passes same listener reference to removeListener", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const dispose = endpoint.onMessage(vi.fn());

    const added = (
      browser.runtime.onMessage.addListener as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];

    dispose();

    const removed = (
      browser.runtime.onMessage.removeListener as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];

    expect(removed).toBe(added);
  });

  test("dispose is idempotent", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const dispose = endpoint.onMessage(vi.fn());
    dispose();
    expect(browser.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);

    expect(() => dispose()).not.toThrow();
    expect(browser.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
  });

  test("dispose then receive → handler not called", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    dispose();

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      {},
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("handler exception does not crash other handlers", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const safe = vi.fn();

    endpoint.onMessage(throwing);
    endpoint.onMessage(safe);

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "test", id: 1 },
      {},
    );
    expect(throwing).toHaveBeenCalledTimes(1);
    expect(safe).toHaveBeenCalledTimes(1);
  });

  test("multiple handlers receive the same message independently", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const h1 = vi.fn();
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "test", id: 1 },
      {},
    );
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("multiple handlers: dispose one, other still receives", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const h1 = vi.fn();
    const h2 = vi.fn();
    const d1 = endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    d1();

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "test", id: 1 },
      {},
    );
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("dispose → re-registration cycle works", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const h1 = vi.fn();
    const d1 = endpoint.onMessage(h1);
    d1();

    const h2 = vi.fn();
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    browser.dispatchRuntimeMessage(msg, {});

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("send() propagates exception if browser.runtime.sendMessage throws", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const error = new Error("runtime disconnected");
    (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw error;
      },
    );

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow(error);
  });

  test("JSON-RPC Response message is passed to handler", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const response = { jsonrpc: "2.0", result: "ok", id: 1 };
    browser.dispatchRuntimeMessage(response, {});
    expect(handler).toHaveBeenCalledWith(response, expect.any(Object));
  });

  test("returned endpoint has exactly send and onMessage function properties", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionRuntimeEndpoint(browser as any);

    const keys = Object.keys(endpoint).sort();
    expect(keys).toEqual(["onMessage", "send"]);
    expect(typeof endpoint.send).toBe("function");
    expect(typeof endpoint.onMessage).toBe("function");
  });
});

describe("endpoint/extension-message — extensionTabEndpoint", () => {
  test("send() calls browser.tabs.sendMessage(tabId, message)", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(42, {
      jsonrpc: "2.0",
      method: "ping",
      id: 1,
    });
  });

  test("onMessage registers listener via browser.runtime.onMessage.addListener", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    endpoint.onMessage(vi.fn());
    expect(browser.runtime.onMessage.addListener).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  test("onMessage forwards JSON-RPC messages from matching tab", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    browser.dispatchRuntimeMessage(msg, { tab: { id: 42 } });
    expect(handler).toHaveBeenCalledWith(
      msg,
      expect.objectContaining({ data: msg }),
    );
  });

  test("ignores messages from different tab", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { tab: { id: 99 } },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores messages when sender has no tab", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      {},
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores messages when sender.tab has no id", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { tab: {} },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores non-JSON-RPC messages from correct tab", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    browser.dispatchRuntimeMessage({ type: "not-jsonrpc" }, { tab: { id: 42 } });
    browser.dispatchRuntimeMessage(null, { tab: { id: 42 } });
    browser.dispatchRuntimeMessage("hello", { tab: { id: 42 } });
    expect(handler).not.toHaveBeenCalled();
  });

  test("two endpoints for different tabs operate independently", () => {
    const browser = createMockExtensionBrowser();
    const ep1 = extensionTabEndpoint(browser as any, 1);
    const ep2 = extensionTabEndpoint(browser as any, 2);

    const h1 = vi.fn();
    const h2 = vi.fn();
    ep1.onMessage(h1);
    ep2.onMessage(h2);

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "test", id: 1 },
      { tab: { id: 1 } },
    );
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).not.toHaveBeenCalled();

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "test", id: 2 },
      { tab: { id: 2 } },
    );
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("dispose calls browser.runtime.onMessage.removeListener", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const dispose = endpoint.onMessage(vi.fn());
    dispose();
    expect(browser.runtime.onMessage.removeListener).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  test("dispose passes same listener reference to removeListener", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const dispose = endpoint.onMessage(vi.fn());

    const added = (
      browser.runtime.onMessage.addListener as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];

    dispose();

    const removed = (
      browser.runtime.onMessage.removeListener as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];

    expect(removed).toBe(added);
  });

  test("dispose is idempotent", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const dispose = endpoint.onMessage(vi.fn());
    dispose();
    expect(browser.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);

    expect(() => dispose()).not.toThrow();
    expect(browser.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
  });

  test("dispose then receive → handler not called", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    dispose();

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "ping", id: 1 },
      { tab: { id: 42 } },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test("handler exception does not crash other handlers", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const safe = vi.fn();

    endpoint.onMessage(throwing);
    endpoint.onMessage(safe);

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "test", id: 1 },
      { tab: { id: 42 } },
    );
    expect(throwing).toHaveBeenCalledTimes(1);
    expect(safe).toHaveBeenCalledTimes(1);
  });

  test("multiple handlers receive the same message independently", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const h1 = vi.fn();
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "test", id: 1 },
      { tab: { id: 42 } },
    );
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("multiple handlers: dispose one, other still receives", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const h1 = vi.fn();
    const h2 = vi.fn();
    const d1 = endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    d1();

    browser.dispatchRuntimeMessage(
      { jsonrpc: "2.0", method: "test", id: 1 },
      { tab: { id: 42 } },
    );
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("dispose → re-registration cycle works", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const h1 = vi.fn();
    const d1 = endpoint.onMessage(h1);
    d1();

    const h2 = vi.fn();
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    browser.dispatchRuntimeMessage(msg, { tab: { id: 42 } });

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("send() propagates exception if browser.tabs.sendMessage throws", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const error = new Error("tab not found");
    (browser.tabs.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw error;
      },
    );

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow(error);
  });

  test("JSON-RPC Response message is passed to handler", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const response = { jsonrpc: "2.0", result: "ok", id: 1 };
    browser.dispatchRuntimeMessage(response, { tab: { id: 42 } });
    expect(handler).toHaveBeenCalledWith(response, expect.any(Object));
  });

  test("returned endpoint has exactly send and onMessage function properties", () => {
    const browser = createMockExtensionBrowser();
    const endpoint = extensionTabEndpoint(browser as any, 42);

    const keys = Object.keys(endpoint).sort();
    expect(keys).toEqual(["onMessage", "send"]);
    expect(typeof endpoint.send).toBe("function");
    expect(typeof endpoint.onMessage).toBe("function");
  });
});
