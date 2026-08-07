import type { ChatEvent, SafeToolActivity, StoredMessage } from "./protocol";

export type ChatSnapshot = {
  sessionId?: string;
  messages: StoredMessage[];
  runId?: string;
  running: boolean;
  error?: string;
};
type Listener = () => void;

export class OryntChatStore {
  private snapshot: ChatSnapshot = { messages: [], running: false };
  private listeners = new Set<Listener>();
  private abort?: AbortController;
  private generation = 0;
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  async newChat(): Promise<void> {
    const previous = this.snapshot;
    if (previous.sessionId && previous.runId) await this.cancel();
    this.abort?.abort();
    this.generation += 1;
    if (previous.sessionId)
      void this.fetcher(`/api/sessions/${previous.sessionId}`, {
        method: "DELETE",
      });
    const response = await this.fetcher("/api/sessions", { method: "POST" });
    if (!response.ok)
      throw new Error("Could not create an Orynt chat session.");
    const data = (await response.json()) as {
      sessionId: string;
      history?: StoredMessage[];
    };
    this.snapshot = {
      sessionId: data.sessionId,
      messages: data.history ?? [],
      running: false,
    };
    this.emit();
    this.connect(data.sessionId, this.generation);
  }
  async send(text: string): Promise<void> {
    const value = text.trim();
    if (!value || this.snapshot.running) return;
    if (!this.snapshot.sessionId) await this.newChat();
    const sessionId = this.snapshot.sessionId!;
    const userId = `local-${crypto.randomUUID()}`;
    this.snapshot = {
      ...this.snapshot,
      messages: [
        ...this.snapshot.messages,
        { id: userId, role: "user", text: value },
      ],
      running: true,
      error: undefined,
    };
    this.emit();
    const response = await this.fetcher(`/api/sessions/${sessionId}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: value }),
    });
    if (!response.ok) {
      this.snapshot = {
        ...this.snapshot,
        running: false,
        error: await this.error(response),
      };
      this.emit();
      return;
    }
    const data = (await response.json()) as { runId: string };
    this.snapshot = { ...this.snapshot, runId: data.runId };
    this.emit();
  }
  async cancel(): Promise<void> {
    const { sessionId, runId } = this.snapshot;
    if (!sessionId || !runId) return;
    this.snapshot = { ...this.snapshot, running: false, runId: undefined };
    this.emit();
    await this.fetcher(`/api/sessions/${sessionId}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId }),
    });
  }
  dispose(): void {
    this.abort?.abort();
    this.listeners.clear();
  }
  accept(event: ChatEvent, generation = this.generation): void {
    if (
      generation !== this.generation ||
      event.sessionId !== this.snapshot.sessionId
    )
      return;
    if (this.snapshot.runId && event.runId !== this.snapshot.runId) return;
    if (event.type === "run_started") {
      this.snapshot = { ...this.snapshot, runId: event.runId, running: true };
    } else if (event.type === "text_delta") {
      const id = `${event.runId}-assistant`;
      const current = this.snapshot.messages.find(
        (message) => message.id === id,
      );
      const next: StoredMessage = {
        id,
        role: "assistant",
        text: `${current?.text ?? ""}${event.text}`,
      };
      this.snapshot = { ...this.snapshot, messages: this.upsert(next) };
    } else if (event.type === "tool") {
      const next: StoredMessage = {
        id: `${event.runId}-tool-${event.tool.id}`,
        role: "assistant",
        text: event.tool.summary,
        tool: event.tool,
      };
      this.snapshot = { ...this.snapshot, messages: this.upsert(next) };
    } else if (event.type === "completed" || event.type === "cancelled")
      this.snapshot = { ...this.snapshot, running: false, runId: undefined };
    else
      this.snapshot = {
        ...this.snapshot,
        running: false,
        runId: undefined,
        error: event.message,
        messages: [
          ...this.snapshot.messages,
          {
            id: `${event.runId}-error`,
            role: "assistant",
            text: event.message,
            error: true,
          },
        ],
      };
    this.emit();
  }
  private upsert(next: StoredMessage): StoredMessage[] {
    const index = this.snapshot.messages.findIndex(
      (message) => message.id === next.id,
    );
    return index < 0
      ? [...this.snapshot.messages, next]
      : this.snapshot.messages.map((message, i) =>
          i === index ? next : message,
        );
  }
  private connect(sessionId: string, generation: number): void {
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    void this.fetcher(`/api/sessions/${sessionId}/events`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body)
          throw new Error("Orynt event stream unavailable.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          pending += decoder.decode(result.value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              this.accept(JSON.parse(line) as ChatEvent, generation);
            } catch {
              continue;
            }
          }
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && generation === this.generation) {
          this.snapshot = {
            ...this.snapshot,
            running: false,
            error:
              error instanceof Error ? error.message : "Orynt stream failed.",
          };
          this.emit();
        }
      });
  }
  private async error(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === "string"
        ? body.error
        : "Orynt request failed.";
    } catch {
      return "Orynt request failed.";
    }
  }
  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
export function toolLabel(tool: SafeToolActivity): string {
  return `${tool.name} · ${tool.state}`;
}
