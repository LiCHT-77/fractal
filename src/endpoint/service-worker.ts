import { FractalError } from "../protocol/errors.ts";

interface MessagePortLike {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  removeEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
  ): void;
  start?: (() => void) | unknown;
}

interface Endpoint {
  send(message: unknown): void;
  onMessage(
    handler: (message: unknown, event: MessageEvent) => void,
  ): () => void;
}

interface ServiceWorkerEndpointOptions {
  timeout?: number;
}

function isJsonRpcMessage(data: unknown): data is { jsonrpc: "2.0" } {
  return (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as Record<string, unknown>).jsonrpc === "2.0"
  );
}

function createPortEndpoint(port: MessagePortLike): Endpoint {
  const handlers: Array<(message: unknown, event: MessageEvent) => void> = [];
  let listenerAttached = false;

  const listener = (event: MessageEvent): void => {
    const { data } = event;
    if (!isJsonRpcMessage(data)) return;
    for (const handler of [...handlers]) {
      handler(data, event);
    }
  };

  return {
    send(message: unknown): void {
      port.postMessage(message);
    },
    onMessage(
      handler: (message: unknown, event: MessageEvent) => void,
    ): () => void {
      handlers.push(handler);

      if (!listenerAttached) {
        port.addEventListener("message", listener);
        listenerAttached = true;
      }

      if (typeof port.start === "function") {
        port.start();
      }

      let disposed = false;
      return (): void => {
        if (disposed) return;
        disposed = true;
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      };
    },
  };
}

export async function serviceWorkerEndpoint(
  sw: { postMessage(message: unknown, transfer?: Transferable[]): void },
  options?: ServiceWorkerEndpointOptions,
): Promise<Endpoint> {
  if (sw == null) {
    throw new Error("Service Worker controller is not available");
  }

  const timeout = options?.timeout;

  if (timeout !== undefined) {
    if (typeof timeout === "number" && (Number.isNaN(timeout) || timeout < 0)) {
      throw new TypeError("timeout must be a non-negative number");
    }
  }

  return new Promise<Endpoint>((resolve, reject) => {
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const channel = new MessageChannel();
    const port = channel.port1;

    const ackListener = (event: MessageEvent): void => {
      const { data } = event;
      if (
        data !== null &&
        typeof data === "object" &&
        (data as Record<string, unknown>).type === "fractal:ack"
      ) {
        if (timerId !== undefined) {
          clearTimeout(timerId);
        }
        port.removeEventListener("message", ackListener);
        resolve(createPortEndpoint(port as unknown as MessagePortLike));
      }
    };

    port.addEventListener("message", ackListener);
    port.start();

    if (timeout !== undefined && timeout !== Number.POSITIVE_INFINITY) {
      timerId = setTimeout(() => {
        port.removeEventListener("message", ackListener);
        reject(new FractalError("TIMEOUT"));
      }, timeout);
    }

    try {
      sw.postMessage({ type: "fractal:connect" }, [
        channel.port2 as unknown as Transferable,
      ]);
    } catch (err) {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
      port.removeEventListener("message", ackListener);
      reject(err);
    }
  });
}

let currentListener: ((event: MessageEvent) => void) | undefined;

export function onConnect(callback: (endpoint: Endpoint) => void): void {
  if (currentListener) {
    globalThis.removeEventListener("message", currentListener as EventListener);
  }

  const listener = (event: MessageEvent): void => {
    const { data, ports } = event as unknown as {
      data: unknown;
      ports: unknown;
    };

    if (
      data === null ||
      data === undefined ||
      typeof data !== "object" ||
      (data as Record<string, unknown>).type !== "fractal:connect"
    ) {
      return;
    }

    if (!Array.isArray(ports) || ports.length === 0) {
      return;
    }

    const port = ports[0] as MessagePortLike | null;
    if (port == null || typeof port.postMessage !== "function") {
      return;
    }

    port.postMessage({ type: "fractal:ack" });

    const endpoint = createPortEndpoint(port);
    callback(endpoint);
  };

  currentListener = listener;
  globalThis.addEventListener("message", listener as EventListener);
}
