# Fractal 外部設計仕様書

## 1. 概要

### 1.1 本ドキュメントの目的

本ドキュメントは、Fractal フレームワークの公開 API 仕様を定義する外部設計仕様書である。フレームワーク利用者が Fractal を導入・利用する際のリファレンスとして機能する。

### 1.2 フレームワーク概要

Fractal は、ブラウザ内部の messaging 機構を統一的に扱うための JSON-RPC 2.0 ベース RPC フレームワークである。

対象 transport:

- Window / iframe 間通信 (`postMessage`)
- MessagePort / MessageChannel
- Dedicated Worker
- SharedWorker
- Service Worker

### 1.3 対象ユーザ

- ブラウザ内で iframe・Worker 間の通信を行うフロントエンドアプリケーション開発者
- 型安全な RPC API を構築したい TypeScript ユーザ

---

## 2. 公開 API 仕様

### 2.1 App クラス

App はフレームワークの中心となるクラスであり、route 登録・middleware 登録・リクエスト dispatch を担う。

#### インポート

```ts
import { Fractal } from "fractal";
```

#### コンストラクタ

```ts
const app = new Fractal();
```

#### メソッド

##### `app.method<TParams>(name, handler)`

JSON-RPC method を登録し、route 型情報が追加された新しい App インスタンスを返す（ビルダーパターン）。メソッドチェーンにより `typeof app` から全 route の input/output 型が推論可能になる。

> **注意:** 戻り値のインスタンスは内部の route registry を元のインスタンスと共有する。「新しいインスタンス」は型パラメータの蓄積のためであり、ランタイムの route 登録は共有状態である。チェーン利用（`new Fractal().method(...).method(...)`）を想定しており、途中のインスタンスを分岐して別々に route を登録する使い方はサポートしない。

型パラメータ `TParams` で handler が受け取る `c.req.params` の型を指定する。output 型は handler 内の `c.json()` の引数から自動推論される。ランタイムバリデーションは行わないため、必要な場合は middleware で別途実装する。

> **注意:** handler は必ず `c.json()` または `c.error()` の戻り値を return すること。型定義により TypeScript コンパイラがこれを強制する。handler が有効な `JsonRpcResponse` を返さなかった場合（`undefined` を返した場合等）、フレームワークは `-32603 Internal error` を返す。

同一の method 名を複数回登録した場合は `.method()` 呼び出し時に即座にランタイムエラー（`Error: Method "<name>" is already registered`）が throw される。

また、既存の method 名と namespace が衝突する登録も `.method()` 呼び出し時に即座にランタイムエラーとなる。具体的には、既に登録済みの method 名が新しい method 名の namespace 接頭辞（ドット区切りでの祖先）となる場合（またはその逆）にエラーが発生する。例えば `"user"` が登録済みの状態で `"user.get"` を登録しようとした場合、`Error: Method "user.get" conflicts with existing method "user"` が発生する。これはクライアント側で `client.user` が関数とオブジェクトの両方として機能する必要が生じることを防ぐためである。なお、`"user"` と `"username"` のようにドット境界をまたがない文字列一致は衝突とはみなされない。

| 型パラメータ | 制約 | 説明 |
|---|---|---|
| `TParams` | `extends Record<string, unknown>` | `c.req.params` の型。省略時は `Record<string, unknown>`（クライアント側で引数オプショナルになる） |

| パラメータ | 型 | 説明 |
|---|---|---|
| `name` | `string` | method 名（namespace 形式推奨: `"user.get"`）。以下の制約に違反した場合はランタイムエラーが throw される |

method 名の制約:

- 空文字列は不可
- 先頭・末尾のドット（`.user`、`user.`）は不可
- 連続するドット（`user..get`）は不可
- `rpc.` で始まる名前は不可（JSON-RPC 2.0 仕様によるプロトコル予約）
- トップレベルセグメントがクライアント予約名と衝突する名前は不可

各セグメントの文字種は制限しない（非 ASCII 文字やハイフン等も使用可能）。ただし、セグメントとして `*` や `**` を使用した場合、`.use()` の middleware パターンでワイルドカードと区別できなくなるため、method 名への使用は避けること。

クライアント予約名: `$notify`、`dispose`、`then`

method 名自体またはその先頭セグメント（最初のドットより前の部分）が予約名と一致する場合、`.method()` 呼び出し時にランタイムエラーが throw される。例えば `"then"` や `"then.check"` を登録しようとした場合、`Error: Method "then" conflicts with reserved client property "then"` が発生する。これはクライアント Proxy 上でフレームワークの制御用プロパティと RPC メソッド呼び出しが衝突することを防ぐためである。特に `then` は JavaScript の `await` が対象オブジェクトの `then` プロパティを参照する仕様上、登録を許可すると `await client` 等で意図しない動作が発生する。

> **推奨:** `toString`・`valueOf`・`toJSON` 等の JavaScript 組み込みプロパティ名は、トップレベルセグメントとしての使用を避けること。これらは JavaScript ランタイムが型変換やシリアライズ時に暗黙的にアクセスするため、クライアント Proxy 上で意図しない RPC 呼び出しが発生する可能性がある。クライアント Proxy はこれらのプロパティに対してネイティブの動作を返し、RPC 呼び出しとしては扱わない。Symbol プロパティ（`Symbol.toPrimitive`・`Symbol.iterator`・`Symbol.toStringTag` 等）は一律で RPC 呼び出しとして扱わず、`undefined` を返す。`constructor`・`__proto__` 等のプロトタイプ関連プロパティも同様にネイティブの動作を返す。
| `handler` | `(c: Context<TParams>) => JsonRpcResponse \| Promise<JsonRpcResponse>` | リクエストハンドラ |

