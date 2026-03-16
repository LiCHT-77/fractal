import type { Fractal } from "../core/app.ts";
import { INVALID_REQUEST } from "../protocol/errors.ts";

interface Endpoint {
  send: (message: unknown) => void;
  onMessage: (
    handler: (message: unknown, event: MessageEvent) => void,
  ) => () => void;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResponse(msg: Record<string, unknown>): boolean {
  return "result" in msg || "error" in msg;
}

function isNotification(msg: Record<string, unknown>): boolean {
  return !("id" in msg);
}

export function serve(
  app: Fractal<Record<string, unknown>>,
  endpoint: Endpoint,
): { dispose: () => void; [Symbol.dispose]: () => void } {
  const unsubscribe = endpoint.onMessage(
    (message: unknown, event: MessageEvent) => {
      // Ignore non-plain-object messages
      if (!isPlainObject(message)) {
        return;
      }

      const msg = message as Record<string, unknown>;

      // Ignore response messages
      if (isResponse(msg)) {
        return;
      }

      const notification = isNotification(msg);

      // Validate method field at serve level
      if (typeof msg.method !== "string") {
        if (notification) {
          console.error("Invalid Request: method must be a string");
          return;
        }
        // Request with id but invalid/missing method
        const id = (msg.id ?? null) as string | number | null;
        const response = {
          jsonrpc: "2.0" as const,
          error: { code: INVALID_REQUEST, message: "Invalid Request" },
          id,
        };
        try {
          endpoint.send(response);
        } catch (err) {
          console.error(err);
        }
        return;
      }

      // Dispatch to app (async, fire-and-forget from onMessage's perspective)
      (async () => {
        try {
          const response = await app.dispatch(msg, event);
          if (response !== undefined && !notification) {
            try {
              endpoint.send(response);
            } catch (err) {
              console.error(err);
            }
          }
        } catch (err) {
          console.error(err);
        }
      })();
    },
  );

  const dispose = unsubscribe;

  return {
    dispose,
    [Symbol.dispose]: dispose,
  };
}
