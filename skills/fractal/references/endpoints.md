# Endpoints

Fractal communicates over browser messaging APIs through endpoint adapters. Each adapter wraps a messaging target into a unified `Endpoint` interface (`send` + `onMessage`).

```ts
import {
  workerEndpoint,
  windowEndpoint,
  messagePortEndpoint,
  serviceWorkerEndpoint,
  onConnect,
} from "@licht-77/fractal/endpoint";
```

## Choosing an Endpoint

| Endpoint | Use Case |
|---|---|
| `workerEndpoint(worker)` | Dedicated Worker or SharedWorker |
| `windowEndpoint(window, options?)` | iframe, popup, or parent window |
| `messagePortEndpoint(port)` | `MessagePort` (from `MessageChannel`, etc.) |
| `serviceWorkerEndpoint(sw, options?)` | ServiceWorker (async — returns `Promise<Endpoint>`) |
| `onConnect(callback)` | Inside a SharedWorker to accept connections |

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

For communicating with a ServiceWorker. This is **async** because it performs a handshake via `MessageChannel`:

```ts
const endpoint = await serviceWorkerEndpoint(navigator.serviceWorker.controller!, {
  timeout: 3000,
});
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `timeout` | `number` | `undefined` | Timeout in ms for the initial handshake. Rejects with `FractalError("TIMEOUT")` if exceeded. |

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
