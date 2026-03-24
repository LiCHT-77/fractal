# @licht-77/fractal

Type-safe JSON-RPC framework for browser messaging.

Unifies communication across **iframe**, **Worker**, **SharedWorker**, **ServiceWorker**, and **MessagePort** with a single, consistent API.

## Features

- **Type-safe RPC** — Server method definitions infer client types automatically
- **Transport agnostic** — 5 built-in endpoints for every browser messaging channel
- **JSON-RPC 2.0** compliant
- **Hono-style middleware** — Pattern matching with `*` and `**` wildcards
- **Namespace routing** — `user.get` on the server becomes `client.user.get()` on the client
- **Notification support** — Fire-and-forget calls via `$notify`
- **Disposable** — `dispose()` and `using` (TC39 Explicit Resource Management)

## Install

```sh
npm install @licht-77/fractal
```

## Quick Start

Define methods on the server, call them with full type safety on the client.

**worker.ts** (server side)

```ts
import type { Context } from "@licht-77/fractal";
import { Fractal } from "@licht-77/fractal";
import { serve } from "@licht-77/fractal/adapter";
import { workerEndpoint } from "@licht-77/fractal/endpoint";

const app = new Fractal()
  .method("greet", (c: Context<{ name: string }>) => {
    return c.json(`Hello, ${c.req.params.name}!`);
  })
  .method("ping", (c) => {
    return c.json("pong");
  });

export type AppType = typeof app;

serve(app, workerEndpoint(self as unknown as Worker));
```

**main.ts** (client side)

```ts
import { createClient } from "@licht-77/fractal/client";
import { workerEndpoint } from "@licht-77/fractal/endpoint";
import type { AppType } from "./worker.ts";

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});

const client = createClient<AppType>(workerEndpoint(worker));

const result = await client.greet({ name: "World" }); // string
const pong = await client.ping(); // string

// Fire-and-forget notification (no response)
client.$notify.greet({ name: "World" });

// Clean up
client.dispose();
```

## Endpoints

| Endpoint | Target | Import |
|---|---|---|
| `workerEndpoint(worker)` | Worker / SharedWorker port | `@licht-77/fractal/endpoint` |
| `windowEndpoint(window, options?)` | iframe / popup Window | `@licht-77/fractal/endpoint` |
| `messagePortEndpoint(port)` | MessagePort | `@licht-77/fractal/endpoint` |
| `serviceWorkerEndpoint(sw, options?)` | ServiceWorker (client side) | `@licht-77/fractal/endpoint` |
| `onConnect(callback)` | ServiceWorker (inside SW) | `@licht-77/fractal/endpoint` |

`windowEndpoint` accepts `{ origin?: string; listener?: EventTarget }`.
`serviceWorkerEndpoint` returns an `Endpoint` synchronously and accepts `{ timeout?: number }`. The handshake runs in the background; messages are buffered until it completes.

## Middleware

Middleware follows the Hono-style `(context, next)` pattern.

```ts
// Global middleware — runs on every method
app.use(async (c, next) => {
  console.log(`[${c.req.method}] called`);
  await next();
});

// Scoped middleware — pattern matching with * and **
app.use("user.*", async (c, next) => {
  // Runs only for methods like "user.get", "user.create"
  await next();
});
```

## Error Handling

**`RpcError`** — Thrown on the client when the server returns a JSON-RPC error.

```ts
import { RpcError } from "@licht-77/fractal/client";

try {
  await client.someMethod();
} catch (err) {
  if (err instanceof RpcError) {
    console.error(err.code, err.message, err.data);
  }
}
```

**`FractalError`** — Client-side errors: `TIMEOUT` or `DISPOSED`.

```ts
import { FractalError } from "@licht-77/fractal/client";

const client = createClient<AppType>(endpoint, { defaultTimeout: 5000 });

try {
  await client.someMethod({}, { timeout: 3000 });
} catch (err) {
  if (err instanceof FractalError) {
    // err.code === "TIMEOUT" | "DISPOSED"
  }
}
```

## API Reference

### `@licht-77/fractal`

```ts
class Fractal<S>
  .method(name, handler): Fractal<S & ...>   // handler: (c: Context<TParams>) => ...
  .use(middleware): Fractal<S>
  .use(pattern, middleware): Fractal<S>

interface Context<TParams>
  req: { method, params, id, raw }
  json<T>(result: T): JsonRpcSuccessResponse<T>
  error(code, message, data?): JsonRpcErrorResponse
```

### `@licht-77/fractal/adapter`

```ts
serve(app, endpoint): { dispose(), [Symbol.dispose]() }
```

### `@licht-77/fractal/client`

```ts
createClient<AppType>(endpoint, options?): FractalClient<...>

interface ClientOptions { defaultTimeout?: number }
interface CallOptions { timeout?: number }

class RpcError extends Error { code: number; data?: unknown }
class FractalError extends Error { code: "TIMEOUT" | "DISPOSED" }
```

### `@licht-77/fractal/endpoint`

```ts
workerEndpoint(worker): Endpoint
windowEndpoint(target, options?): Endpoint
messagePortEndpoint(port): Endpoint
serviceWorkerEndpoint(sw, options?): Endpoint
onConnect(callback: (endpoint: Endpoint) => void): void
```

## License

MIT
