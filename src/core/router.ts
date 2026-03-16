type Handler = (...args: unknown[]) => unknown;

const RESERVED_CLIENT_PROPERTIES = new Set(["$notify", "dispose", "then"]);

function validateMethodName(method: string): void {
  if (method === "") {
    throw new Error("Invalid method name: empty string");
  }

  if (method.startsWith(".")) {
    throw new Error(`Invalid method name: leading dot in "${method}"`);
  }

  if (method.endsWith(".")) {
    throw new Error(`Invalid method name: trailing dot in "${method}"`);
  }

  if (method.includes("..")) {
    throw new Error(`Invalid method name: consecutive dots in "${method}"`);
  }

  if (method.startsWith("rpc.")) {
    throw new Error('Invalid method name: "rpc." prefix is reserved');
  }
}

function checkReservedName(method: string): void {
  const firstSegment = method.split(".")[0];
  if (firstSegment === undefined) return;
  if (RESERVED_CLIENT_PROPERTIES.has(firstSegment)) {
    throw new Error(
      `Method "${method}" conflicts with reserved client property "${firstSegment}"`,
    );
  }
}

export class Router {
  private handlers: Map<string, Handler> = new Map();

  add(method: string, handler: Handler): void {
    validateMethodName(method);
    checkReservedName(method);

    if (this.handlers.has(method)) {
      throw new Error(`Method "${method}" is already registered`);
    }

    // Check namespace conflicts in both directions
    for (const existing of this.handlers.keys()) {
      // Check if new method is a prefix of existing (at dot boundary)
      if (existing.startsWith(`${method}.`)) {
        throw new Error(
          `Method "${method}" conflicts with existing method "${existing}"`,
        );
      }
      // Check if existing method is a prefix of new (at dot boundary)
      if (method.startsWith(`${existing}.`)) {
        throw new Error(
          `Method "${method}" conflicts with existing method "${existing}"`,
        );
      }
    }

    this.handlers.set(method, handler);
  }

  find(method: string): Handler | undefined {
    return this.handlers.get(method);
  }
}
