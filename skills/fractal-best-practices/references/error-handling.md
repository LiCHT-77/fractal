# Error Handling

## Error Types

### `RpcError` (Server-side JSON-RPC Error)

Thrown or returned by the server. On the client, rejected promises carry an `RpcError` instance.

```ts
import { RpcError } from "@licht-77/fractal/client";

try {
  await client.user.get({ id: -1 });
} catch (err) {
  if (err instanceof RpcError) {
    err.code;    // number — JSON-RPC error code
    err.message; // string
    err.data;    // unknown — optional additional data
  }
}
```

### `FractalError` (Client-side Error)

Thrown by the client for transport-level issues:

```ts
import { FractalError } from "@licht-77/fractal/client";

try {
  await client.slowMethod({});
} catch (err) {
  if (err instanceof FractalError) {
    err.code; // "TIMEOUT" | "DISPOSED"
  }
}
```

| Code | When |
|---|---|
| `"TIMEOUT"` | A call exceeded its timeout (default or per-call). |
| `"DISPOSED"` | The client was disposed while the call was pending, or a call was made after disposal. |

## Server-Side Error Handling

### Explicit Errors

Use `c.error()` to return a JSON-RPC error:

```ts
.method("user.get", (c) => {
  const { id } = c.req.params;
  if (id <= 0) {
    return c.error(-32000, "Invalid user ID", { id });
  }
  return c.json({ id, name: "Alice" });
})
```

### Thrown Errors

Any `Error` thrown in a handler is automatically converted to an `INTERNAL_ERROR` (-32603) response:

```ts
.method("fail", (c) => {
  throw new Error("something went wrong");
  // → { code: -32603, message: "something went wrong" }
})
```

You can also throw `RpcError` directly for custom error codes:

```ts
import { RpcError } from "@licht-77/fractal/client";

.method("restricted", (c) => {
  throw new RpcError(-32000, "Forbidden", { reason: "insufficient role" });
})
```

## Standard JSON-RPC Error Codes

| Code | Constant | Meaning |
|---|---|---|
| -32700 | `PARSE_ERROR` | Invalid JSON received. |
| -32600 | `INVALID_REQUEST` | The request is not a valid JSON-RPC object, or `params` is not a plain object. |
| -32601 | `METHOD_NOT_FOUND` | The method does not exist. |
| -32602 | `INVALID_PARAMS` | Invalid method parameters. |
| -32603 | `INTERNAL_ERROR` | Internal server error (default for uncaught exceptions). |

## Params Validation

The `params` field in a JSON-RPC request **must** be a plain object (or omitted). Arrays and primitives are rejected with `INVALID_REQUEST`:

```ts
// Valid
client.greet({ name: "Alice" });
client.list();              // params omitted — OK

// Invalid — will result in INVALID_REQUEST error
// params must always be a plain object, not an array or primitive
```
