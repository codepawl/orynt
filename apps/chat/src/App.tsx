import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import {
  ArrowDown,
  Copy,
  Diamond,
  PaperPlaneRight,
  Plus,
  Stop,
} from "@phosphor-icons/react";
import remarkGfm from "remark-gfm";
import { OryntChatStore, toolLabel } from "./chatStore";
import type { StoredMessage } from "./protocol";

function convert(message: StoredMessage): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: [{ type: "text", text: message.text }],
    status: message.error
      ? {
          type: "incomplete",
          reason: "error",
          error: { message: message.text },
        }
      : { type: "complete", reason: "stop" },
    metadata: { custom: { tool: message.tool } },
  };
}
function CodeHeader({
  language,
  code,
}: Readonly<{ language?: string; code: string }>) {
  return (
    <div className="code-header">
      <span>{language || "code"}</span>
      <button
        aria-label="Copy code"
        onClick={() => void navigator.clipboard.writeText(code)}
      >
        <Copy size={15} />
        Copy
      </button>
    </div>
  );
}
function TextPart() {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="markdown"
      components={{
        pre: ({ children }) => <pre>{children}</pre>,
        code: ({ className, children, ...props }) => {
          const code = String(children).replace(/\n$/, "");
          const block = className?.startsWith("language-");
          return block ? (
            <div className="code-block">
              <CodeHeader language={className?.slice(9)} code={code} />
              <code className={className} {...props}>
                {children}
              </code>
            </div>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    />
  );
}
function Message() {
  return (
    <MessagePrimitive.Root className="message" data-role="message">
      <div className="avatar">
        <Diamond weight="fill" size={14} />
      </div>
      <div className="message-body">
        <MessagePrimitive.Parts components={{ Text: TextPart }} />
      </div>
    </MessagePrimitive.Root>
  );
}

export default function App() {
  const store = useMemo(() => new OryntChatStore(), []);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.newChat();
    return () => store.dispose();
  }, [store]);
  const runtime = useExternalStoreRuntime({
    messages: state.messages,
    convertMessage: convert,
    isRunning: state.running,
    onNew: async (message) => {
      const text = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
      await store.send(text);
    },
    onCancel: () => store.cancel(),
  });
  const retry = () => {
    const last = [...state.messages]
      .reverse()
      .find((message) => message.role === "user");
    if (last) void store.send(last.text);
  };
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <main className="app-shell">
        <header>
          <a className="brand" href="/" aria-label="Orynt Chat home">
            <span>
              <Diamond weight="fill" />
            </span>
            Orynt
          </a>
          <div className="header-actions">
            <span className="local-badge">Local runtime</span>
            <button className="new-chat" onClick={() => void store.newChat()}>
              <Plus />
              New chat
            </button>
          </div>
        </header>
        <ThreadPrimitive.Root className="thread">
          <ThreadPrimitive.Viewport className="viewport">
            <ThreadPrimitive.Empty>
              <section className="empty">
                <div className="empty-mark">
                  <Diamond weight="fill" />
                </div>
                <p>ORYNT AGENT HARNESS</p>
                <h1>What are we working on?</h1>
                <span>
                  Ask a question, inspect an idea, or start a supervised task.
                </span>
              </section>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages
              components={{ UserMessage: Message, AssistantMessage: Message }}
            />
            {state.messages
              .filter((message) => message.tool)
              .map((message) => (
                <div className="tool-card" key={`tool-${message.id}`}>
                  <span className={`tool-dot ${message.tool!.state}`} />
                  <div>
                    <strong>{toolLabel(message.tool!)}</strong>
                    <p>{message.tool!.summary}</p>
                  </div>
                </div>
              ))}
            {state.error && (
              <div className="error" role="alert">
                <span>{state.error}</span>
                <button onClick={retry}>Retry last message</button>
              </div>
            )}
            <ThreadPrimitive.ViewportFooter className="viewport-footer">
              <ThreadPrimitive.ScrollToBottom asChild>
                <button
                  className="scroll-bottom"
                  aria-label="Scroll to latest message"
                >
                  <ArrowDown />
                </button>
              </ThreadPrimitive.ScrollToBottom>
              <ComposerPrimitive.Root className="composer">
                <label htmlFor="orynt-composer">Message Orynt</label>
                <ComposerPrimitive.Input
                  id="orynt-composer"
                  placeholder="Ask Orynt anything…"
                  rows={1}
                />
                <div className="composer-footer">
                  <span>Enter to send · Shift+Enter for a new line</span>
                  <ThreadPrimitive.If running={false}>
                    <ComposerPrimitive.Send asChild>
                      <button className="send" aria-label="Send message">
                        <PaperPlaneRight weight="fill" />
                      </button>
                    </ComposerPrimitive.Send>
                  </ThreadPrimitive.If>
                  <ThreadPrimitive.If running>
                    <ComposerPrimitive.Cancel asChild>
                      <button className="stop" aria-label="Stop response">
                        <Stop weight="fill" />
                      </button>
                    </ComposerPrimitive.Cancel>
                  </ThreadPrimitive.If>
                </div>
              </ComposerPrimitive.Root>
              <p className="privacy">
                Runs locally through Orynt. Provider credentials never enter
                this browser.
              </p>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </main>
    </AssistantRuntimeProvider>
  );
}