| 戻り値 | 型 | 説明 |
|---|---|---|
| app | `Fractal` | route 型情報が追加された新しい App インスタンス |

```ts
const app = new Fractal()
  .method<{ id: string }>("user.get", (c) => {
    const { id } = c.req.params; // id: string
    return c.json({ id, name: "Alice" }); // output 型は { id: string; name: string } と推論
  })
  .method<{ name: string }>("user.create", (c) => {
    const { name } = c.req.params; // name: string
    return c.json({ success: true }); // output 型は { success: boolean } と推論
  });
```

##### `app.use(middleware)`

グローバル middleware を登録し、新しい App インスタンスを返す（ビルダーパターン）。

> **注意:** `.method()` と同様に、戻り値のインスタンスは内部の middleware registry を元のインスタンスと共有する。「新しいインスタンス」は型パラメータの蓄積のためであり、ランタイムの middleware 登録は共有状態である。

| パラメータ | 型 | 説明 |
|---|---|---|
| `middleware` | `MiddlewareHandler` | middleware 関数 |

```ts
const app = new Fractal()
  .use(async (c, next) => {
    console.log(`[${c.req.method}] received`);
    await next();
  })
  .method("ping", (c) => c.json("pong"));
```

##### `app.use(name, middleware)`

特定 method に対する middleware を登録し、新しい App インスタンスを返す（ビルダーパターン）。

| パラメータ | 型 | 説明 |
|---|---|---|
| `name` | `string` | 対象 method 名パターン（ワイルドカード対応）。以下の制約に違反した場合はランタイムエラーが throw される |
| `middleware` | `MiddlewareHandler` | middleware 関数 |

パターン文字列には method 名と同じ構造的制約および予約名制約が適用される:

- 空文字列は不可
- 先頭・末尾のドット（`.admin`、`admin.`）は不可
- 連続するドット（`admin..get`）は不可
- `rpc.` で始まるパターンは不可（該当する method は登録できないため、middleware が到達不能になることを防止する）
- トップレベルセグメントがクライアント予約名（`$notify`、`dispose`、`then`）と一致する場合は不可（同上）

各セグメントには通常の文字列に加え、ワイルドカード `*` および `**` を使用できる。セグメント全体が `*` または `**` である場合のみワイルドカードとして扱われる。`admin*` のように他の文字を含むセグメントはワイルドカードとして機能せず、リテラル文字列 `"admin*"` という method 名にのみマッチする。

- `*` は `.` 区切りの **1 セグメントのみ** にマッチする
- `**` は `.` 区切りの **1 セグメント以上** にマッチする（0 セグメントにはマッチしない。例: `admin.**` は `admin.delete` にマッチするが `admin` 単体にはマッチしない）

1つのパターン内で `*` と `**` を複数回使用できる。各セグメントは独立にマッチングされる。

| パターン | マッチする | マッチしない |
|---|---|---|
| `*` | `ping`, `hello` | `user.get`, `admin.user.delete` |
| `**` | `ping`, `user.get`, `admin.user.delete` | （全 method にマッチ） |
| `admin.*` | `admin.delete`, `admin.list` | `admin.user.delete` |
| `admin.**` | `admin.delete`, `admin.user.delete`, `admin.user.role.assign` | `admin` |
| `*.get` | `user.get`, `item.get` | `get`, `user.detail.get` |
| `**.get` | `user.get`, `user.detail.get` | `get`, `ping` |
| `*.*` | `user.get`, `item.delete` | `ping`, `admin.user.delete` |
| `**.*` | `user.get`, `admin.user.delete` | `ping` |

`**` は全 method にマッチするため、`.use("**", middleware)` は `.use(middleware)` と等価である。

##### `app.dispatch(request)`

JSON-RPC Request を受け取り、対応する handler を実行して Response を返す。主にテストやカスタム adapter の実装で使用する。通常の利用では `serve()` を使用すること。`dispatch()` 経由の場合、`c.req.raw` は `undefined` となる。

| パラメータ | 型 | 説明 |
|---|---|---|
| `request` | `JsonRpcRequest` | JSON-RPC 2.0 形式のリクエスト |

| 戻り値 | 型 | 説明 |
|---|---|---|
| response | `Promise<JsonRpcResponse \| void>` | Notification 時は `void` |

`dispatch()` は最初に Notification 判定（`"id" in request`）を行い、次に `params` の正規化とバリデーションを実行する。`params` が省略されている場合、または `undefined` の場合は `{}` に正規化される。`params` がそれ以外の非 plain object である場合（配列・`null`・プリミティブ値）、通常リクエストでは `-32600 Invalid Request` エラーレスポンスを返す。Notification の場合はレスポンスを返さず `void` を返す（JSON-RPC 2.0 仕様に準拠）。不正な `params` の情報は `console.error` で出力される。

`params` バリデーション通過後、`method` に対応する handler を route registry から検索する。該当する method が未登録の場合は `-32601 Method not found` エラーレスポンスを返す（Notification の場合は `void`）。

Notification（`id` なしの Request）の場合も handler・middleware は実行されるが、戻り値は `void`（`undefined`）となる。`serve()` は戻り値が `void` の場合、`endpoint.send` による返信を行わない。

