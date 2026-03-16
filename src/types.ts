import type { Fractal } from "./core/app.ts";

export type InferSchema<F> =
  F extends Fractal<infer S> ? S : Record<string, never>;

type Prefixes<S> = {
  [K in keyof S & string]: K extends `${infer H}.${string}` ? H : never;
}[keyof S & string];

type SubSchema<S, P extends string> = {
  [K in keyof S & string as K extends `${P}.${infer R}` ? R : never]: S[K];
};

type LeafKeys<S> = {
  [K in keyof S & string]: K extends `${string}.${string}` ? never : K;
}[keyof S & string];

// Determine if params should be required based on whether the input type has required keys
type HasRequiredKeys<T> =
  Record<string, unknown> extends T
    ? false
    : keyof T extends never
      ? false
      : true;

type RouteEntry = { input: Record<string, unknown>; output: unknown };

export type ClientProxy<S extends Record<string, unknown>> = {
  [K in LeafKeys<S>]: S[K] extends RouteEntry
    ? HasRequiredKeys<S[K]["input"]> extends true
      ? (
          params: S[K]["input"],
          options?: { timeout?: number },
        ) => Promise<S[K]["output"]>
      : (
          params?: S[K]["input"],
          options?: { timeout?: number },
        ) => Promise<S[K]["output"]>
    : never;
} & {
  [P in Prefixes<S>]: ClientProxy<SubSchema<S, P>>;
};

export type NotifyProxy<S extends Record<string, unknown>> = {
  [K in LeafKeys<S>]: S[K] extends RouteEntry
    ? HasRequiredKeys<S[K]["input"]> extends true
      ? (params: S[K]["input"]) => void
      : (params?: S[K]["input"]) => void
    : never;
} & {
  [P in Prefixes<S>]: NotifyProxy<SubSchema<S, P>>;
};

export type FractalClient<S extends Record<string, unknown>> =
  ClientProxy<S> & {
    $notify: NotifyProxy<S>;
    dispose(): void;
    [Symbol.dispose](): void;
  };
