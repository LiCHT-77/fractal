# Client Setup

## Creating a Client

```ts
import { createClient } from "@licht-77/fractal/client";
import { workerEndpoint } from "@licht-77/fractal/endpoint";
import type { AppType } from "./server";

const worker = new Worker("./server.ts");
const client = createClient<AppType>(workerEndpoint(worker));
```

The `AppType` generic parameter provides full type inference — method names, parameter types, and return types are all inferred.

## Calling Methods

```ts
// Flat method
const result = await client.greet({ name: "Alice" });

// Namespaced method — dot-separated names become nested properties
const user = await client.user.get({ id: 1 });
```

If a method's params type has no required keys, the params argument is optional:

```ts
// If handler is (c: Context<{}>) => ...
const items = await client.list();
```

## Notifications (`$notify`)

Fire-and-forget calls that don't wait for a response:

```ts
client.$notify.log({ message: "something happened" });
```

Notifications follow the same namespace structure as regular calls. They return `void` synchronously and never throw on the server side.

## Timeout

### Default Timeout

Set a default timeout for all calls:

```ts
const client = createClient<AppType>(endpoint, {
  defaultTimeout: 5000, // 5 seconds
});
```

### Per-Call Timeout

Override the default on individual calls:

```ts
const result = await client.heavyTask({ data }, { timeout: 30000 });
```

When a timeout is reached, the promise rejects with a `FractalError` with code `"TIMEOUT"`.

Setting `timeout` to `Infinity` disables the timeout for that call.

## Disposal

Always dispose the client when done to clean up the message listener and reject pending requests:

```ts
client.dispose();
```

Or use TC39 Explicit Resource Management:

```ts
using client = createClient<AppType>(endpoint);
// client is automatically disposed when it goes out of scope
```

After disposal:
- All pending requests are rejected with `FractalError` (code `"DISPOSED"`).
- Any new call throws `FractalError` (code `"DISPOSED"`) synchronously.
