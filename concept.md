# Browser Messaging JSON-RPC Framework 設計書

## コンセプト

本フレームワークは、ブラウザ内部の messaging を **統一的な RPC API として扱うためのフレームワーク**である。

既存ライブラリである Comlink は WebWorker を中心とした "remote object" RPC を提供する軽量ライブラリである。一方、本フレームワークはそれとは異なり、ブラウザ messaging 全体を対象とした **アプリケーションレベルの RPC フレームワーク**を目指す。

本フレームワークの設計思想は次の 2 つの系譜に近い。

- Comlink のような **browser messaging RPC**
- Hono / tRPC のような **typed RPC framework**

すなわち本フレームワークは

**"Hono / tRPC for Browser Messaging"**

というコンセプトを持つ。

この設計により、ブラウザ内部で発生する次のような通信を統一的に扱うことができる。

- iframe 間通信
- WebWorker
- SharedWorker
- Service Worker
- MessagePort

本フレームワークは単なる RPC ヘルパーではなく、以下の特徴を持つ。

- JSON-RPC による明示的 API 契約
- transport 非依存アーキテクチャ
- middleware による処理パイプライン
- route 定義からの型付き client 生成

これにより、ブラウザ内部の messaging を **アプリケーション API として設計・運用できる基盤**を提供する。

## 1. 目的

本フレームワークは、ブラウザ内部のメッセージング機構を統一的に扱うための軽量 RPC フレームワークを提供することを目的とする。

対象となるメッセージングは以下である。

- Window / iframe 間通信
- MessagePort
- Web Worker
- SharedWorker
- Service Worker

BroadcastChannel は設計上の複雑性が高いため対象外とする。

本フレームワークは以下の特性を持つ。

- JSON-RPC 2.0 を通信プロトコルとして採用する
- transport 非依存の Core を提供する
- adapter により任意のブラウザ messaging に対応可能
- 型推論が可能なクライアント生成機構を提供する
- 極めて薄い abstraction を維持する

本フレームワークは HTTP フレームワーク **Hono** から強い影響を受けている。特に以下の思想をブラウザメッセージング環境に適用することを目的とする。

- 極めて薄い Core
- transport 非依存アーキテクチャ
- middleware ベースの処理モデル
- 型推論可能なクライアント生成

すなわち、本フレームワークは **"Hono for Browser Messaging"** に相当する設計思想を持つ。

---

## 2. 設計原則

本フレームワークは以下の原則に基づいて設計する。

### 2.1 Transport 非依存

Core 層は特定の messaging API に依存してはならない。

Core が扱うのは JSON-RPC Request / Response のみとする。

### 2.2 Adapter パターン

各 messaging API は Adapter により抽象化する。

Adapter は messaging event を JSON-RPC Request に変換し、Response を返信する責務を持つ。

### 2.3 JSON-RPC 準拠

wire protocol は JSON-RPC 2.0 を採用する。

ただし transport 情報は JSON-RPC payload に含めない。

### 2.4 最小抽象

Transport abstraction は最小構成に留める。

Endpoint abstraction の責務は以下のみとする。

- メッセージ送信
- メッセージ受信

### 2.5 型安全クライアント

サーバ側 route 定義から型付きクライアントを生成可能とする。

---

## 3. 全体アーキテクチャ

本フレームワークは以下のレイヤ構造を持つ。

1. Endpoint Layer
2. JSON-RPC Layer
3. Core Routing Layer
4. Client Layer

各レイヤの責務を以下に示す。

### 3.1 Endpoint Layer

ブラウザ messaging API を抽象化する層。

対象 API

- Window\.postMessage
- MessagePort
- Worker
- SharedWorker
- ServiceWorker

Endpoint Layer の役割は以下。

- メッセージ送信
- メッセージ受信
- raw event の保持

### 3.2 JSON-RPC Layer

Endpoint 上に JSON-RPC request / response モデルを実装する層。

責務

- request id 管理
- pending request 管理
- notification 処理
- error mapping

### 3.3 Core Routing Layer

JSON-RPC method を handler に dispatch する層。

責務

- route registry
- middleware execution
- context generation
- handler execution
- error handling

### 3.4 Client Layer

型付き RPC client を提供する層。

責務

- method proxy
- request 発行
- response 変換

---

## 4. プロトコル仕様

### 4.1 JSON-RPC Request

request は JSON-RPC 2.0 形式に準拠する。

