import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { OryntAssistantThread } from "./OryntAssistantThread";

describe("OryntAssistantThread", () => {
  it("renders the Orynt empty state", () => {
    render(
      <OryntAssistantThread
        messages={[]}
        status="idle"
        canSend
        emptyTitle="Ask Orynt"
        emptyDescription="Start with a repository question."
        onSend={async () => {}}
        onCancel={async () => {}}
      />,
    );
    expect(screen.getByText("Ask Orynt")).toBeInTheDocument();
  });

  it("submits once on Enter and preserves Shift+Enter as a newline", async () => {
    const onSend = mock(async () => {});
    render(
      <OryntAssistantThread
        messages={[]}
        status="idle"
        canSend
        emptyTitle="Ask Orynt"
        emptyDescription="Start."
        onSend={onSend}
        onCancel={async () => {}}
      />,
    );
    const input = screen.getByLabelText("Message Orynt");
    fireEvent.change(input, { target: { value: "Line one" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).toHaveBeenCalledTimes(0);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith("Line one");
  });

  it("shows streamed markdown, code, and safe tool status", () => {
    render(
      <OryntAssistantThread
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            text: "Use `bun test`.\n\n```ts\nconst ok = true;\n```",
          },
          {
            id: "tool-1",
            role: "status",
            text: "Ran focused tests",
            tool: {
              id: "tool-1",
              name: "shell",
              state: "completed",
              summary: "Ran focused tests",
              elapsedMs: 25,
            },
          },
        ]}
        status="completed"
        canSend
        emptyTitle="Ask Orynt"
        emptyDescription="Start."
        onSend={async () => {}}
        onCancel={async () => {}}
      />,
    );
    expect(screen.getByText("bun test")).toBeInTheDocument();
    expect(screen.getByLabelText("shell completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy code")).toBeInTheDocument();
  });

  it("switches from send to stop and calls the real cancel callback once", async () => {
    const onCancel = mock(async () => {});
    render(
      <OryntAssistantThread
        messages={[]}
        status="thinking"
        canSend
        emptyTitle="Ask Orynt"
        emptyDescription="Start."
        onSend={async () => {}}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Stop Orynt"));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it("renders an error and retries through the supplied safe resend callback", async () => {
    const onRetry = mock(async () => {});
    render(
      <OryntAssistantThread
        messages={[]}
        status="failed"
        canSend
        emptyTitle="Ask Orynt"
        emptyDescription="Start."
        error="The run failed."
        onSend={async () => {}}
        onCancel={async () => {}}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The run failed.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});
