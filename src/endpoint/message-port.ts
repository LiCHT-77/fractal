interface MessagePortLike {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  removeEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
  ): void;
  start(): void;
}

interface Endpoint {
  send(message: unknown): void;
  onMessage(
    handler: (message: unknown, event: MessageEvent) => void,
  ): () => void;
}

function isJsonRpcMessage(data: unknown): data is { jsonrpc: "2.0" } {
  return (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as Record<string, unknown>).jsonrpc === "2.0"
  );
}

export function messagePortEndpoint(port: MessagePortLike): Endpoint {
  return {
    send(message: unknown): void {
      port.postMessage(message);
    },
    onMessage(
      handler: (message: unknown, event: MessageEvent) => void,
    ): () => void {
      const listener = (event: MessageEvent): void => {
        const { data } = event;
        if (!isJsonRpcMessage(data)) return;
        try {
          handler(data, event);
        } catch {
          // Errors in handlers are caught and swallowed
        }
      };

      port.start();
      port.addEventListener("message", listener);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        port.removeEventListener("message", listener);
      };
    },
  };
}