---

### 2.2 Endpoint

Endpoint は各 transport を抽象化したインターフェースである。

#### Endpoint インターフェース

```ts
interface Endpoint {
  send(message: unknown): void;
  onMessage(handler: (message: unknown, event: MessageEvent) => void): () => void;
}
```

| メソッド | 説明 |
|---|---|
| `send(message)` | メッセージを送信する |
| `onMessage(handler)` | メッセージ受信時のハンドラを登録し、解除関数を返す。`jsonrpc: "2.0"` を持たないメッセージは自動的に無視される |

`onMessage` は呼び出すたびにハンドラが追加登録される（`addEventListener` と同じセマンティクス）。戻り値の関数を呼ぶと、そのハンドラのみが解除される。`serve()` や `createClient()` は内部でこの解除関数を保持し、`dispose()` 時に呼び出す。

`send()` に渡す値は[構造化クローンアルゴリズム](https://developer.mozilla.org/ja/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)でシリアライズされる。関数、DOM ノード、Symbol 等はシリアライズ不可のためメッセージに含めてはならない。

#### Window Endpoint

iframe・popup・parent window との通信に使用する。

```ts
import { windowEndpoint } from "fractal/endpoint";

const endpoint = windowEndpoint(targetWindow, {
  origin: "https://example.com",
});
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `target` | `Window` | 通信先の Window オブジェクト |
| `options.origin` | `string` | 通信相手の origin（`"*"` で全許可） |

`origin` は送信と受信の両方に使用される。送信時は `postMessage` の `targetOrigin` として、受信時は `event.origin` との照合に使用され、不一致のメッセージは無視される。`"*"` を指定した場合は origin の受信側フィルタリングは無効になる。加えて、受信時は `event.source` が `target` と一致するかも検証され、不一致のメッセージは無視される。`event.source` のチェックは `origin` の設定に関わらず常に行われる。これにより、同一 origin の複数 iframe が存在する環境でも、意図しない Window からのメッセージが処理されることはない。

> **セキュリティ:** 本番環境では必ず具体的な origin を指定すること。`"*"` は開発用途に限定すべきである。

#### MessagePort Endpoint

MessageChannel / MessagePort を利用した通信に使用する。

```ts
import { messagePortEndpoint } from "fractal/endpoint";

const channel = new MessageChannel();
const endpoint = messagePortEndpoint(channel.port1);
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `port` | `MessagePort` | 通信に使用する MessagePort |

`messagePortEndpoint` は `onMessage()` でハンドラが登録された際に内部で `port.start()` を呼び出す。利用者が明示的に `port.start()` を呼ぶ必要はない。

#### Worker Endpoint

Dedicated Worker との通信に使用する。

```ts
import { workerEndpoint } from "fractal/endpoint";

// メインスレッド側
const worker = new Worker("./worker.ts");
const endpoint = workerEndpoint(worker);

// Worker 側
const endpoint = workerEndpoint(self);
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `target` | `Worker \| DedicatedWorkerGlobalScope` | Worker またはグローバルスコープ |

#### SharedWorker Endpoint

SharedWorker との通信には `messagePortEndpoint` を使用する。SharedWorker の `port` は `MessagePort` であるため、専用 API は不要。

**クライアント側:**

```ts
import { messagePortEndpoint } from "fractal/endpoint";

const worker = new SharedWorker("./shared-worker.ts");
const endpoint = messagePortEndpoint(worker.port);
```

**SharedWorker 側:**

```ts
import { messagePortEndpoint } from "fractal/endpoint";

self.addEventListener("connect", (event) => {
  const port = event.ports[0];
  const endpoint = messagePortEndpoint(port);
  serve(app, endpoint);
});
```

#### ServiceWorker Endpoint

Service Worker との通信に使用する。内部で `MessageChannel` を作成し、`port2` を Service Worker に transfer することで双方向通信を確立する。

**クライアント側:**

```ts
import { serviceWorkerEndpoint } from "fractal/endpoint";

const endpoint = await serviceWorkerEndpoint(navigator.serviceWorker.controller, {
  timeout: 5000, // ハンドシェイクタイムアウト（ミリ秒）
});
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `controller` | `ServiceWorker` | Service Worker controller。`null` が渡された場合は `Error: Service Worker controller is not available` を throw する |
| `options.timeout` | `number` | ハンドシェイクのタイムアウト（ミリ秒）。省略時はタイムアウトなし。`0` は即座にタイムアウトとして扱われる。`Infinity` を指定するとタイムアウトなしとなる。負の値・`NaN` が渡された場合は `TypeError` が throw される |

| 戻り値 | 型 | 説明 |
|---|---|---|
| endpoint | `Promise<Endpoint>` | ハンドシェイク完了後に resolve される |

タイムアウトが設定されている場合、指定時間内にハンドシェイクが完了しなければ `FractalError`（`code: "TIMEOUT"`）で Promise が reject される。Service Worker が `onConnect` を登録していない場合やクラッシュした場合に備え、`timeout` の設定を推奨する。

**Service Worker 側:**

```ts
import { onConnect } from "fractal/endpoint";

onConnect((endpoint) => {
  serve(app, endpoint);
});
```

`onConnect` は Service Worker 内で使用し、クライアントから transfer された `MessagePort` を受け取って Endpoint を生成するコールバックを登録する。接続ごとにコールバックが呼ばれるため、複数クライアントに対応できる。`onConnect` を複数回呼び出した場合、後から登録したコールバックが前のものを上書きする。

| パラメータ | 型 | 説明 |
|---|---|---|
| `callback` | `(endpoint: Endpoint) => void` | 接続確立時のコールバック |

> **注意:** 通信は `FetchEvent` ではなく `MessageEvent` ベースである。`MessageChannel` 確立後は実質的に `messagePortEndpoint` と同じ仕組みで動作する。

> **注意:** ハンドシェイクメッセージは `jsonrpc: "2.0"` フィールドを持たない独自フォーマットである。そのため、同一 Service Worker 上で他のライブラリやアプリケーションコードが `postMessage` を使用していても干渉しない。ハンドシェイクの具体的なメッセージフォーマットは内部実装の詳細であり、外部から依存すべきではない。

---

### 2.3 Adapter

Adapter は Endpoint と App (Core) を接続するグルーコードである。

#### `serve(app, endpoint)`

Endpoint からのメッセージを受信し、App に dispatch して結果を返信する。

```ts
import { serve } from "fractal/adapter";
import { messagePortEndpoint } from "fractal/endpoint";

const app = new Fractal()
  .method("ping", (c) => c.json("pong"));

const endpoint = messagePortEndpoint(port);
const server = serve(app, endpoint);

// 手動でリスナーを解除する
server.dispose();

// using 構文でも利用可能（スコープ終了時に自動 dispose）
using server = serve(app, endpoint);
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `app` | `Fractal` | route 登録済みの App インスタンス |
| `endpoint` | `Endpoint` | メッセージを受信する Endpoint |

| 戻り値 | 型 | 説明 |
|---|---|---|
| `server` | `Disposable & { dispose(): void }` | `dispose()` または `using` 構文で `onMessage` リスナーを解除する。`dispose()` は新規メッセージの受信を停止するが、既に実行中の非同期 handler はキャンセルされず完了まで実行される。handler 完了後のレスポンス送信も試みられ、`send()` が例外を throw した場合は `console.error` で出力される。`dispose()` は冪等であり、複数回呼び出しても安全である（2回目以降は no-op） |

処理フロー:

1. `endpoint.onMessage` でメッセージ受信（`jsonrpc: "2.0"` を持たないメッセージは Endpoint が除外済み）
2. `result` または `error` フィールドを持つメッセージは JSON-RPC Response とみなし無視する
3. `method` フィールドが存在しない、または `string` 型でない場合は `-32600 Invalid Request` エラーレスポンスを返す（`id` が存在する場合のみ。`id` がない場合は Notification 扱いとなりレスポンスを返さず、不正なメッセージの情報を `console.error` で出力する）
4. `app.dispatch` で handler を実行（`params` の正規化・バリデーションは `dispatch()` 内で行われる）
5. JSON-RPC Response にエンコード
6. `endpoint.send` で返信。`send()` が例外を throw した場合（Worker の terminate、MessagePort の close 等）、例外は `console.error` で出力し、リスナーは継続する

> **注意:** `serve()` はメッセージ受信ごとに `dispatch()` を呼び出し、非同期 handler の完了を待たずに次のメッセージを処理する。そのため、同一 method に対する複数リクエストが並行実行される可能性がある。handler 内で共有状態を操作する場合は、利用者側で排他制御を行うこと。

> **注意:** handler が構造化クローン不可な値（関数、DOM ノード、Symbol 等）を `c.json()` で返した場合、`endpoint.send()` が例外を throw しクライアントにレスポンスが届かない。クライアント側ではタイムアウトまで pending のままとなるため、`c.json()` に渡す値が構造化クローン可能であることを確認すること。

> **注意:** 同一 Endpoint に対して `serve()` や `createClient()` を複数回呼び出すことはサポートしない。`onMessage` はハンドラを追加登録するため、重複呼び出しにより1つのリクエストに対して複数のレスポンスが送信される等の予期しない動作が発生する。双方向 RPC が必要な場合は、それぞれ別の Endpoint を使用すること。Dedicated Worker のように通信チャネルが1つの場合は、`MessageChannel` を作成して port を transfer することで別の Endpoint を確保できる。再登録が必要な場合は、先に `dispose()` を呼び出してから再度 `serve()` / `createClient()` を呼ぶこと。

---

### 2.4 Client

Client は route 定義から型安全な RPC クライアントを生成する。

#### `createClient<T>(endpoint, options?)`

```ts
import { createClient, RpcError, FractalError } from "fractal/client";

const client = createClient<typeof app>(endpoint, {
  defaultTimeout: 30000, // 全リクエストに適用されるデフォルトタイムアウト（ミリ秒）
});

// 手動でリスナーを解除する
client.dispose();

// using 構文でも利用可能
using client = createClient<typeof app>(endpoint);
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `endpoint` | `Endpoint` | 通信先の Endpoint |
| `options.defaultTimeout` | `number` | 全リクエストに適用されるデフォルトタイムアウト（ミリ秒）。個別呼び出しの `timeout` で上書き可能。省略時はタイムアウトなし。`0` は即座にタイムアウトとして扱われる。`Infinity` を指定するとタイムアウトなしとなる（省略時と同じ）。負の値・`NaN` が渡された場合は `TypeError` が throw される |

| 型パラメータ | 説明 |
|---|---|
| `T` | App インスタンスの型。route 定義から input/output 型が推論される |

`createClient` が返すオブジェクトは `Disposable` を実装し、`dispose()` メソッドを持つ。呼び出すと内部の `onMessage` リスナーが解除され、保留中の Promise はすべて `FractalError`（`code: "DISPOSED"`）で reject される。保留中のタイムアウトタイマーもクリアされる。`using` 構文でスコープ終了時に自動的に dispose することも可能。`dispose()` は冪等であり、複数回呼び出しても安全である（2回目以降は no-op）。

`dispose()` 後にメソッド呼び出しや `$notify` を行った場合は `FractalError`（`code: "DISPOSED"`）が throw される。

#### 型定義の共有

`typeof app` をクライアント側で参照するには、サーバー側のルート定義を型としてエクスポートする。

```ts
// worker.ts（サーバー側）
const app = new Fractal()
  .method<{ id: string }>("user.get", (c) => {
    const { id } = c.req.params;
    return c.json({ id, name: "Alice" });
  });

export type AppType = typeof app;
```

```ts
// main.ts（クライアント側）
import type { AppType } from "./worker";
import { createClient } from "fractal/client";

const client = createClient<AppType>(endpoint);
```

`import type` を使用するため、ランタイムの依存は発生しない。

#### クライアント呼び出し

method 名の namespace（`.` 区切り）がオブジェクトの階層に展開される。namespace の深さに制限はない。

```ts
// method "ping" → client.ping()
const pong = await client.ping();

// method "user.get" → client.user.get()
const result = await client.user.get({ id: "123" });

// method "session.login" → client.session.login()
await client.session.login({ token: "abc" });

// method "admin.user.delete" → client.admin.user.delete()
await client.admin.user.delete({ id: "456" });
```

クライアント側の引数は、サーバー側の `TParams` 指定に応じて必須/オプショナルが切り替わる（Hono の `hc` と同じ設計）。`TParams` に必須キーが存在する場合は引数必須、未指定または空の場合は引数オプショナルとなる。

```ts
// TParams 未指定 → 引数オプショナル
await client.ping()
await client.ping({})

// TParams 指定 → 引数必須
await client.user.get({ id: "123" })
await client.user.get() // ← 型エラー
```

受信メッセージのフィルタリング: `result` または `error` フィールドを持たないメッセージ（JSON-RPC Request 等）は無視される。`result` または `error` を持つメッセージのみ JSON-RPC Response として処理される。`result` と `error` の両方を持つメッセージ（JSON-RPC 2.0 仕様違反）を受信した場合は `error` を優先し、`RpcError` で reject する。

各メソッド呼び出しは内部で以下を行う:

1. JSON-RPC Request を生成（id は `1` から始まるインクリメンタルな整数で自動採番）
2. Endpoint 経由で送信。`send()` が例外を throw した場合、pending map からエントリを削除し、Promise を即座にその例外で reject する
3. 対応する Response を受信して result を返却。pending map に該当エントリがない id のレスポンス（タイムアウト後の遅延レスポンス等）は無視される

pending map からエントリが削除される際（タイムアウト発火・`send()` 失敗・`dispose()` 等）、該当エントリに紐づくタイムアウトタイマーも必ずクリアされる。

id のスコープはクライアントインスタンスローカルである。サーバー側は複数クライアント間での id の一意性を仮定してはならない。

#### Notification 送信

`client.$notify` を使用すると、`id` なしの JSON-RPC Notification を送信できる。Notification は fire-and-forget であり、サーバーからの Response を待たない。

```ts
// method "log.info" → client.$notify.log.info()
client.$notify.log.info({ message: "hello" });
```

`$notify` 以下の namespace 展開は通常の呼び出しと同じルールに従う。戻り値は `void` である。`$notify` は内部で `endpoint.send()` を呼び出す。`send()` が例外を throw した場合、その例外は呼び出し元にそのまま伝播する。

#### タイムアウト

```ts
const result = await client.user.get({ id: "123" }, { timeout: 5000 });
```

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `timeout` | `number` | `defaultTimeout` の値（未設定時はなし） | タイムアウト（ミリ秒）。`createClient` の `defaultTimeout` より優先される。`0` は即座にタイムアウトとして扱われる。`Infinity` を指定すると `defaultTimeout` の設定に関わらずタイムアウトなしとなる。負の値・`NaN` が渡された場合は `TypeError` が throw される |

タイムアウト発生時は `FractalError`（`code: "TIMEOUT"`）で Promise が reject される。

> **注意:** タイムアウトが設定されていない場合、サーバが応答しなければ pending Promise は解放されない。Worker のクラッシュ等でレスポンスが返らなくなるケースに備え、`defaultTimeout` の設定を推奨する。

---

## 3. 型定義

### 3.1 JSON-RPC 型

#### JsonRpcRequest

```ts
interface JsonRpcRequest<TParams extends Record<string, unknown> = Record<string, unknown>> {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
  id?: string | number | null;
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `jsonrpc` | `"2.0"` | 必須 | プロトコルバージョン |
| `method` | `string` | 必須 | 呼び出す method 名 |
| `params` | `Record<string, unknown>` | 任意 | method に渡すパラメータ（object のみ。by-position の配列には非対応） |
| `id` | `string \| number \| null` | 任意 | リクエスト ID。省略時は notification |

#### JsonRpcResponse (Success)

```ts
interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  result: unknown;
  id: string | number | null;
}
```

#### JsonRpcResponse (Error)

```ts
interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  error: JsonRpcError;
  id: string | number | null;
}
```

#### JsonRpcError

```ts
interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `code` | `number` | エラーコード |
| `message` | `string` | エラーメッセージ |
| `data` | `unknown` | 追加情報（任意） |

