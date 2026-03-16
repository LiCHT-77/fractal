import { expectTypeOf } from "vitest";
import { createClient } from "./client/proxy.ts";
import { Fractal } from "./core/app.ts";
import { createMockEndpoint } from "./test-helpers.ts";

describe("type inference", () => {
  const endpoint = createMockEndpoint();

  const app = new Fractal()
    .method("ping", (c) => c.json("pong"))
    .method("user.get", (c) => c.json({ name: "Alice", age: 30 }))
    .method("user.update", (c) => c.json({ ok: true }))
    .method("math.add", (c) => c.json(42));

  const client = createClient<typeof app>(endpoint);

  test("top-level method returns correct type", () => {
    expectTypeOf(client.ping).toBeFunction();
    expectTypeOf(client.ping()).toEqualTypeOf<Promise<string>>();
  });

  test("nested method returns correct type", () => {
    expectTypeOf(client.user.get()).toEqualTypeOf<
      Promise<{ name: string; age: number }>
    >();
    expectTypeOf(client.user.update()).toEqualTypeOf<
      Promise<{ ok: boolean }>
    >();
    expectTypeOf(client.math.add()).toEqualTypeOf<Promise<number>>();
  });

  test("$notify proxy returns void", () => {
    expectTypeOf(client.$notify.ping).toBeFunction();
    expectTypeOf(client.$notify.ping()).toBeVoid();
    expectTypeOf(client.$notify.user.get()).toBeVoid();
  });

  test("dispose is available", () => {
    expectTypeOf(client.dispose).toBeFunction();
  });

  test("nonexistent method is a type error", () => {
    // @ts-expect-error - nonexistent method
    client.nonexistent();
  });

  test("async handlers infer correctly", () => {
    const asyncApp = new Fractal().method("delayed", async (c) =>
      c.json({ status: "done" as const }),
    );
    const asyncClient = createClient<typeof asyncApp>(endpoint);
    expectTypeOf(asyncClient.delayed()).toEqualTypeOf<
      Promise<{ status: "done" }>
    >();
  });

  test("untyped createClient returns any", () => {
    const untypedClient = createClient(endpoint);
    // Should not cause type errors - untyped client is any
    untypedClient.anything.goes();
  });

  test("use() preserves schema", () => {
    const appWithMiddleware = new Fractal()
      .method("ping", (c) => c.json("pong"))
      .use(async (_c, next) => {
        await next();
      })
      .method("hello", (c) => c.json("world"));

    const mwClient = createClient<typeof appWithMiddleware>(endpoint);
    expectTypeOf(mwClient.ping()).toEqualTypeOf<Promise<string>>();
    expectTypeOf(mwClient.hello()).toEqualTypeOf<Promise<string>>();
  });
});