必須フィールド

- jsonrpc
- method

任意フィールド

- id
- params

id が存在しない場合は notification として扱う。

### 4.2 JSON-RPC Response

response は以下のいずれかである。

- success
- error

success は result を含む。

error は code と message を含む。

### 4.3 Method Naming

method 名は namespace 形式を推奨する。

例

user.get\
user.update\
session.login

これにより client 側で階層構造の API を生成可能となる。

---

## 5. Endpoint 抽象

Endpoint は messaging transport を抽象化した最小単位である。

Endpoint の責務は以下の 2 点のみ。

1. メッセージ送信
2. メッセージ受信

Endpoint は request/response 概念を持たない。

それらは JSON-RPC layer の責務とする。

### 5.1 Endpoint 要件

Endpoint は以下の機能を持つ必要がある。

- message 送信
- message 受信イベント
- raw event 取得

### 5.2 対応 Endpoint

#### Window Endpoint

対象

- iframe
- popup
- parent window

#### MessagePort Endpoint

対象

- MessageChannel
- SharedWorker

#### Worker Endpoint

対象

- Dedicated Worker

#### ServiceWorker Endpoint

対象

- Service Worker controller

---

## 6. JSON-RPC Layer

JSON-RPC layer は Endpoint 上に RPC semantics を構築する。

### 6.1 Request Lifecycle

1. request id 生成
2. request 送信
3. pending map 登録
4. response 受信
5. pending resolve

### 6.2 Notification

id を持たない request は notification として扱う。

notification は response を期待しない。

### 6.3 Pending Request 管理

pending request は id により管理する。

管理項目

- resolver
- rejecter
- timeout

### 6.4 Timeout

request には timeout 設定が可能。

timeout 発生時は pending request を reject する。

---

## 7. Core Routing Layer

Core は RPC method を handler に dispatch する。

### 7.1 Route Registry

Core は method 名と handler のマップを保持する。

登録単位

method -> handler

### 7.2 Context

handler は Context を受け取る。

Context は以下を含む。

- request
- params
- transport metadata
- response helper

### 7.3 Middleware

middleware は handler 実行前後に実行される。

middleware chain は以下の順序で実行される。

1. global middleware
2. route middleware
3. handler

### 7.4 Error Handling

handler 例外は JSON-RPC error に変換される。

標準 error code を使用する。

---

## 8. Client Layer

Client Layer は型安全な RPC client を提供する。

### 8.1 Client 生成

client は以下の要素から生成される。

- transport
- route schema

### 8.2 Proxy ベース API

client API は Proxy により動的生成される。

method path は namespace 形式で構築される。

例

client.user.get()\
client.session.login()

### 8.3 型推論

route schema から以下を推論する。

- input type
- output type

---

## 9. Adapter

Adapter は messaging event と JSON-RPC layer の橋渡しを行う。

Adapter の責務

- message event を JSON-RPC request に変換
- JSON-RPC response を返信

Adapter は Core を直接呼び出す。

---

## 10. Transport 対応

本フレームワークは以下の transport を想定する。

### 10.1 Window

通信対象

- parent window
- iframe
- popup

### 10.2 MessagePort

通信対象

- MessageChannel

### 10.3 Worker

通信対象

- Dedicated Worker

### 10.4 SharedWorker

通信対象

- SharedWorker.port

### 10.5 Service Worker

通信対象

- ServiceWorker controller

---

## 11. モジュール構成

推奨ディレクトリ構造

core/

- app
- context
- middleware

protocol/

- jsonrpc

endpoint/

- window
- message-port
- worker

rpc/

- server
- client

adapter/

- server adapters

client/

- proxy

---

## 12. 非対象機能

以下は本フレームワークの対象外とする。

- BroadcastChannel
- HTTP transport
- streaming RPC

---

## 13. 将来拡張

将来的に以下の拡張が可能である。

- HTTP adapter
- WebSocket adapter
- schema validation
- middleware ecosystem

---

## 14. まとめ

本フレームワークは browser messaging を統一的に扱う JSON-RPC ベース RPC framework である。

設計の要点は以下である。

- Endpoint abstraction により messaging API を統一
- JSON-RPC を wire protocol とする
- Core routing layer を transport 非依存とする
- 型安全 client を提供する

これにより、ブラウザ内部の様々な messaging transport 上で統一的な RPC API を構築可能となる。
