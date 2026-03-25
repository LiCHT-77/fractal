import type { Endpoint } from "./types.ts";

export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  removeEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
  ): void;
}

function isJsonRpcMessage(data: unknown): data is { jsonrpc: "2.0" } {
  return (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as Record<string, unknown>).jsonrpc === "2.0"
  );
}

function assertWorker(worker: WorkerLike): asserts worker is WorkerLike {
  if (worker == null) {
    throw new TypeError("Worker target must not be null or undefined");
  }
}

export function workerEndpoint(worker: WorkerLike): Endpoint {
  return {
    send(message: unknown): void {
      assertWorker(worker);
      worker.postMessage(message);
    },
    onMessage(
      handler: (message: unknown, event: MessageEvent) => void,
    ): () => void {
      assertWorker(worker);

      const listener = (event: MessageEvent): void => {
        const { data } = event;
        if (!isJsonRpcMessage(data)) return;
        try {
          handler(data, event);
        } catch {
          // Errors in handlers are caught and swallowed
        }
      };

      worker.addEventListener("message", listener);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        worker.removeEventListener("message", listener);
      };
    },
  };
}
