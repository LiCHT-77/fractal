import { Router } from "./router.ts";

describe("core/router", () => {
  let router: InstanceType<typeof Router>;

  beforeEach(() => {
    router = new Router();
  });

  // ─── Basic registration ───

  describe("method registration", () => {
    test("registers a method and retrieves its handler", () => {
      const handler = vi.fn();
      router.add("ping", handler);
      expect(router.find("ping")).toBe(handler);
    });

    test("returns undefined for unregistered method", () => {
      expect(router.find("unknown")).toBeUndefined();
    });

    test("registers multiple methods independently", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      router.add("user.get", h1);
      router.add("user.create", h2);
      expect(router.find("user.get")).toBe(h1);
      expect(router.find("user.create")).toBe(h2);
    });
  });

  // ─── Duplicate registration ───

  describe("duplicate method", () => {
    test("throws when registering the same method name twice", () => {
      router.add("ping", vi.fn());
      expect(() => router.add("ping", vi.fn())).toThrow(
        'Method "ping" is already registered',
      );
    });

    test("throws for duplicate namespaced method", () => {
      router.add("user.get", vi.fn());
      expect(() => router.add("user.get", vi.fn())).toThrow(
        'Method "user.get" is already registered',
      );
    });

    test("error message matches exact format", () => {
      router.add("ping", vi.fn());
      expect(() => router.add("ping", vi.fn())).toThrow(
        'Method "ping" is already registered',
      );
    });
  });

  // ─── Namespace conflicts ───

  describe("namespace conflicts", () => {
    test("throws when new method is prefix of existing method", () => {
      router.add("user.get", vi.fn());
      expect(() => router.add("user", vi.fn())).toThrow(
        'Method "user" conflicts with existing method "user.get"',
      );
    });

    test("throws when existing method is prefix of new method", () => {
      router.add("user", vi.fn());
      expect(() => router.add("user.get", vi.fn())).toThrow(
        'Method "user.get" conflicts with existing method "user"',
      );
    });

    test("allows methods that share prefix but not at dot boundary", () => {
      router.add("user", vi.fn());
      expect(() => router.add("username", vi.fn())).not.toThrow();
    });

    test("detects deep namespace conflicts", () => {
      router.add("admin.user.delete", vi.fn());
      expect(() => router.add("admin.user", vi.fn())).toThrow(
        'Method "admin.user" conflicts with existing method "admin.user.delete"',
      );
    });

    test("allows sibling methods in same namespace", () => {
      router.add("admin.create", vi.fn());
      expect(() => router.add("admin.delete", vi.fn())).not.toThrow();
    });

    test("error message for prefix conflict matches exact format", () => {
      router.add("user.get", vi.fn());
      expect(() => router.add("user", vi.fn())).toThrow(
        'Method "user" conflicts with existing method "user.get"',
      );
    });
  });

  // ─── Method name validation ───

  describe("method name validation", () => {
    test("rejects empty string", () => {
      expect(() => router.add("", vi.fn())).toThrow();
    });

    test("rejects leading dot", () => {
      expect(() => router.add(".user", vi.fn())).toThrow();
    });

    test("rejects trailing dot", () => {
      expect(() => router.add("user.", vi.fn())).toThrow();
    });

    test("rejects consecutive dots", () => {
      expect(() => router.add("user..get", vi.fn())).toThrow();
    });

    test("rejects rpc. prefix", () => {
      expect(() => router.add("rpc.discover", vi.fn())).toThrow();
    });

    test("allows rpc without dot (not a reserved prefix)", () => {
      expect(() => router.add("rpc", vi.fn())).not.toThrow();
    });
  });

  // ─── Reserved client property names ───

  describe("reserved client property names", () => {
    test("rejects '$notify' as method name", () => {
      expect(() => router.add("$notify", vi.fn())).toThrow(
        'Method "$notify" conflicts with reserved client property "$notify"',
      );
    });

    test("rejects 'dispose' as method name", () => {
      expect(() => router.add("dispose", vi.fn())).toThrow(
        'Method "dispose" conflicts with reserved client property "dispose"',
      );
    });

    test("rejects 'then' as method name", () => {
      expect(() => router.add("then", vi.fn())).toThrow(
        'Method "then" conflicts with reserved client property "then"',
      );
    });

    test("rejects 'then.check' (reserved first segment)", () => {
      expect(() => router.add("then.check", vi.fn())).toThrow(
        'Method "then.check" conflicts with reserved client property "then"',
      );
    });

    test("rejects '$notify.log' (reserved first segment)", () => {
      expect(() => router.add("$notify.log", vi.fn())).toThrow(
        'Method "$notify.log" conflicts with reserved client property "$notify"',
      );
    });

    test("allows method where reserved name is not first segment", () => {
      expect(() => router.add("user.then", vi.fn())).not.toThrow();
    });

    test("allows non-ASCII method names", () => {
      expect(() => router.add("ユーザー.取得", vi.fn())).not.toThrow();
    });
  });

  // ─── Case sensitivity ───

  describe("case sensitivity", () => {
    test("treats 'User.get' and 'user.get' as different methods", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      router.add("User.get", h1);
      router.add("user.get", h2);
      expect(router.find("User.get")).toBe(h1);
      expect(router.find("user.get")).toBe(h2);
    });
  });

  // ─── Special characters in segments ───

  describe("special characters in segments", () => {
    test("allows hyphens in method names", () => {
      const handler = vi.fn();
      router.add("my-method", handler);
      expect(router.find("my-method")).toBe(handler);
    });

    test("allows underscores in method names", () => {
      const handler = vi.fn();
      router.add("my_method", handler);
      expect(router.find("my_method")).toBe(handler);
    });

    test("allows emoji in method names", () => {
      const handler = vi.fn();
      router.add("🚀.launch", handler);
      expect(router.find("🚀.launch")).toBe(handler);
    });

    test("allows null character (\\0) in method names", () => {
      const handler = vi.fn();
      router.add("method\0name", handler);
      expect(router.find("method\0name")).toBe(handler);
    });

    test("allows newline (\\n) in method names", () => {
      const handler = vi.fn();
      router.add("method\nname", handler);
      expect(router.find("method\nname")).toBe(handler);
    });

    test("allows tab (\\t) in method names", () => {
      const handler = vi.fn();
      router.add("method\tname", handler);
      expect(router.find("method\tname")).toBe(handler);
    });

    test("allows whitespace in method names", () => {
      const handler = vi.fn();
      router.add("my method", handler);
      expect(router.find("my method")).toBe(handler);
    });

    test("allows emoji-only method name", () => {
      const handler = vi.fn();
      router.add("😀", handler);
      expect(router.find("😀")).toBe(handler);
    });
  });

  // ─── Deep namespace conflicts ───

  describe("deep namespace conflicts", () => {
    test("throws when 3-level method is registered then 2-level prefix attempted", () => {
      router.add("a.b.c", vi.fn());
      expect(() => router.add("a.b", vi.fn())).toThrow(
        'Method "a.b" conflicts with existing method "a.b.c"',
      );
    });

    test("throws when 2-level method is registered then 3-level extension attempted", () => {
      router.add("a.b", vi.fn());
      expect(() => router.add("a.b.c", vi.fn())).toThrow(
        'Method "a.b.c" conflicts with existing method "a.b"',
      );
    });
  });

  // ─── Non-conflicting siblings at deeper levels ───

  describe("non-conflicting siblings at deeper levels", () => {
    test("allows 'a.b.c' and 'a.b.d' to coexist", () => {
      router.add("a.b.c", vi.fn());
      expect(() => router.add("a.b.d", vi.fn())).not.toThrow();
    });

    test("allows 'a.b.c' and 'a.d' to coexist (different branch at level 2)", () => {
      router.add("a.b.c", vi.fn());
      expect(() => router.add("a.d", vi.fn())).not.toThrow();
    });
  });

  // ─── Deep namespace conflicts (4-level) ───

  describe("deep namespace conflicts (4-level)", () => {
    test("throws when 3-level method is registered then 4-level extension attempted", () => {
      router.add("a.b.c", vi.fn());
      expect(() => router.add("a.b.c.d", vi.fn())).toThrow(
        'Method "a.b.c.d" conflicts with existing method "a.b.c"',
      );
    });

    test("throws when 4-level method is registered then 3-level prefix attempted", () => {
      router.add("a.b.c.d", vi.fn());
      expect(() => router.add("a.b.c", vi.fn())).toThrow(
        'Method "a.b.c" conflicts with existing method "a.b.c.d"',
      );
    });
  });

  // ─── Dot-boundary non-conflict (both directions) ───

  describe("dot-boundary non-conflict", () => {
    test("'user' then 'username' does not conflict", () => {
      router.add("user", vi.fn());
      expect(() => router.add("username", vi.fn())).not.toThrow();
    });

    test("'username' then 'user' does not conflict", () => {
      router.add("username", vi.fn());
      expect(() => router.add("user", vi.fn())).not.toThrow();
    });

    test("'a.bc' then 'a.bcd' does not conflict (non-dot-boundary in namespaced form)", () => {
      router.add("a.bc", vi.fn());
      expect(() => router.add("a.bcd", vi.fn())).not.toThrow();
    });
  });

  // ─── Multiple siblings in same namespace ───

  describe("multiple siblings in same namespace", () => {
    test("allows many methods under the same namespace prefix", () => {
      router.add("ns.a", vi.fn());
      router.add("ns.b", vi.fn());
      router.add("ns.c", vi.fn());
      router.add("ns.d", vi.fn());
      expect(router.find("ns.a")).toBeDefined();
      expect(router.find("ns.b")).toBeDefined();
      expect(router.find("ns.c")).toBeDefined();
      expect(router.find("ns.d")).toBeDefined();
    });
  });

  // ─── Deeper reserved name nesting ───

  describe("deeper reserved name nesting", () => {
    test("rejects '$notify.log.debug' (top-level segment is $notify)", () => {
      expect(() => router.add("$notify.log.debug", vi.fn())).toThrow(
        'Method "$notify.log.debug" conflicts with reserved client property "$notify"',
      );
    });

    test("rejects 'dispose.cleanup' (top-level segment is dispose)", () => {
      expect(() => router.add("dispose.cleanup", vi.fn())).toThrow(
        'Method "dispose.cleanup" conflicts with reserved client property "dispose"',
      );
    });
  });

  // ─── Non-dot-boundary namespaced form ───

  describe("non-dot-boundary namespaced form", () => {
    test("'admin.get' and 'admin.getUser' do not conflict", () => {
      router.add("admin.get", vi.fn());
      expect(() => router.add("admin.getUser", vi.fn())).not.toThrow();
    });
  });

  // ─── Error message exact format verification ───

  describe("error message exact format verification", () => {
    test("duplicate method error uses exact format: Method \"<name>\" is already registered", () => {
      router.add("ping", vi.fn());
      expect(() => router.add("ping", vi.fn())).toThrow(
        'Method "ping" is already registered',
      );
    });

    test("namespace conflict error uses exact format: Method \"<new>\" conflicts with existing method \"<existing>\"", () => {
      router.add("user.get", vi.fn());
      expect(() => router.add("user", vi.fn())).toThrow(
        'Method "user" conflicts with existing method "user.get"',
      );
    });

    test("reserved name error uses exact format: Method \"<name>\" conflicts with reserved client property \"<reserved>\"", () => {
      expect(() => router.add("$notify", vi.fn())).toThrow(
        'Method "$notify" conflicts with reserved client property "$notify"',
      );
    });
  });

  // ─── Method name validation exact error messages ───

  describe("method name validation exact error messages", () => {
    test("empty string error message", () => {
      expect(() => router.add("", vi.fn())).toThrow(
        "Invalid method name: empty string",
      );
    });

    test("leading dot error message", () => {
      expect(() => router.add(".user", vi.fn())).toThrow(
        'Invalid method name: leading dot in ".user"',
      );
    });

    test("trailing dot error message", () => {
      expect(() => router.add("user.", vi.fn())).toThrow(
        'Invalid method name: trailing dot in "user."',
      );
    });

    test("consecutive dots error message", () => {
      expect(() => router.add("user..get", vi.fn())).toThrow(
        'Invalid method name: consecutive dots in "user..get"',
      );
    });

    test("rpc. prefix error message", () => {
      expect(() => router.add("rpc.discover", vi.fn())).toThrow(
        'Invalid method name: "rpc." prefix is reserved',
      );
    });
  });

  // ─── Method name validation edge cases ───

  describe("method name validation edge cases", () => {
    test("rejects a single dot '.'", () => {
      expect(() => router.add(".", vi.fn())).toThrow();
    });

    test("rejects multiple dots '..'", () => {
      expect(() => router.add("..", vi.fn())).toThrow();
    });

    test("rejects '...' (three dots)", () => {
      expect(() => router.add("...", vi.fn())).toThrow();
    });

    test("allows single-character method name", () => {
      const handler = vi.fn();
      router.add("x", handler);
      expect(router.find("x")).toBe(handler);
    });

    test("allows single-character segments in namespaced name", () => {
      const handler = vi.fn();
      router.add("a.b", handler);
      expect(router.find("a.b")).toBe(handler);
    });

    test("'rpc' without dot registers and is findable", () => {
      const handler = vi.fn();
      router.add("rpc", handler);
      expect(router.find("rpc")).toBe(handler);
    });

    test("allows numeric method name", () => {
      const handler = vi.fn();
      router.add("123", handler);
      expect(router.find("123")).toBe(handler);
    });

    test("allows method name starting with $", () => {
      const handler = vi.fn();
      router.add("$custom", handler);
      expect(router.find("$custom")).toBe(handler);
    });

    test("allows method name with @ sign", () => {
      const handler = vi.fn();
      router.add("user@v2", handler);
      expect(router.find("user@v2")).toBe(handler);
    });

    test("find() returns undefined for a name that shares prefix with registered method", () => {
      router.add("user.get", vi.fn());
      expect(router.find("user")).toBeUndefined();
      expect(router.find("user.gets")).toBeUndefined();
      expect(router.find("user.ge")).toBeUndefined();
    });

    test("rejects 'rpc.nested.method' (rpc. prefix applies regardless of depth)", () => {
      expect(() => router.add("rpc.nested.method", vi.fn())).toThrow(
        'Invalid method name: "rpc." prefix is reserved',
      );
    });
  });

  // ─── Wildcard characters in method names ───

  describe("wildcard characters in method names", () => {
    test("allows '*.get' as a method name (not prohibited, only discouraged)", () => {
      const handler = vi.fn();
      router.add("*.get", handler);
      expect(router.find("*.get")).toBe(handler);
    });

    test("allows 'admin.**' as a method name (not prohibited, only discouraged)", () => {
      const handler = vi.fn();
      router.add("admin.**", handler);
      expect(router.find("admin.**")).toBe(handler);
    });
  });

  // ─── JavaScript built-in property names as method names ───

  describe("JavaScript built-in property names as method names", () => {
    test("allows 'toString' as a top-level method name", () => {
      const handler = vi.fn();
      router.add("toString", handler);
      expect(router.find("toString")).toBe(handler);
    });

    test("allows 'valueOf' as a top-level method name", () => {
      const handler = vi.fn();
      router.add("valueOf", handler);
      expect(router.find("valueOf")).toBe(handler);
    });

    test("allows 'toJSON' as a top-level method name", () => {
      const handler = vi.fn();
      router.add("toJSON", handler);
      expect(router.find("toJSON")).toBe(handler);
    });

    test("allows 'constructor' as a top-level method name", () => {
      const handler = vi.fn();
      router.add("constructor", handler);
      expect(router.find("constructor")).toBe(handler);
    });

    test("allows '__proto__' as a top-level method name", () => {
      const handler = vi.fn();
      router.add("__proto__", handler);
      expect(router.find("__proto__")).toBe(handler);
    });
  });

  // ─── Validation order ───

  describe("validation order", () => {
    test("empty string is rejected before reserved name check", () => {
      expect(() => router.add("", vi.fn())).toThrow(
        "Invalid method name: empty string",
      );
    });

    test("reserved name is rejected before duplicate check", () => {
      // Register a method first so a duplicate check could theoretically fire
      router.add("other", vi.fn());
      // '$notify' is reserved — error should mention reserved, not duplicate
      expect(() => router.add("$notify", vi.fn())).toThrow(
        'Method "$notify" conflicts with reserved client property "$notify"',
      );
    });

    test("reserved name check fires even if a method with the same name could be a duplicate", () => {
      // Attempt to register 'then' twice — first attempt should fail with reserved error
      expect(() => router.add("then", vi.fn())).toThrow(
        'Method "then" conflicts with reserved client property "then"',
      );
      // Second attempt should also fail with reserved error (not duplicate)
      expect(() => router.add("then", vi.fn())).toThrow(
        'Method "then" conflicts with reserved client property "then"',
      );
    });

    test("format validation fires before reserved name check", () => {
      // '.then' has both a leading dot and a reserved first segment after the dot;
      // format validation (leading dot) should fire first
      expect(() => router.add(".then", vi.fn())).toThrow(
        'Invalid method name: leading dot in ".then"',
      );
    });

    test("format validation fires before duplicate check", () => {
      router.add("user", vi.fn());
      // 'user.' has a trailing dot AND could be a namespace conflict with 'user';
      // format validation (trailing dot) should fire first
      expect(() => router.add("user.", vi.fn())).toThrow(
        'Invalid method name: trailing dot in "user."',
      );
    });

    test("format validation fires before namespace conflict check", () => {
      router.add("user.get", vi.fn());
      // 'user..get' has consecutive dots AND is the same as an existing method;
      // format validation should fire first
      expect(() => router.add("user..get", vi.fn())).toThrow(
        'Invalid method name: consecutive dots in "user..get"',
      );
    });

    test("rpc. prefix validation fires before reserved name check", () => {
      // 'rpc.then' has both rpc. prefix and reserved name 'then' in second segment;
      // rpc. prefix check should fire first (it's part of validateMethodName)
      expect(() => router.add("rpc.then", vi.fn())).toThrow(
        'Invalid method name: "rpc." prefix is reserved',
      );
    });
  });

  // ─── Wildcard pattern matching note ───
  //
  // Wildcard pattern matching (*, **) is handled by matchPattern() in middleware.ts,
  // NOT by the Router class. The Router treats '*' and '**' as literal characters
  // in method names (see "wildcard characters in method names" tests above).
  // Pattern matching tests belong in middleware.test.ts where they already exist.

  // ─── Middleware pattern validation note ───
  //
  // Middleware pattern validation (for .use(pattern, middleware)) is handled by
  // validatePattern() in middleware.ts, NOT by the Router class. The Router only
  // validates method names via validateMethodName(). Pattern validation tests
  // belong in middleware.test.ts where they already exist.

  // ─── Failed add does not register ───

  describe("failed add does not register", () => {
    test("find() returns undefined after duplicate registration attempt", () => {
      const h1 = vi.fn();
      router.add("ping", h1);
      expect(() => router.add("ping", vi.fn())).toThrow();
      // Original handler should still be intact
      expect(router.find("ping")).toBe(h1);
    });

    test("find() returns undefined after namespace conflict rejection", () => {
      router.add("user.get", vi.fn());
      expect(() => router.add("user", vi.fn())).toThrow();
      // 'user' should not be registered
      expect(router.find("user")).toBeUndefined();
    });

    test("find() returns undefined after reserved name rejection", () => {
      expect(() => router.add("$notify", vi.fn())).toThrow();
      expect(router.find("$notify")).toBeUndefined();
    });

    test("find() returns undefined after format validation rejection", () => {
      expect(() => router.add(".invalid", vi.fn())).toThrow();
      expect(router.find(".invalid")).toBeUndefined();
    });

    test("find() returns undefined after rpc. prefix rejection", () => {
      expect(() => router.add("rpc.discover", vi.fn())).toThrow();
      expect(router.find("rpc.discover")).toBeUndefined();
    });
  });

  // ─── Bulk registration and collision detection ───

  describe("bulk registration (100+ methods)", () => {
    test("registers 100+ methods and detects collision correctly", () => {
      // Register 150 methods across various namespaces
      for (let i = 0; i < 150; i++) {
        router.add(`ns${Math.floor(i / 10)}.method${i}`, vi.fn());
      }

      // All 150 methods should be findable
      for (let i = 0; i < 150; i++) {
        expect(router.find(`ns${Math.floor(i / 10)}.method${i}`)).toBeDefined();
      }

      // Duplicate detection still works after 150 registrations
      expect(() => router.add("ns0.method0", vi.fn())).toThrow(
        'Method "ns0.method0" is already registered',
      );

      // Namespace conflict detection still works after 150 registrations
      expect(() => router.add("ns0", vi.fn())).toThrow(/conflicts with existing method/);

      // New unique method can still be registered
      expect(() => router.add("ns99.method999", vi.fn())).not.toThrow();
    });
  });

  // ─── Wildcard characters as literal method names ───

  describe("wildcard characters as literal method names", () => {
    test("registers and finds '*' as a literal method name", () => {
      const handler = vi.fn();
      router.add("*", handler);
      expect(router.find("*")).toBe(handler);
    });

    test("registers and finds '**' as a literal method name", () => {
      const handler = vi.fn();
      router.add("**", handler);
      expect(router.find("**")).toBe(handler);
    });

    test("'*' and '**' are independent methods", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      router.add("*", h1);
      router.add("**", h2);
      expect(router.find("*")).toBe(h1);
      expect(router.find("**")).toBe(h2);
    });

    test("'*' does not match arbitrary single-segment names via find()", () => {
      router.add("*", vi.fn());
      // find() is exact match, not pattern matching
      expect(router.find("ping")).toBeUndefined();
      expect(router.find("hello")).toBeUndefined();
    });

    test("'**' does not match arbitrary multi-segment names via find()", () => {
      router.add("**", vi.fn());
      expect(router.find("user.get")).toBeUndefined();
      expect(router.find("a.b.c")).toBeUndefined();
    });

    test("'ns.*' registered as literal does not match 'ns.get' via find()", () => {
      router.add("ns.*", vi.fn());
      expect(router.find("ns.get")).toBeUndefined();
      expect(router.find("ns.*")).toBeDefined();
    });

    test("namespace conflict applies to wildcard-containing names", () => {
      router.add("*", vi.fn());
      // '*' is a registered method; '*.child' would make '*' a namespace prefix
      expect(() => router.add("*.child", vi.fn())).toThrow(
        'Method "*.child" conflicts with existing method "*"',
      );
    });
  });

  // ─── 3+ level deep namespace conflicts ───

  describe("3+ level deep namespace conflicts", () => {
    test("'a.b.c' registered, then 'a.b' conflicts", () => {
      router.add("a.b.c", vi.fn());
      expect(() => router.add("a.b", vi.fn())).toThrow(
        'Method "a.b" conflicts with existing method "a.b.c"',
      );
    });

    test("'a.b.c' registered, then 'a' conflicts", () => {
      router.add("a.b.c", vi.fn());
      expect(() => router.add("a", vi.fn())).toThrow(
        'Method "a" conflicts with existing method "a.b.c"',
      );
    });

    test("'a' registered, then 'a.b.c' conflicts", () => {
      router.add("a", vi.fn());
      expect(() => router.add("a.b.c", vi.fn())).toThrow(
        'Method "a.b.c" conflicts with existing method "a"',
      );
    });

    test("'a.b.c.d.e' registered, then 'a.b' conflicts", () => {
      router.add("a.b.c.d.e", vi.fn());
      expect(() => router.add("a.b", vi.fn())).toThrow(
        'Method "a.b" conflicts with existing method "a.b.c.d.e"',
      );
    });

    test("'a.b' registered, then 'a.b.c.d.e' conflicts", () => {
      router.add("a.b", vi.fn());
      expect(() => router.add("a.b.c.d.e", vi.fn())).toThrow(
        'Method "a.b.c.d.e" conflicts with existing method "a.b"',
      );
    });

    test("siblings at level 3 do not conflict", () => {
      router.add("a.b.c", vi.fn());
      expect(() => router.add("a.b.d", vi.fn())).not.toThrow();
      expect(() => router.add("a.b.e", vi.fn())).not.toThrow();
    });
  });

  // ─── Multiple Router instance independence ───

  describe("multiple Router instance independence", () => {
    test("registering on one router does not affect another", () => {
      const router1 = new Router();
      const router2 = new Router();

      const h1 = vi.fn();
      router1.add("ping", h1);

      // router2 should not have 'ping'
      expect(router2.find("ping")).toBeUndefined();
    });

    test("both routers can register the same method name independently", () => {
      const router1 = new Router();
      const router2 = new Router();

      const h1 = vi.fn();
      const h2 = vi.fn();
      router1.add("user.get", h1);
      router2.add("user.get", h2);

      expect(router1.find("user.get")).toBe(h1);
      expect(router2.find("user.get")).toBe(h2);
      expect(router1.find("user.get")).not.toBe(router2.find("user.get"));
    });

    test("namespace conflict in one router does not prevent registration in another", () => {
      const router1 = new Router();
      const router2 = new Router();

      router1.add("user.get", vi.fn());
      // 'user' conflicts in router1 but should be fine in router2
      expect(() => router1.add("user", vi.fn())).toThrow();
      expect(() => router2.add("user", vi.fn())).not.toThrow();
    });

    test("duplicate detection is isolated per instance", () => {
      const router1 = new Router();
      const router2 = new Router();

      router1.add("ping", vi.fn());
      // 'ping' is duplicate in router1 but not in router2
      expect(() => router1.add("ping", vi.fn())).toThrow();
      expect(() => router2.add("ping", vi.fn())).not.toThrow();
    });
  });

  // ─── find() return type confirmation ───

  describe("find() return type confirmation", () => {
    test("find() returns the exact handler function for a registered method", () => {
      const handler = () => "result";
      router.add("test.method", handler);
      const found = router.find("test.method");
      expect(found).toBe(handler);
      expect(typeof found).toBe("function");
    });

    test("find() returns undefined for an unregistered method", () => {
      const result = router.find("nonexistent");
      expect(result).toBeUndefined();
      expect(result).toBe(undefined);
    });

    test("find() returns undefined for a namespace prefix, not the handler", () => {
      router.add("user.get", vi.fn());
      const result = router.find("user");
      expect(result).toBeUndefined();
    });

    test("find() returns undefined for a partial match of a registered method", () => {
      router.add("user.get", vi.fn());
      expect(router.find("user.g")).toBeUndefined();
      expect(router.find("user.gets")).toBeUndefined();
      expect(router.find("user.get.extra")).toBeUndefined();
    });

    test("find() returns different handler references for different methods", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      router.add("method.a", h1);
      router.add("method.b", h2);
      expect(router.find("method.a")).toBe(h1);
      expect(router.find("method.b")).toBe(h2);
      expect(router.find("method.a")).not.toBe(router.find("method.b"));
    });

    test("find() result is callable as a function", () => {
      const handler = vi.fn().mockReturnValue(42);
      router.add("callable", handler);
      const found = router.find("callable");
      expect(found).toBeDefined();
      const result = found!();
      expect(result).toBe(42);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // ─── Namespace conflict does not corrupt existing routes ───

  describe("namespace conflict does not corrupt existing routes", () => {
    test("existing handler remains accessible after failed namespace conflict add", () => {
      const h1 = vi.fn();
      router.add("user.get", h1);
      expect(() => router.add("user", vi.fn())).toThrow();
      // Existing route should be unaffected
      expect(router.find("user.get")).toBe(h1);
    });

    test("all existing handlers remain after failed add in populated router", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const h3 = vi.fn();
      router.add("user.get", h1);
      router.add("user.create", h2);
      router.add("admin.delete", h3);

      // Try conflicting adds
      expect(() => router.add("user", vi.fn())).toThrow();
      expect(() => router.add("admin", vi.fn())).toThrow();

      // All original routes should be intact
      expect(router.find("user.get")).toBe(h1);
      expect(router.find("user.create")).toBe(h2);
      expect(router.find("admin.delete")).toBe(h3);
    });
  });
});
