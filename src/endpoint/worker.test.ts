import { workerEndpoint } from "./worker.ts";
import { createMockWorker } from "../test-helpers.ts";

describe("endpoint/worker", () => {
  test("send() calls target.postMessage", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(worker.postMessage).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      method: "ping",
      id: 1,
    });
  });

  test("onMessage registers event listener on target", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);
    expect(worker.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));
  });

  test("onMessage ignores non-JSON-RPC messages", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage({ type: "custom" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("onMessage forwards JSON-RPC messages to handler", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "compute", id: 1 };
    worker.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  test("onMessage returns a dispose function", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    expect(typeof dispose).toBe("function");
  });

  test("dispose removes the event listener", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    dispose();
    expect(worker.removeEventListener).toHaveBeenCalledWith("message", expect.any(Function));
  });

  test("works with DedicatedWorkerGlobalScope (self)", () => {
    // Worker-side: workerEndpoint(self) should work the same way
    const workerSelf = createMockWorker();
    const endpoint = workerEndpoint(workerSelf as any);

    endpoint.send({ jsonrpc: "2.0", result: "ok", id: 1 });
    expect(workerSelf.postMessage).toHaveBeenCalled();
  });

  test("multiple handlers receive the same message", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const h1 = vi.fn();
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    worker.dispatchMessage(msg);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("dispose then receive → handler not called", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    dispose();

    worker.dispatchMessage({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  test("multiple handlers: dispose one, other still receives", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const h1 = vi.fn();
    const h2 = vi.fn();
    const d1 = endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    d1();

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    worker.dispatchMessage(msg);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("handler receives (message, event) with correct types", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    worker.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledWith(msg, expect.objectContaining({ data: msg }));
  });

  test("ignores message with jsonrpc !== '2.0'", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage({ jsonrpc: "3.0", method: "ping" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("send() propagates exception if target.postMessage throws", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    worker.postMessage.mockImplementation(() => {
      throw new DOMException("Failed to execute 'postMessage'");
    });

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow("Failed to execute 'postMessage'");
  });

  test("handler exception does not prevent other handlers from receiving", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const h1 = vi.fn(() => {
      throw new Error("handler crashed");
    });
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    worker.dispatchMessage(msg);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("dispose is idempotent — multiple calls do not throw", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);

    dispose();
    expect(() => dispose()).not.toThrow();
    expect(() => dispose()).not.toThrow();
  });

  test("re-registration after dispose works correctly", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const h1 = vi.fn();
    const dispose1 = endpoint.onMessage(h1);
    dispose1();

    const h2 = vi.fn();
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "ping", id: 1 };
    worker.dispatchMessage(msg);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  // ─── A. Null/undefined message data filtering ───

  test("ignores null message data", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage(null);
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores undefined message data", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage(undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores empty object (no jsonrpc field)", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage({});
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── B. jsonrpc field type validation ───

  test("ignores message with jsonrpc: 2.0 (number, not string)", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage({ jsonrpc: 2.0, method: "ping" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores message with jsonrpc: '' (empty string)", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage({ jsonrpc: "", method: "ping" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("ignores message with jsonrpc: null", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage({ jsonrpc: null, method: "ping" });
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── C. Multiple sequential messages ───

  test("three valid sequential messages → handler called 3 times with correct data", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg1 = { jsonrpc: "2.0", method: "a", id: 1 };
    const msg2 = { jsonrpc: "2.0", method: "b", id: 2 };
    const msg3 = { jsonrpc: "2.0", method: "c", id: 3 };

    worker.dispatchMessage(msg1);
    worker.dispatchMessage(msg2);
    worker.dispatchMessage(msg3);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(1, msg1, expect.any(Object));
    expect(handler).toHaveBeenNthCalledWith(2, msg2, expect.any(Object));
    expect(handler).toHaveBeenNthCalledWith(3, msg3, expect.any(Object));
  });

  // ─── D. Handler exception types ───

  test("handler throws non-Error (string) → other handlers still called", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const h1 = vi.fn(() => {
      throw "string error";
    });
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    worker.dispatchMessage(msg);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("handler throws null → other handlers still called", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const h1 = vi.fn(() => {
      throw null;
    });
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    worker.dispatchMessage(msg);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  // ─── E. dispose() return value ───

  test("dispose() returns undefined", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);
    const result = dispose();
    expect(result).toBeUndefined();
  });

  // ─── F. Worker vs DedicatedWorkerGlobalScope API differences ───

  test("Worker target: send and onMessage work end-to-end", () => {
    // Simulates main-thread side: workerEndpoint(new Worker(...))
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    // send a request
    endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(worker.postMessage).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      method: "ping",
      id: 1,
    });

    // receive a response
    const handler = vi.fn();
    endpoint.onMessage(handler);
    const response = { jsonrpc: "2.0", result: "pong", id: 1 };
    worker.dispatchMessage(response);
    expect(handler).toHaveBeenCalledWith(response, expect.objectContaining({ data: response }));
  });

  test("DedicatedWorkerGlobalScope target: send and onMessage work end-to-end", () => {
    // Simulates worker-side: workerEndpoint(self)
    // DedicatedWorkerGlobalScope has the same postMessage/addEventListener API
    const selfScope = createMockWorker();
    const endpoint = workerEndpoint(selfScope as any);

    // send a response back to main thread
    const response = { jsonrpc: "2.0", result: { status: "ok" }, id: 42 };
    endpoint.send(response);
    expect(selfScope.postMessage).toHaveBeenCalledWith(response);

    // receive a request from main thread
    const handler = vi.fn();
    endpoint.onMessage(handler);
    const request = { jsonrpc: "2.0", method: "compute", params: { x: 10 }, id: 42 };
    selfScope.dispatchMessage(request);
    expect(handler).toHaveBeenCalledWith(request, expect.objectContaining({ data: request }));

    // dispose works the same way
    const dispose = endpoint.onMessage(vi.fn());
    dispose();
    expect(selfScope.removeEventListener).toHaveBeenCalledWith("message", expect.any(Function));
  });

  // ─── G. Large payload ───

  test("send and receive a large nested object", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    // Build a large nested payload
    const deeplyNested: Record<string, unknown> = {};
    let current = deeplyNested;
    for (let i = 0; i < 50; i++) {
      const next: Record<string, unknown> = {};
      current[`level_${i}`] = next;
      current = next;
    }
    current.value = "deep";

    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `item_${i}`,
      tags: [`tag_${i}_a`, `tag_${i}_b`],
    }));

    const largePayload = {
      jsonrpc: "2.0" as const,
      method: "bulk.process",
      params: { nested: deeplyNested, items },
      id: 1,
    };

    // send passes the full payload through
    endpoint.send(largePayload);
    expect(worker.postMessage).toHaveBeenCalledWith(largePayload);

    // receive passes the full payload to handler
    const handler = vi.fn();
    endpoint.onMessage(handler);
    worker.dispatchMessage(largePayload);
    expect(handler).toHaveBeenCalledTimes(1);
    const receivedMsg = handler.mock.calls[0][0] as Record<string, unknown>;
    expect(receivedMsg.params).toEqual({ nested: deeplyNested, items });
  });

  // ─── H. Rapid sequential messages ───

  test("rapid sequential messages are all received in order", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const count = 100;
    const messages = Array.from({ length: count }, (_, i) => ({
      jsonrpc: "2.0" as const,
      method: "rapid",
      params: { index: i },
      id: i + 1,
    }));

    for (const msg of messages) {
      worker.dispatchMessage(msg);
    }

    expect(handler).toHaveBeenCalledTimes(count);

    // Verify order is preserved
    for (let i = 0; i < count; i++) {
      const call = handler.mock.calls[i];
      expect(call[0]).toEqual(messages[i]);
    }
  });

  // ─── I. onMessage handler receives correct event properties ───

  test("onMessage handler receives event with data matching the sent message", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0", method: "check", params: { key: "abc" }, id: 7 };
    worker.dispatchMessage(msg);

    expect(handler).toHaveBeenCalledTimes(1);
    const [receivedMessage, receivedEvent] = handler.mock.calls[0];

    // First argument is the message data itself
    expect(receivedMessage).toBe(msg);

    // Second argument is the event, and event.data should reference the same message
    expect(receivedEvent.data).toBe(msg);
  });

  // ─── J. Async handler in onMessage ───

  test("async handler does not block subsequent messages", async () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const callOrder: number[] = [];

    const asyncHandler = vi.fn(async () => {
      callOrder.push(1);
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 10));
      callOrder.push(2);
    });

    const syncHandler = vi.fn(() => {
      callOrder.push(3);
    });

    endpoint.onMessage(asyncHandler);
    endpoint.onMessage(syncHandler);

    // Dispatch two messages rapidly
    const msg1 = { jsonrpc: "2.0", method: "a", id: 1 };
    const msg2 = { jsonrpc: "2.0", method: "b", id: 2 };
    worker.dispatchMessage(msg1);
    worker.dispatchMessage(msg2);

    // Both handlers are called synchronously for both messages,
    // even though asyncHandler returns a Promise
    expect(asyncHandler).toHaveBeenCalledTimes(2);
    expect(syncHandler).toHaveBeenCalledTimes(2);

    // The sync handler was NOT blocked by the async handler's await
    // callOrder should show: 1 (async start msg1), 3 (sync msg1), 1 (async start msg2), 3 (sync msg2)
    expect(callOrder).toEqual([1, 3, 1, 3]);

    // After waiting, the async continuations complete
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callOrder).toEqual([1, 3, 1, 3, 2, 2]);
  });

  // ─── Batch Request (array message) is ignored ───

  test("batch request (array of JSON-RPC messages) is ignored", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage([{ jsonrpc: "2.0", method: "ping", id: 1 }]);
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── Primitive value messages are ignored ───

  test("string primitive message is ignored", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage("hello");
    expect(handler).not.toHaveBeenCalled();
  });

  test("number primitive message is ignored", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage(42);
    expect(handler).not.toHaveBeenCalled();
  });

  test("boolean true message is ignored", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage(true);
    expect(handler).not.toHaveBeenCalled();
  });

  test("boolean false message is ignored", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    worker.dispatchMessage(false);
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── JSON-RPC Response messages pass through ───

  test("JSON-RPC Response message is passed to handler (endpoint does not distinguish Request/Response)", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const response = { jsonrpc: "2.0", result: "ok", id: 1 };
    worker.dispatchMessage(response);
    expect(handler).toHaveBeenCalledWith(response, expect.any(Object));
  });

  test("JSON-RPC Error Response message passes through onMessage", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const errorResponse = {
      jsonrpc: "2.0",
      error: { code: -32601, message: "Method not found" },
      id: 1,
    };
    worker.dispatchMessage(errorResponse);
    expect(handler).toHaveBeenCalledWith(errorResponse, expect.any(Object));
  });

  // ─── Endpoint interface shape ───

  test("workerEndpoint returns an object with send and onMessage methods", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    expect(endpoint).toBeInstanceOf(Object);
    expect(typeof endpoint.send).toBe("function");
    expect(typeof endpoint.onMessage).toBe("function");
    // No extra enumerable keys beyond send and onMessage
    expect(Object.keys(endpoint).sort()).toEqual(["onMessage", "send"]);
  });

  // ─── dispose() idempotency detail ───

  test("second dispose() call does NOT call removeEventListener again", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    const dispose = endpoint.onMessage(handler);

    dispose();
    expect(worker.removeEventListener).toHaveBeenCalledTimes(1);

    dispose();
    // removeEventListener should still have been called only once
    expect(worker.removeEventListener).toHaveBeenCalledTimes(1);
  });

  // ─── workerEndpoint with invalid target ───

  test("send() throws when target is null", () => {
    const endpoint = workerEndpoint(null as any);

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow();
  });

  test("onMessage() throws when target is undefined", () => {
    const endpoint = workerEndpoint(undefined as any);

    expect(() => {
      endpoint.onMessage(vi.fn());
    }).toThrow();
  });

  // ─── Worker.terminate() 後の send() 動作 ───

  test("send() after Worker.terminate() propagates the exception thrown by postMessage", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    // Simulate a terminated worker: postMessage throws a DOMException
    worker.postMessage.mockImplementation(() => {
      throw new DOMException(
        "Failed to execute 'postMessage' on 'Worker': Cannot post message to a terminated worker",
        "InvalidStateError",
      );
    });

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow(DOMException);
  });

  test("send() after Worker.terminate() — multiple send() calls each throw independently", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    worker.postMessage.mockImplementation(() => {
      throw new DOMException("Worker terminated");
    });

    expect(() => endpoint.send({ jsonrpc: "2.0", method: "a", id: 1 })).toThrow("Worker terminated");
    expect(() => endpoint.send({ jsonrpc: "2.0", method: "b", id: 2 })).toThrow("Worker terminated");
  });

  test("onMessage handler still works after send() throws due to terminated worker", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    // Register handler before the worker is "terminated"
    const handler = vi.fn();
    endpoint.onMessage(handler);

    // Terminate: send() will throw
    worker.postMessage.mockImplementation(() => {
      throw new DOMException("Worker terminated");
    });

    expect(() => endpoint.send({ jsonrpc: "2.0", method: "a", id: 1 })).toThrow();

    // But onMessage handler should still be registered and callable
    // (In practice, a terminated worker won't dispatch messages, but the listener is not removed)
    const msg = { jsonrpc: "2.0", method: "ping", id: 99 };
    worker.dispatchMessage(msg);
    expect(handler).toHaveBeenCalledWith(msg, expect.any(Object));
  });

  // ─── async handler の Promise rejection ───

  test("async handler rejection does not prevent other handlers from receiving messages", async () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    // Async handler that returns a rejected promise (caught internally by the try/catch,
    // but since it's async the rejection is from the returned Promise, not a sync throw).
    // We .catch() the returned promise to avoid unhandled rejection.
    const rejectedPromises: Promise<void>[] = [];
    const h1 = vi.fn(() => {
      const p = Promise.reject(new Error("async handler rejected"));
      rejectedPromises.push(p);
      return p;
    });
    const h2 = vi.fn();
    endpoint.onMessage(h1);
    endpoint.onMessage(h2);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    worker.dispatchMessage(msg);

    // Both handlers should have been called
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);

    // Second message should also be received by both handlers
    const msg2 = { jsonrpc: "2.0", method: "test2", id: 2 };
    worker.dispatchMessage(msg2);
    expect(h1).toHaveBeenCalledTimes(2);
    expect(h2).toHaveBeenCalledTimes(2);

    // Suppress unhandled rejections
    for (const p of rejectedPromises) {
      await p.catch(() => {});
    }
  });

  test("async handler rejection does not affect synchronous handler execution order", async () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const callOrder: string[] = [];
    const rejectedPromises: Promise<void>[] = [];
    const asyncRejectHandler = vi.fn(() => {
      callOrder.push("async-start");
      const p = Promise.reject(new Error("rejected"));
      rejectedPromises.push(p);
      return p;
    });
    const syncHandler = vi.fn(() => {
      callOrder.push("sync");
    });
    endpoint.onMessage(asyncRejectHandler);
    endpoint.onMessage(syncHandler);

    const msg = { jsonrpc: "2.0", method: "test", id: 1 };
    worker.dispatchMessage(msg);

    // The sync handler should not be blocked by the async rejection
    expect(callOrder).toEqual(["async-start", "sync"]);

    // Suppress unhandled rejections
    for (const p of rejectedPromises) {
      await p.catch(() => {});
    }
  });

  // ─── Endpoint インターフェース形状確認（追加） ───

  test("returned endpoint has exactly send and onMessage as own properties", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    // Verify that endpoint has the correct shape as defined by Endpoint interface
    expect(endpoint).toHaveProperty("send");
    expect(endpoint).toHaveProperty("onMessage");
    expect(typeof endpoint.send).toBe("function");
    expect(typeof endpoint.onMessage).toBe("function");

    // Ensure no additional properties leak into the endpoint
    const keys = Object.keys(endpoint);
    expect(keys).toHaveLength(2);
    expect(keys).toContain("send");
    expect(keys).toContain("onMessage");
  });

  test("send function accepts one argument (message)", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    // send() should accept one argument without error
    expect(() => endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 })).not.toThrow();
  });

  test("onMessage function returns a function (dispose)", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const dispose = endpoint.onMessage(vi.fn());
    expect(typeof dispose).toBe("function");
  });

  // ─── null/undefined target の扱い（追加） ───

  test("workerEndpoint(null) — send() throws TypeError", () => {
    const endpoint = workerEndpoint(null as any);

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow(TypeError);
  });

  test("workerEndpoint(undefined) — send() throws TypeError", () => {
    const endpoint = workerEndpoint(undefined as any);

    expect(() => {
      endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    }).toThrow(TypeError);
  });

  test("workerEndpoint(null) — onMessage() throws TypeError", () => {
    const endpoint = workerEndpoint(null as any);

    expect(() => {
      endpoint.onMessage(vi.fn());
    }).toThrow(TypeError);
  });

  test("workerEndpoint(undefined) — onMessage() throws TypeError", () => {
    const endpoint = workerEndpoint(undefined as any);

    expect(() => {
      endpoint.onMessage(vi.fn());
    }).toThrow(TypeError);
  });

  test("workerEndpoint(null) — endpoint object itself is created without error", () => {
    // workerEndpoint does not validate the target at construction time,
    // the error only occurs when send() or onMessage() is called
    expect(() => workerEndpoint(null as any)).not.toThrow();
  });

  test("workerEndpoint(undefined) — endpoint object itself is created without error", () => {
    expect(() => workerEndpoint(undefined as any)).not.toThrow();
  });

  // ─── send() の戻り値が undefined (void) であることの確認 ───

  test("send() returns undefined (void)", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const result = endpoint.send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(result).toBeUndefined();
  });

  // ─── jsonrpc: "2.0" のみのメッセージが handler に渡されること ───

  test("message with only jsonrpc: '2.0' (no method, id, or other fields) passes through to handler", () => {
    const worker = createMockWorker();
    const endpoint = workerEndpoint(worker as any);

    const handler = vi.fn();
    endpoint.onMessage(handler);

    const msg = { jsonrpc: "2.0" };
    worker.dispatchMessage(msg);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(msg, expect.objectContaining({ data: msg }));
  });
});
