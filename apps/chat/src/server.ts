import path from "node:path";
import { OryntChatService } from "./server/chatService";
const service = new OryntChatService();
const host = "127.0.0.1";
const port = Number(process.env.ORYNT_CHAT_PORT ?? 4318);
const respond = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });
const server = Bun.serve({
  hostname: host,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (request.method === "POST" && url.pathname === "/api/sessions")
        return respond(service.createSession(), 201);
      if (parts[0] === "api" && parts[1] === "sessions" && parts[2]) {
        const sessionId = parts[2];
        if (request.method === "GET" && parts[3] === "events") {
          let unsubscribe: () => void = () => undefined;
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              unsubscribe = service.subscribe(sessionId, (event) =>
                controller.enqueue(
                  encoder.encode(`${JSON.stringify(event)}\n`),
                ),
              );
              request.signal.addEventListener(
                "abort",
                () => {
                  unsubscribe();
                  controller.close();
                },
                { once: true },
              );
            },
            cancel() {
              unsubscribe();
            },
          });
          return new Response(stream, {
            headers: {
              "content-type": "application/x-ndjson",
              "cache-control": "no-store",
              "x-content-type-options": "nosniff",
            },
          });
        }
        if (request.method === "GET" && parts[3] === "history")
          return respond({ history: service.history(sessionId) });
        if (request.method === "POST" && parts[3] === "turns") {
          const body = (await request.json()) as { text?: unknown };
          const text = typeof body.text === "string" ? body.text.trim() : "";
          return text
            ? respond({ runId: await service.submit(sessionId, text) }, 202)
            : respond({ error: "Message text is required." }, 400);
        }
        if (request.method === "POST" && parts[3] === "cancel") {
          const body = (await request.json()) as { runId?: unknown };
          if (typeof body.runId !== "string")
            return respond({ error: "runId is required." }, 400);
          service.cancel(sessionId, body.runId);
          return respond({ ok: true });
        }
        if (request.method === "DELETE" && parts.length === 3) {
          await service.closeSession(sessionId);
          return new Response(null, { status: 204 });
        }
      }
      if (request.method === "GET") {
        const root = path.join(import.meta.dir, "../dist");
        const target =
          url.pathname === "/"
            ? path.join(root, "index.html")
            : path.join(root, url.pathname.slice(1));
        if (!target.startsWith(root))
          return respond({ error: "Not found." }, 404);
        const file = Bun.file(target);
        if (await file.exists()) return new Response(file);
        const index = Bun.file(path.join(root, "index.html"));
        if (await index.exists()) return new Response(index);
      }
      return respond({ error: "Not found." }, 404);
    } catch (error) {
      return respond(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unexpected Orynt bridge error.",
        },
        500,
      );
    }
  },
});
console.log(`Orynt Chat listening on http://${host}:${server.port}`);
