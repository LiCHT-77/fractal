export interface Endpoint {
  send(message: unknown): void;
  onMessage(
    handler: (message: unknown, event: MessageEvent) => void,
  ): () => void;
}
