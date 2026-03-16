import type { Fractal } from "./core/app.ts";

export type InferSchema<F> =
  F extends Fractal<infer S> ? S : Record<string, never>;

type Prefixes<S> = {
  [K in keyof S & string]: K extends `${infer H}.${string}` ? H : never;
}[keyof S & string];

type SubSchema<S, P extends string> = {
  [K in keyof S & string as K extends `${P}.${infer R}` ? R : never]: S[K];
};

export type ClientProxy<S extends Record<string, unknown>> = {
  [K in keyof S & string as K extends `${string}.${string}` ? never : K]: (
    params?: Record<string, unknown>,
    options?: { timeout?: number },
  ) => Promise<S[K]>;
} & {
  [P in Prefixes<S>]: ClientProxy<SubSchema<S, P>>;
};

export type NotifyProxy<S extends Record<string, unknown>> = {
  [K in keyof S & string as K extends `${string}.${string}` ? never : K]: (
    params?: Record<string, unknown>,
  ) => void;
} & {
  [P in Prefixes<S>]: NotifyProxy<SubSchema<S, P>>;
};

export type FractalClient<S extends Record<string, unknown>> =
  ClientProxy<S> & {
    $notify: NotifyProxy<S>;
    dispose(): void;
    [Symbol.dispose](): void;
  };