#### JsonRpcResponse

```ts
type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;
```

#### FractalError

クライアントローカルで発生するエラー。JSON-RPC のエラーコード体系とは別系統である。

```ts
class FractalError extends Error {
  code: "DISPOSED" | "TIMEOUT";
}
```

| `code` | 発生条件 | 説明 |
|---|---|---|
| `"DISPOSED"` | `client.dispose()` 呼び出し時 | 保留中の全 Promise が reject される |
| `"TIMEOUT"` | タイムアウト超過時 | 該当リクエストの Promise が reject される |

#### RpcError

サーバーが JSON-RPC error response を返した場合にクライアントの Promise を reject するエラー。JSON-RPC のエラーコード体系に対応する。

```ts
class RpcError extends Error {
  code: number;
  data?: unknown;
}
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `message` | `string` | サーバーが返したエラーメッセージ |
| `code` | `number` | JSON-RPC エラーコード（`-32601` 等） |
| `data` | `unknown` | サーバーが付与した追加情報（任意） |

```ts
try {
  await client.user.get({ id: "123" });
} catch (e) {
  if (e instanceof RpcError) {
    // サーバー由来のエラー
    console.log(e.code);    // -32601
    console.log(e.message); // "Method not found"
    console.log(e.data);    // undefined
  }
  if (e instanceof FractalError) {
    // クライアントローカルのエラー（TIMEOUT, DISPOSED）
    console.log(e.code);    // "TIMEOUT"
  }
}
```

### 3.2 Context 型

```ts
interface Context<TParams extends Record<string, unknown> = Record<string, unknown>> {
  req: {
    method: string;
    params: TParams;
    id?: string | number | null;
    raw?: MessageEvent;  // 元の messaging event（serve() 経由時のみ存在）
  };
  res?: JsonRpcResponse;  // next() 完了後にセットされる
  json<T extends Exclude<unknown, undefined>>(data: T & ({} | null)): JsonRpcSuccessResponse;
  error(code: number, message: string, data?: unknown): JsonRpcErrorResponse;
}
```

型パラメータ `TParams` はビルダーチェーン（`app.method()`）の handler 定義から自動推論される。

| プロパティ | 説明 |
|---|---|
| `c.req.method` | JSON-RPC method 名 |
| `c.req.params` | リクエストパラメータ（`TParams` で型付けされる）。Request の `params` が省略された場合は `{}` に正規化される |
| `c.req.id` | リクエスト ID |
| `c.req.raw` | 元の MessageEvent。`serve()` 経由時のみ存在し、`dispatch()` 直接呼び出し時は `undefined` |
| `c.res` | handler または後続 middleware が生成したレスポンス。`next()` 完了後に参照・差し替え可能。handler 実行前は `undefined` |
| `c.json(data)` | 成功レスポンスを生成。`data` に `undefined` は渡せない（型レベルで禁止）。レスポンスの `id` は `c.req.id` から自動設定される。Notification（`c.req.id` が `undefined`）の場合は `null` に正規化される |
| `c.error(code, message, data?)` | エラーレスポンスを生成。レスポンスの `id` は `c.req.id` から自動設定される。Notification（`c.req.id` が `undefined`）の場合は `null` に正規化される |

### 3.3 Middleware 型

```ts
type MiddlewareHandler = (
  c: Context,
  next: () => Promise<void>
) => void | JsonRpcResponse | Promise<void | JsonRpcResponse>;
```

middleware は `use()` の登録順（ビルダーチェーンの呼び出し順）に実行され、最後に handler が実行される。グローバル middleware とルート固有 middleware の区別なく、登録順がそのまま実行順となる。マッチしないルート固有 middleware はスキップされる。

middleware は `next()` を呼ぶことで後続の middleware / handler に処理を委譲する。`next()` の前後で前処理・後処理を実行できる。`next()` は middleware あたり1回のみ呼び出し可能であり、2回目以降の呼び出しは `Error: next() called multiple times` を throw する。

middleware のレスポンス制御には2つの方法があり、用途が明確に分かれる:

- **`JsonRpcResponse` を return する**: `next()` を呼ばずに早期終了する場合に使用する。handler には到達しない。
- **`c.res` に代入する**: `next()` を呼んだ後にレスポンスを差し替える場合に使用する。

`next()` を呼んだ middleware は `void` を返すこと。`next()` を呼びつつ `JsonRpcResponse` を return した場合の動作は未定義である。

`await next()` 完了後は `c.res` に handler または内側の middleware が生成したレスポンスがセットされる。middleware が `next()` を呼ばずに `JsonRpcResponse` を return した場合も、そのレスポンスが `c.res` にセットされる。middleware は `c.res` を参照してログ出力や、`c.res` に代入してレスポンスの差し替えが可能。

handler または内側の middleware が例外を throw した場合、その例外は `await next()` を通じて外側の middleware に再 throw される（Koa と同じモデル）。middleware が `try/catch` で例外を捕捉した場合、`c.res` は未設定のままであるため、middleware 自身が `c.error()` でレスポンスを生成するか `c.res` に代入する必要がある。例外を捕捉しなかった場合、フレームワークがチェーン最外部で catch し `-32603 Internal error` を返す。

middleware チェーン完了後に `c.res` が未設定かつ戻り値も `void` の場合（`next()` を呼ばず `JsonRpcResponse` も返さなかった場合）、フレームワークは `-32603 Internal error` を自動的に返す。

### 3.4 Route Schema 型（型推論用）

```ts
// App に登録された route から自動推論される型
// ビルダーチェーンにより .method() の呼び出しごとに型パラメータが蓄積される
type InferRoutes<T extends Fractal> = {
  [Method in RegisteredMethods<T>]: {
    input: InferInput<T, Method>;   // TParams（ジェネリクスで明示した型）
    output: InferOutput<T, Method>; // c.json() の引数から推論された型
  };
};
```

この型は `createClient<typeof app>()` の型パラメータとして使用され、client のメソッド呼び出しに型安全性を付与する。

- `input`: `.method<TParams>()` で指定した型パラメータ `TParams` から取得
- `output`: handler 内の `c.json(data)` の `data` 引数の型から推論

---

## 4. プロトコル仕様

### 4.1 概要

本フレームワークは JSON-RPC 2.0 仕様に準拠した wire protocol を使用する。

すべてのメッセージは `postMessage` / `MessagePort.postMessage` 等を介して JSON オブジェクトとして送受信される。

> **メッセージの識別:** Endpoint はメッセージ受信時に `event.data?.jsonrpc === "2.0"` を検証し、条件を満たさないメッセージは無視する。これにより、同一 transport 上の他のライブラリやアプリケーションコードの `postMessage` と共存できる。

> **Batch Request について:** JSON-RPC 2.0 仕様で定義されている配列による Batch Request には対応しない。すべてのリクエストは単一の JSON-RPC Request オブジェクトとして送信すること。配列は `jsonrpc: "2.0"` フィールドを持たないため、Endpoint 層で他の非 JSON-RPC メッセージと同様に無視される。

### 4.2 Request フォーマット

```json
{
  "jsonrpc": "2.0",
  "method": "user.get",
  "params": { "id": "123" },
  "id": 1
}
```

### 4.3 Response フォーマット（成功）

```json
{
  "jsonrpc": "2.0",
  "result": { "id": "123", "name": "Alice" },
  "id": 1
}
```

### 4.4 Response フォーマット（エラー）

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Method not found"
  },
  "id": 1
}
```

