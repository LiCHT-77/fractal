import type { Endpoint } from "./types.ts";

export interface ExtensionPortLike {
  postMessage(message: unknown): void;
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
    removeListener(callback: (message: unknown) => void): void;
  };
}

function isJsonRpcMessage(data: unknown): data is { jsonrpc: "2.0" } {
  return (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as Record<string, unknown>).jsonrpc === "2.0"
  );
}

export function extensionPortEndpoint(port: ExtensionPortLike): Endpoint {
  return {
    send(message: unknown): void {
      port.postMessage(message);
    },
    onMessage(
      handler: (message: unknown, event: MessageEvent) => void,
    ): () => void {
      const listener = (message: unknown): void => {
        if (!isJsonRpcMessage(message)) return;
        try {
          handler(message, { data: message } as MessageEvent);
        } catch {
          // Errors in handlers are caught and swallowed
        }
      };

      port.onMessage.addListener(listener);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        port.onMessage.removeListener(listener);
      };
    },
  };
}
