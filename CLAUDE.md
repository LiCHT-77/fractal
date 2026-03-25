Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bunx vitest` or `bun run test` instead of `jest` or `bun test`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`

## Testing

Use `vitest` (via `bun run test` or `bunx vitest`) to run tests. `vitest.config.ts` has `globals: true`, so no imports are needed.

```ts#index.test.ts
test("hello world", () => {
  expect(1).toBe(1);
});
```