### 4.5 Notification フォーマット

`id` フィールドを省略した Request は notification として扱われる。notification に対して Response は返されない。

> **注意:** Notification の判定は `id` フィールドの存在有無（`"id" in request`）で行うこと。`id: 0`、`id: ""`、`id: null` はいずれも `id` フィールドが存在するため Notification ではなく通常リクエストとして処理される。`id: null` の場合、レスポンスの `id` も `null` となる。JSON-RPC 2.0 仕様ではリクエストの `id` に `null` を使用することは非推奨（SHOULD NOT）であるが、本フレームワークは受信側として寛容に扱う。同様に、`id: undefined` も JavaScript では `"id" in request` が `true` となるため Notification ではなく通常リクエストとして処理される。`postMessage` の構造化クローンは `undefined` 値を保持するため、外部クライアントから `id: undefined` を含むメッセージが送信される可能性がある点に注意すること。

サーバー側では notification を受信した場合も対応する handler・middleware は実行される。ただし handler の戻り値は破棄され、`endpoint.send` による返信は行われない。handler が正常に完了した場合、`c.res` には通常リクエストと同様にレスポンスがセットされる。handler または middleware 内で例外が発生した場合、例外は通常リクエストと同様に `await next()` を通じて外側の middleware に再 throw される。middleware が例外を捕捉しなかった場合、フレームワークがチェーン最外部で catch し、エラーレスポンスは送信されず `console.error` で出力される。middleware が `try/catch` で例外を捕捉してログ出力やエラーハンドリングを行いたい場合は、通常リクエストと同じ方法で対応できる。

