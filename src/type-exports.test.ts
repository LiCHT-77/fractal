import type { ClientOptions } from "./client/index.ts";
import type {
  ExtensionBrowserLike,
  ExtensionMessageSender,
  ExtensionPortLike,
  ExtensionRuntimeLike,
  ExtensionTabsLike,
  MessagePortLike,
  ServiceWorkerContainerLike,
  ServiceWorkerEndpointOptions,
  ServiceWorkerLike,
  WindowEndpointOptions,
  WorkerLike,
} from "./endpoint/index.ts";
import type { Endpoint } from "./endpoint/types.ts";
import type { Handler, Middleware } from "./index.ts";

describe("type exports", () => {
  test("Endpoint is structurally correct", () => {
    const ep: Endpoint = {
      send(_message: unknown) {},
      onMessage(_handler: (message: unknown, event: MessageEvent) => void) {
        return () => {};
      },
    };
    expect(ep).toBeDefined();
  });

  test("endpoint *Like types are importable", () => {
    // These just need to compile — runtime check that the symbols resolved
    const checks: unknown[] = [
      undefined as unknown as WorkerLike,
      undefined as unknown as MessagePortLike,
      undefined as unknown as ExtensionBrowserLike,
      undefined as unknown as ExtensionPortLike,
      undefined as unknown as ServiceWorkerEndpointOptions,
      undefined as unknown as ServiceWorkerLike,
      undefined as unknown as ServiceWorkerContainerLike,
      undefined as unknown as ExtensionMessageSender,
      undefined as unknown as ExtensionRuntimeLike,
      undefined as unknown as ExtensionTabsLike,
      undefined as unknown as WindowEndpointOptions,
    ];
    expect(checks).toHaveLength(11);
  });

  test("ClientOptions is importable", () => {
    const opts: ClientOptions = { defaultTimeout: 1000 };
    expect(opts.defaultTimeout).toBe(1000);
  });

  test("Handler and Middleware are importable", () => {
    const checks: unknown[] = [
      undefined as unknown as Handler,
      undefined as unknown as Middleware,
    ];
    expect(checks).toHaveLength(2);
  });
});
