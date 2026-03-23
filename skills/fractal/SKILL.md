---
name: fractal
description: Best practices for building @licht-77/fractal integrations. Use when implementing JSON-RPC servers/clients with Fractal, setting up endpoints (Worker, iframe, MessagePort, ServiceWorker), middleware, error handling, or type-safe RPC patterns.
---

# Fractal Best Practices

`@licht-77/fractal` is a type-safe JSON-RPC 2.0 framework for browser messaging APIs. It provides end-to-end type safety between server and client across Workers, iframes, MessagePorts, and ServiceWorkers.

## Entry Points

| Import | Purpose |
|---|---|
| `@licht-77/fractal` | Core — `Fractal` class, `serve()`, `createClient()` |
| `@licht-77/fractal/endpoint` | Endpoint adapters — `workerEndpoint`, `windowEndpoint`, `messagePortEndpoint`, `serviceWorkerEndpoint`, `onConnect` |
| `@licht-77/fractal/adapter` | Server adapter — `serve()` |
| `@licht-77/fractal/client` | Client factory — `createClient()`, `RpcError`, `FractalError` |

## References

- [Server Setup](references/server-setup.md) — Define methods, create a server, and export types for client inference.
- [Client Setup](references/client-setup.md) — Create type-safe clients, use namespaces, notifications, timeouts, and disposal.
- [Endpoints](references/endpoints.md) — Choose the right endpoint for Worker, iframe, MessagePort, or ServiceWorker.
- [Middleware](references/middleware.md) — Add global or scoped middleware with Hono-style `(context, next)` pattern.
- [Error Handling](references/error-handling.md) — Handle RPC errors, client-side errors, timeouts, and disposal.