```json
{
  "jsonrpc": "2.0",
  "method": "log.info",
  "params": { "message": "hello" }
}
```

---

## 5. エラーコード一覧

### 5.1 JSON-RPC 標準エラーコード

| コード | 名称 | 説明 |
|---|---|---|
| `-32700` | Parse error | JSON パースに失敗 ※1 |
| `-32600` | Invalid Request | 不正な JSON-RPC Request ※3 |
| `-32601` | Method not found | 指定された method が未登録 |
| `-32602` | Invalid params | パラメータが不正 ※2 |
| `-32603` | Internal error | handler / middleware 内部でのエラー |

> ※1 現行の transport（`postMessage` / `MessagePort`）は構造化クローンでオブジェクトを転送するため、フレームワークから `-32700` が返されることはない。将来 HTTP adapter 等が追加された場合に使用される可能性がある。

> ※2 フレームワーク自体はランタイムバリデーションを行わないため、`-32602` が自動的に返されることはない。middleware でパラメータ検証を実装する際に `c.error(-32602, ...)` として使用できる。

> ※3 以下の場合にフレームワークが自動的に返す: (a) `method` フィールドが存在しないか `string` 型でない場合（`serve()` レベル）、(b) `params` フィールドが存在し、かつ plain object でない場合（配列・`null`・プリミティブ値、`dispatch()` レベル）。`id` の型チェックは行わない。

