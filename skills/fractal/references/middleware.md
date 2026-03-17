# Middleware

Fractal uses a Hono-style `(context, next)` middleware pattern.

## Global Middleware

Applied to every method:

```ts
const app = new Fractal()
  .use(async (c, next) => {
    console.log(`→ ${c.req.method}`);
    await next();
    console.log(`← ${c.req.method}`);
  })
  .method("ping", (c) => c.json("pong"));
```

## Scoped Middleware

Applied only to methods matching a pattern:

```ts
const app = new Fractal()
  .use("admin.**", async (c, next) => {
    // Only runs for methods starting with "admin."
    await next();
  })
  .method("admin.getUsers", (c) => c.json([]))
  .method("public.health", (c) => c.json("ok"));
```

## Pattern Syntax

Patterns use dot-separated segments (matching method name structure):

| Pattern | Matches | Does Not Match |
|---|---|---|
| `user.get` | `user.get` | `user.list`, `user.get.details` |
| `user.*` | `user.get`, `user.list` | `user.profile.avatar` |
| `user.**` | `user.get`, `user.profile.avatar` | `admin.get` |
| `*` | Any single-segment method | `user.get` |
| `**` | Any method (1+ segments) | _(matches everything)_ |

- `*` matches exactly **one** segment.
- `**` matches **one or more** segments.

## Calling `next()`

You **must** call `await next()` to continue to the next middleware or the handler. If you don't call `next()`, the handler will not execute and the middleware chain produces an internal error.

```ts
.use(async (c, next) => {
  // Before handler
  await next();
  // After handler — c.res is now set
})
```

## Short-Circuiting

Return a JSON-RPC response directly from middleware to skip the rest of the chain:

```ts
.use(async (c, next) => {
  if (!isAuthorized(c)) {
    return c.error(-32000, "Unauthorized");
  }
  await next();
})
```

## Middleware Ordering

Middleware runs in registration order. Global middleware registered before scoped middleware runs first:

```ts
new Fractal()
  .use(logging)          // 1st — global
  .use("admin.**", auth) // 2nd — scoped (admin only)
  .method("admin.delete", handler);
```
