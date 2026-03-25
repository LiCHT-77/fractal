# Endpoints

Fractal communicates over browser messaging APIs through endpoint adapters. Each adapter wraps a messaging target into a unified `Endpoint` interface (`send` + `onMessage`).

```ts
import {
  workerEndpoint,
  windowEndpoint,
  messagePortEndpoint,
  serviceWorkerEndpoint,
  onConnect,
  extensionPortEndpoint,
  extensionRuntimeEndpoint,
  extensionTabEndpoint,
} from "@licht-77/fractal/endpoint";
```

## Choosing an Endpoint

| Endpoint | Use Case |
|---|---|
| `workerEndpoint(worker)` | Dedicated Worker or SharedWorker |
| `windowEndpoint(window, options?)` | iframe, popup, or parent window |
| `messagePortEndpoint(port)` | `MessagePort` (from `MessageChannel`, etc.) |
| `serviceWorkerEndpoint(sw, options?)` | ServiceWorker (handshake runs in background) |
| `onConnect(callback)` | Inside a SharedWorker to accept connections |
| `extensionPortEndpoint(port)` | Browser extension `runtime.Port` (long-lived connection) |
| `extensionRuntimeEndpoint(browser)` | Extension content script → background (`runtime.sendMessage`) |
| `extensionTabEndpoint(browser, tabId)` | Extension background → specific tab (`tabs.sendMessage`) |

## `workerEndpoint(worker)`

For communicating with a Worker or SharedWorker:

```ts
// Main thread
const worker = new Worker("./worker.ts");
const endpoint = workerEndpoint(worker);

// Inside the worker
const endpoint = workerEndpoint(self);
```

## `windowEndpoint(window, options?)`

For communicating across windows (iframe, popup):

```ts
const iframe = document.getElementById("my-iframe") as HTMLIFrameElement;
const endpoint = windowEndpoint(iframe.contentWindow!, {
  origin: "https://trusted.example.com",
});
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `origin` | `string` | `"*"` | Target origin for `postMessage`. Set this to restrict messages to a specific origin. |
| `listener` | `EventTarget` | `globalThis` | The object to attach the `message` event listener to. |

When `origin` is set (not `"*"`), incoming messages from other origins are ignored.

## `messagePortEndpoint(port)`

For communicating over a `MessagePort`:

```ts
const channel = new MessageChannel();
const endpoint1 = messagePortEndpoint(channel.port1);
const endpoint2 = messagePortEndpoint(channel.port2);
```

The adapter automatically calls `port.start()` when `onMessage` is first registered.

## `serviceWorkerEndpoint(sw, options?)`

For communicating with a ServiceWorker. Accepts either a `ServiceWorker` object or a `ServiceWorkerContainer` (`navigator.serviceWorker`). The handshake (`fractal:connect` / `fractal:ack`) starts in the background via `MessageChannel`. Messages sent before the handshake completes are buffered and flushed in order once acknowledged.

When a `ServiceWorkerContainer` is passed, the endpoint internally waits for `container.ready` before initiating the handshake. This avoids the need to manually check `navigator.serviceWorker.controller` on first load.

```ts
// Passing ServiceWorker directly (controller must be non-null)
const endpoint = serviceWorkerEndpoint(navigator.serviceWorker.controller!, {
  timeout: 3000,
});

// Passing ServiceWorkerContainer (recommended — handles first-load automatically)
const endpoint = serviceWorkerEndpoint(navigator.serviceWorker, {
  timeout: 3000,
});

const client = createClient<AppType>(endpoint);
await client.greet();
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `timeout` | `number` | `undefined` | Timeout in ms for the handshake (including `ready` wait for containers). After timeout, `send()` throws `FractalError("TIMEOUT")`. |

## `onConnect(callback)`

Used **inside a SharedWorker** to accept incoming connections:

```ts
// shared-worker.ts
import { Fractal } from "@licht-77/fractal";
import { serve } from "@licht-77/fractal/adapter";
import { onConnect } from "@licht-77/fractal/endpoint";

const app = new Fractal()
  .method("ping", (c) => c.json("pong"));

onConnect((endpoint) => {
  serve(app, endpoint);
});
```

Inside a ServiceWorker, use `onConnect` the same way to handle `fractal:connect` messages and establish a `MessagePort`-based channel.

## `extensionPortEndpoint(port)`

For communicating over a browser extension `runtime.Port` (long-lived connection):

```ts
// content-script.ts
const port = chrome.runtime.connect({ name: "rpc" });
const client = createClient<AppType>(extensionPortEndpoint(port));
const result = await client.ping();

// background.ts
chrome.runtime.onConnect.addListener((port) => {
  serve(app, extensionPortEndpoint(port));
});
```

The adapter uses `port.onMessage.addListener` / `removeListener`. Extension Port callbacks receive `(message)` directly (not a `MessageEvent`), so the adapter synthesizes `{ data: message } as MessageEvent` internally. No `port.start()` is needed.

## `extensionRuntimeEndpoint(browser)`

For content script → background communication using `runtime.sendMessage` / `runtime.onMessage`:

```ts
// content-script.ts
const client = createClient<AppType>(extensionRuntimeEndpoint(chrome));
const result = await client.getData({ key: "settings" });

// background.ts
serve(app, extensionRuntimeEndpoint(chrome));
```

Accepts a duck-typed API object — both `chrome` and `browser` namespaces work. No sender filtering is applied; all messages from any content script are received. For 1:1 communication with a specific tab, use `extensionTabEndpoint` instead.

## `extensionTabEndpoint(browser, tabId)`

For background → specific tab communication using `tabs.sendMessage(tabId, message)` and `runtime.onMessage` with sender filtering (`sender.tab?.id === tabId`):

```ts
// background.ts
const client = createClient<AppType>(extensionTabEndpoint(chrome, tabId));
const result = await client.getPageData();

// content-script.ts (use extensionRuntimeEndpoint on the content script side)
serve(app, extensionRuntimeEndpoint(chrome));
```

| Option | Type | Description |
|---|---|---|
| `browser` | object | `chrome` or `browser` API object (duck-typed) |
| `tabId` | `number` | Target tab ID |

The content script side uses `extensionRuntimeEndpoint`, not `extensionTabEndpoint`. The tab endpoint is background-side only — it sends via `tabs.sendMessage` and filters incoming messages by sender tab ID.
