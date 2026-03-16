export interface Endpoint {
  send(message: unknown): void;
  onMessage(
    handler: (message: unknown, event: MessageEvent) => void,
  ): () => void;
}

export interface WindowEndpointOptions {
  origin?: string;
  listener?: EventTarget;
}

export function windowEndpoint(
  target: Window,
  options?: WindowEndpointOptions,
): Endpoint {
  const origin = options?.origin ?? "*";
  const listener = options?.listener ?? globalThis;

  return {
    send(message: unknown): void {
      target.postMessage(message, origin);
    },

    onMessage(
      handler: (message: unknown, event: MessageEvent) => void,
    ): () => void {
      const wrappedHandler = (event: MessageEvent) => {
        // Filter by origin (unless wildcard)
        if (origin !== "*" && event.origin !== origin) return;

        // Filter by source — must be the target window
        if (!event.source || event.source !== target) return;

        const data: unknown = event.data;

        // Filter: data must be a non-null, non-array object with jsonrpc === "2.0"
        if (
          data === null ||
          data === undefined ||
          typeof data !== "object" ||
          Array.isArray(data)
        )
          return;
        if ((data as Record<string, unknown>).jsonrpc !== "2.0") return;

        try {
          handler(data, event);
        } catch {
          // Swallow synchronous handler exceptions
        }
      };

      listener.addEventListener("message", wrappedHandler as EventListener);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        listener.removeEventListener(
          "message",
          wrappedHandler as EventListener,
        );
      };
    },
  };
}
