# Server Setup

## Creating a Fractal App

```ts
import { Fractal } from "@licht-77/fractal";

const app = new Fractal()
  .method("greet", (c) => {
    const { name } = c.req.params;
    return c.json({ message: `Hello, ${name}!` });
  })
  .method("add", (c) => {
    const { a, b } = c.req.params;
    return c.json(a + b);
  });
```

Each `.method(name, handler)` call registers a JSON-RPC method. Method calls are chainable and the returned `Fractal` instance carries accumulated type information.

## Namespaced Methods

Use dot-separated names to organize methods into namespaces:

```ts
const app = new Fractal()
  .method("user.get", (c) => {
    return c.json({ id: c.req.params.id, name: "Alice" });
  })
  .method("user.list", (c) => {
    return c.json([{ id: 1, name: "Alice" }]);
  });
```

On the client side, these become `client.user.get()` and `client.user.list()`.

**Constraints:**
- Method names must not start with `rpc.` (reserved by JSON-RPC spec).
- Method names must not start with `$notify`, `dispose`, or `then` (reserved client properties).
- A method name cannot conflict with another method's namespace prefix (e.g., `user` and `user.get` cannot coexist).

## Context Object

Every handler receives a `Context` object with:

| Property / Method | Description |
|---|---|
| `c.req.params` | The parsed params object from the JSON-RPC request. |
| `c.req.method` | The method name string. |
| `c.req.id` | The request ID (`string \| number \| null \| undefined`). `undefined` for notifications. |
| `c.req.raw` | The original `MessageEvent` (if available). |
| `c.json(result)` | Return a success response. `result` must be non-`undefined`. |
| `c.error(code, message, data?)` | Return an error response with a JSON-RPC error code. |

## Typed Parameters

Use a typed `Context<T>` to get type-safe params. This type is inferred on the client side:

```ts
const app = new Fractal()
  .method("user.get", (c: Context<{ id: number }>) => {
    const { id } = c.req.params; // id: number
    return c.json({ id, name: "Alice" });
  });
```

## Starting the Server

Use `serve()` to connect the app to an endpoint:

```ts
import { serve } from "@licht-77/fractal/adapter";
import { workerEndpoint } from "@licht-77/fractal/endpoint";

const server = serve(app, workerEndpoint(self));
```

`serve()` returns a disposable object:

```ts
server.dispose();
// or using TC39 Explicit Resource Management:
using server = serve(app, workerEndpoint(self));
```

## Exporting the App Type

Export the app type so clients can infer method signatures:

```ts
export type AppType = typeof app;
```

This is **required** for the client to get full type safety. The client imports `AppType` as a type-only import and passes it to `createClient<AppType>()`.
