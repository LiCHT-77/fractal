import { createClient } from "./client/proxy.ts";
import { Fractal } from "./core/app.ts";
import { createMockEndpoint } from "./test-helpers.ts";

// Compile-time type assertion helper — errors at compile time if T is not assignable to U
type AssertType<T, U> = T extends U ? true : false;
type Assert<T extends true> = T;

describe("type inference", () => {
  const endpoint = createMockEndpoint();

  const app = new Fractal()
    .method("ping", (c) => c.json("pong"))
    .method("user.get", (c) => c.json({ name: "Alice", age: 30 }))
    .method("user.update", (c) => c.json({ ok: true }))
    .method("math.add", (c) => c.json(42));

  const client = createClient<typeof app>(endpoint);

  test("top-level method returns correct type", () => {
    // Compile-time: client.ping() returns Promise<string>
    type _PingResult = Assert<
      AssertType<ReturnType<typeof client.ping>, Promise<string>>
    >;
    expect(typeof client.ping).toBe("function");
  });

  test("nested method returns correct type", () => {
    type _UserGetResult = Assert<
      AssertType<
        ReturnType<typeof client.user.get>,
        Promise<{ name: string; age: number }>
      >
    >;
    type _UserUpdateResult = Assert<
      AssertType<
        ReturnType<typeof client.user.update>,
        Promise<{ ok: boolean }>
      >
    >;
    type _MathAddResult = Assert<
      AssertType<ReturnType<typeof client.math.add>, Promise<number>>
    >;
    expect(typeof client.user.get).toBe("function");
    expect(typeof client.math.add).toBe("function");
  });

  test("$notify proxy returns void", () => {
    type _NotifyPing = Assert<
      AssertType<ReturnType<typeof client.$notify.ping>, void>
    >;
    type _NotifyUserGet = Assert<
      AssertType<ReturnType<typeof client.$notify.user.get>, void>
    >;
    expect(typeof client.$notify.ping).toBe("function");
  });

  test("dispose is available", () => {
    expect(typeof client.dispose).toBe("function");
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
    type _DelayedResult = Assert<
      AssertType<
        ReturnType<typeof asyncClient.delayed>,
        Promise<{ status: "done" }>
      >
    >;
    expect(typeof asyncClient.delayed).toBe("function");
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
    type _PingResult = Assert<
      AssertType<ReturnType<typeof mwClient.ping>, Promise<string>>
    >;
    type _HelloResult = Assert<
      AssertType<ReturnType<typeof mwClient.hello>, Promise<string>>
    >;
    expect(typeof mwClient.ping).toBe("function");
  });

  // ─── TParams type inference ───

  test("TParams types c.req.params in handler", () => {
    const typedApp = new Fractal().method<{ id: string }>("user.get", (c) => {
      // Compile-time: c.req.params.id is string
      type _ParamsId = Assert<AssertType<typeof c.req.params.id, string>>;
      return c.json({ id: c.req.params.id });
    });

    const typedClient = createClient<typeof typedApp>(endpoint);
    type _Result = Assert<
      AssertType<
        ReturnType<typeof typedClient.user.get>,
        Promise<{ id: string }>
      >
    >;
    expect(typeof typedClient.user.get).toBe("function");
  });

  test("TParams with required keys makes client params required", () => {
    const typedApp = new Fractal().method<{ id: string }>("user.get", (c) =>
      c.json({ id: c.req.params.id }),
    );

    const typedClient = createClient<typeof typedApp>(endpoint);
    // Client should require params — first arg is { id: string }, not optional
    type UserGetFn = typeof typedClient.user.get;
    type FirstParam = Parameters<UserGetFn>[0];
    type _ParamsRequired = Assert<AssertType<FirstParam, { id: string }>>;
    expect(typeof typedClient.user.get).toBe("function");
  });

  test("no TParams makes client params optional", () => {
    const plainApp = new Fractal().method("ping", (c) => c.json("pong"));

    const plainClient = createClient<typeof plainApp>(endpoint);
    // Client should allow calling without params
    type PingFn = typeof plainClient.ping;
    type FirstParam = Parameters<PingFn>[0];
    type _ParamsOptional = Assert<AssertType<undefined, FirstParam>>;
    expect(typeof plainClient.ping).toBe("function");
  });

  test("mixed TParams and no-TParams methods", () => {
    const mixedApp = new Fractal()
      .method<{ id: string }>("user.get", (c) =>
        c.json({ id: c.req.params.id }),
      )
      .method("ping", (c) => c.json("pong"));

    const mixedClient = createClient<typeof mixedApp>(endpoint);

    // user.get requires params
    type UserGetFn = typeof mixedClient.user.get;
    type UserGetFirstParam = Parameters<UserGetFn>[0];
    type _UserGetRequired = Assert<
      AssertType<UserGetFirstParam, { id: string }>
    >;

    // ping has optional params
    type PingFn = typeof mixedClient.ping;
    type PingFirstParam = Parameters<PingFn>[0];
    type _PingOptional = Assert<AssertType<undefined, PingFirstParam>>;

    expect(typeof mixedClient.user.get).toBe("function");
    expect(typeof mixedClient.ping).toBe("function");
  });

  test("nested namespace with TParams", () => {
    const nsApp = new Fractal()
      .method<{ id: string }>("admin.user.get", (c) =>
        c.json({ id: c.req.params.id }),
      )
      .method("admin.user.list", (c) => c.json([]));

    const nsClient = createClient<typeof nsApp>(endpoint);

    type GetFn = typeof nsClient.admin.user.get;
    type GetFirstParam = Parameters<GetFn>[0];
    type _GetRequired = Assert<AssertType<GetFirstParam, { id: string }>>;

    type ListFn = typeof nsClient.admin.user.list;
    type ListFirstParam = Parameters<ListFn>[0];
    type _ListOptional = Assert<AssertType<undefined, ListFirstParam>>;

    expect(typeof nsClient.admin.user.get).toBe("function");
    expect(typeof nsClient.admin.user.list).toBe("function");
  });
});