handler または middleware が例外を throw した場合、フレームワークは `-32603 Internal error` を返す。throw された値が `Error` インスタンスの場合、`message` には `error.message` の値がセットされる。`Error` インスタンスでない場合（`throw "string"` や `throw null` 等）、`message` は固定文字列 `"Internal error"` となる。スタックトレース等の内部情報は `data` フィールドに含めない。

Notification の場合は例外が発生してもエラーレスポンスは送信されない（§4.5 参照）。

### 5.2 サーバエラー予約範囲

| コード範囲 | 説明 |
|---|---|
| `-32000` 〜 `-32099` | サーバ定義エラー用の予約範囲 |

アプリケーション固有のエラーコードはこの範囲内で定義することを推奨する。

---

## 6. 使用例

### 6.1 Worker を使った基本的な RPC

**メインスレッド側:**

```ts
import type { AppType } from "./worker";
import { createClient } from "fractal/client";
import { workerEndpoint } from "fractal/endpoint";

const worker = new Worker("./worker.ts");
const endpoint = workerEndpoint(worker);
const client = createClient<AppType>(endpoint);

const user = await client.user.get({ id: "123" });
console.log(user.name); // "Alice"
```

**Worker 側:**

```ts
import { Fractal } from "fractal";
import { serve } from "fractal/adapter";
import { workerEndpoint } from "fractal/endpoint";

const app = new Fractal()
  .method<{ id: string }>("user.get", (c) => {
    const { id } = c.req.params;
    return c.json({ id, name: "Alice" });
  });

export type AppType = typeof app;

const endpoint = workerEndpoint(self);
serve(app, endpoint);
```

