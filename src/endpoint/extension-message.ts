interface ExtensionMessageSender {
  tab?: { id?: number };
}

interface ExtensionRuntimeLike {
  sendMessage(message: unknown): void;
  onMessage: {
    addListener(
      cb: (message: unknown, sender: ExtensionMessageSender) => void,
    ): void;
    removeListener(
      cb: (message: unknown, sender: ExtensionMessageSender) => void,
    ): void;
  };
}

interface ExtensionTabsLike {
  sendMessage(tabId: number, message: unknown): void;
}

interface ExtensionBrowserLike {
  runtime: ExtensionRuntimeLike;
  tabs: ExtensionTabsLike;
}

interface Endpoint {
  send(message: unknown): void;
  onMessage(
    handler: (message: unknown, event: MessageEvent) => void,
  ): () => void;
}

function isJsonRpcMessage(data: unknown): data is { jsonrpc: "2.0" } {
  return (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as Record<string, unknown>).jsonrpc === "2.0"
  );
}

export function extensionRuntimeEndpoint(
  browser: ExtensionBrowserLike,
): Endpoint {
  return {
    send(message: unknown): void {
      browser.runtime.sendMessage(message);
    },
    onMessage(
      handler: (message: unknown, event: MessageEvent) => void,
    ): () => void {
      const listener = (
        message: unknown,
        _sender: ExtensionMessageSender,
      ): void => {
        if (!isJsonRpcMessage(message)) return;
        try {
          handler(message, { data: message } as MessageEvent);
        } catch {
          // Errors in handlers are caught and swallowed
        }
      };

      browser.runtime.onMessage.addListener(listener);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        browser.runtime.onMessage.removeListener(listener);
      };
    },
  };
}

export function extensionTabEndpoint(
  browser: ExtensionBrowserLike,
  tabId: number,
): Endpoint {
  return {
    send(message: unknown): void {
      browser.tabs.sendMessage(tabId, message);
    },
    onMessage(
      handler: (message: unknown, event: MessageEvent) => void,
    ): () => void {
      const listener = (
        message: unknown,
        sender: ExtensionMessageSender,
      ): void => {
        if (sender.tab?.id !== tabId) return;
        if (!isJsonRpcMessage(message)) return;
        try {
          handler(message, { data: message } as MessageEvent);
        } catch {
          // Errors in handlers are caught and swallowed
        }
      };

      browser.runtime.onMessage.addListener(listener);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        browser.runtime.onMessage.removeListener(listener);
      };
    },
  };
}
