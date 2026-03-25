describe("barrel exports", () => {
  test("main entry exports core types and classes", async () => {
    const main = await import("./index.ts");
    expect(main.Fractal).toBeDefined();
    expect(main.createContext).toBeDefined();
  });

  test("endpoint entry exports all endpoint factories", async () => {
    const ep = await import("./endpoint/index.ts");
    expect(ep.windowEndpoint).toBeDefined();
    expect(ep.workerEndpoint).toBeDefined();
    expect(ep.messagePortEndpoint).toBeDefined();
    expect(ep.serviceWorkerEndpoint).toBeDefined();
    expect(ep.onConnect).toBeDefined();
    expect(ep.extensionPortEndpoint).toBeDefined();
    expect(ep.extensionRuntimeEndpoint).toBeDefined();
    expect(ep.extensionTabEndpoint).toBeDefined();
  });

  test("adapter entry exports serve", async () => {
    const adapter = await import("./adapter/index.ts");
    expect(adapter.serve).toBeDefined();
  });

  test("client entry exports createClient and error classes", async () => {
    const client = await import("./client/index.ts");
    expect(client.createClient).toBeDefined();
    expect(client.RpcError).toBeDefined();
    expect(client.FractalError).toBeDefined();
  });
});