### 6.2 iframe 間通信

**親ウィンドウ側:**

```ts
import { createClient } from "fractal/client";
import { windowEndpoint } from "fractal/endpoint";

const iframe = document.getElementById("child") as HTMLIFrameElement;
const endpoint = windowEndpoint(iframe.contentWindow!, {
  origin: "https://child.example.com",
});
const client = createClient<AppType>(endpoint);

const result = await client.data.fetch({ key: "settings" });
```

**iframe 側:**

```ts
import { Fractal } from "fractal";
import { serve } from "fractal/adapter";
import { windowEndpoint } from "fractal/endpoint";

const app = new Fractal()
  .method<{ key: string }>("data.fetch", (c) => {
    const { key } = c.req.params;
    return c.json({ key, value: localStorage.getItem(key) });
  });

export type AppType = typeof app;

const endpoint = windowEndpoint(parent, {
  origin: "https://parent.example.com",
});
serve(app, endpoint);
```

### 6.3 Middleware の活用

```ts
const app = new Fractal()
  // ロギング middleware
  .use(async (c, next) => {
    const start = performance.now();
    await next();
    const elapsed = performance.now() - start;
    console.log(`[${c.req.method}] ${elapsed.toFixed(1)}ms`, c.res);
  })
  // 認証 middleware（特定 method のみ）
  .use("admin.*", async (c, next) => {
    const token = c.req.params?.token;
    if (!token) {
      return c.error(-32000, "Authentication required");
    }
    await next();
  })
  .method<{ token: string }>("admin.delete", (c) => {
    // 認証済みのリクエストのみ到達
    return c.json({ success: true });
  });
```

### 6.4 双方向 RPC（server-initiated push）

Worker からメインスレッドへの通知（server-initiated push）が必要な場合、`MessageChannel` を使って双方向にそれぞれ `serve()` + `createClient()` を配置する。

**メインスレッド側:**

```ts
import type { WorkerAppType } from "./worker";
import { createClient } from "fractal/client";
import { serve } from "fractal/adapter";
import { workerEndpoint, messagePortEndpoint } from "fractal/endpoint";

// メインスレッド → Worker（通常の RPC）
const worker = new Worker("./worker.ts");
const endpoint = workerEndpoint(worker);
const client = createClient<WorkerAppType>(endpoint);

// Worker → メインスレッド（server-initiated push 受信用）
const channel = new MessageChannel();
worker.postMessage({ type: "init-push-channel", port: channel.port2 }, [channel.port2]);

const pushApp = new Fractal()
  .method<{ progress: number }>("task.progress", (c) => {
    updateProgressBar(c.req.params.progress);
    return c.json({ ok: true });
  });

export type PushAppType = typeof pushApp;

serve(pushApp, messagePortEndpoint(channel.port1));
```

**Worker 側:**

```ts
import type { PushAppType } from "./main";
import { Fractal } from "fractal";
import { serve } from "fractal/adapter";
import { createClient } from "fractal/client";
import { workerEndpoint, messagePortEndpoint } from "fractal/endpoint";

// push チャネルの初期化を Promise で管理し、handler 内で await する
type PushClient = ReturnType<typeof createClient<PushAppType>>;
let resolvePushClient: (client: PushClient) => void;
const pushClientReady = new Promise<PushClient>((resolve) => {
  resolvePushClient = resolve;
});

const app = new Fractal()
  .method<{ taskId: string }>("task.start", async (c) => {
    // push チャネルの初期化完了を待ってから通知
    const pushClient = await pushClientReady;
    pushClient.$notify.task.progress({ progress: 50 });
    return c.json({ status: "done" });
  });

export type WorkerAppType = typeof app;

serve(app, workerEndpoint(self));

// メインスレッドから push 用 port を受け取る
self.addEventListener("message", (event) => {
  if (event.data?.type === "init-push-channel") {
    const pushEndpoint = messagePortEndpoint(event.data.port);
    resolvePushClient(createClient<PushAppType>(pushEndpoint));
  }
});
```
