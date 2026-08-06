import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  useMessage,
  type AppendMessage,
} from "@assistant-ui/react";
import {
  MarkdownTextPrimitive,
  type CodeHeaderProps,
} from "@assistant-ui/react-markdown";
import { Check, Copy, RotateCcw, Send, Square, Wrench } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import remarkGfm from "remark-gfm";

import {
  textFromAppendContent,
  toThreadMessage,
  type OryntChatMessage,
  type OryntChatRunStatus,
  type OryntChatTool,
} from "./oryntChatAdapter";
import "@assistant-ui/react-markdown/styles/dot.css";

type OryntAssistantThreadProps = {
  messages: readonly OryntChatMessage[];
  status: OryntChatRunStatus;
  canSend: boolean;
  emptyTitle: string;
  emptyDescription: string;
  error?: string;
  onSend: (text: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onRetry?: () => Promise<void>;
};

function useCopyCode() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }, []);
  return { copied, copy };
}

function CodeHeader({ language, code }: CodeHeaderProps) {
  const { copied, copy } = useCopyCode();
  return (
    <div className="orynt-code-header">
      <span>{language || "code"}</span>
      <button
        type="button"
        aria-label={copied ? "Code copied" : "Copy code"}
        onClick={() => void copy(code)}
      >
        {copied ? (
          <Check aria-hidden="true" strokeWidth={2} />
        ) : (
          <Copy aria-hidden="true" strokeWidth={2} />
        )}
      </button>
    </div>
  );
}

const MarkdownText = memo(function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      className="orynt-markdown"
      components={{ CodeHeader }}
      defer
      remarkPlugins={[remarkGfm]}
      smooth={false}
    />
  );
});

function customMetadata(): {
  role?: OryntChatMessage["role"];
  tool?: OryntChatTool;
} {
  const metadata = useMessage((state) => state.metadata.custom);
  if (!metadata || typeof metadata !== "object") return {};
  const role =
    metadata.oryntRole === "user" ||
    metadata.oryntRole === "assistant" ||
    metadata.oryntRole === "status" ||
    metadata.oryntRole === "error"
      ? metadata.oryntRole
      : undefined;
  const tool =
    metadata.tool && typeof metadata.tool === "object"
      ? (metadata.tool as OryntChatTool)
      : undefined;
  return { role, tool };
}

function Message() {
  const { role, tool } = customMetadata();
  const assistant = role !== "user";
  if (tool) {
    return (
      <MessagePrimitive.Root
        className={`orynt-tool-card orynt-tool-${tool.state}`}
        aria-label={`${tool.name} ${tool.state}`}
      >
        <div className="orynt-tool-heading">
          <Wrench aria-hidden="true" strokeWidth={2} />
          <strong>{tool.name}</strong>
          <span>{tool.state}</span>
          {tool.elapsedMs !== undefined ? (
            <time>{Math.round(tool.elapsedMs)}ms</time>
          ) : null}
        </div>
        <details>
          <summary>{tool.summary}</summary>
          <MessagePrimitive.Content components={{ Text: MarkdownText }} />
        </details>
      </MessagePrimitive.Root>
    );
  }
  return (
    <MessagePrimitive.Root
      className={[
        "orynt-chat-message",
        assistant ? "orynt-chat-message-assistant" : "orynt-chat-message-user",
        role === "status" ? "orynt-chat-message-status" : "",
        role === "error" ? "orynt-chat-message-error" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <MessagePrimitive.Content components={{ Text: MarkdownText }} />
    </MessagePrimitive.Root>
  );
}

function ThreadView({
  emptyTitle,
  emptyDescription,
  error,
  onRetry,
}: Pick<
  OryntAssistantThreadProps,
  "emptyTitle" | "emptyDescription" | "error" | "onRetry"
>) {
  return (
    <ThreadPrimitive.Root className="orynt-assistant-thread">
      <ThreadPrimitive.Viewport className="orynt-assistant-viewport">
        <ThreadPrimitive.Empty>
          <div className="orynt-assistant-empty">
            <span className="orynt-assistant-mark" aria-hidden="true">
              O
            </span>
            <h2>{emptyTitle}</h2>
            <p>{emptyDescription}</p>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={{ Message }} />
        {error ? (
          <div className="orynt-assistant-error" role="alert">
            <span>{error}</span>
            {onRetry ? (
              <button type="button" onClick={() => void onRetry()}>
                <RotateCcw aria-hidden="true" strokeWidth={2} />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        <ThreadPrimitive.ViewportFooter className="orynt-assistant-footer">
          <ThreadPrimitive.ScrollToBottom
            className="orynt-scroll-bottom"
            aria-label="Scroll to latest message"
          >
            Latest
          </ThreadPrimitive.ScrollToBottom>
          <ComposerPrimitive.Root className="orynt-assistant-composer">
            <label htmlFor="orynt-assistant-input">Message Orynt</label>
            <ComposerPrimitive.Input
              id="orynt-assistant-input"
              aria-label="Message Orynt"
              placeholder="Ask Orynt to inspect, explain, or change the selected repository"
              rows={1}
              submitMode="enter"
            />
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send
                className="orynt-assistant-send"
                aria-label="Send message"
              >
                <Send aria-hidden="true" strokeWidth={2} />
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel
                className="orynt-assistant-stop"
                aria-label="Stop Orynt"
              >
                <Square aria-hidden="true" strokeWidth={2} />
              </ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

export function OryntAssistantThread({
  messages,
  status,
  canSend,
  emptyTitle,
  emptyDescription,
  error,
  onSend,
  onCancel,
  onRetry,
}: OryntAssistantThreadProps) {
  const converted = useMemo(() => messages.map(toThreadMessage), [messages]);
  const handleNew = useCallback(
    async (message: AppendMessage) => {
      const text = textFromAppendContent(message.content);
      if (!text) return;
      await onSend(text);
    },
    [onSend],
  );
  const running = status === "thinking" || status === "running_tool";
  const runtime = useExternalStoreRuntime({
    messages: converted,
    convertMessage: (message) => message,
    isRunning: running,
    isSendDisabled: !canSend || running,
    onNew: handleNew,
    onCancel,
    unstable_capabilities: { copy: true },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadView
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        error={error}
        onRetry={onRetry}
      />
    </AssistantRuntimeProvider>
  );
}
