# Orynt Chat

Standalone browser chat for the Orynt agent runtime. The thread/composer structure
is derived from the official assistant-ui CLI 0.0.106 thread component (MIT).
Provider, cloud, authentication, database, and sample-tool code are omitted.

```bash
export ORYNT_CHAT_MODEL_API_KEY="..."
cd apps/chat
bun run dev
```

Open <http://127.0.0.1:4317>. Provider credentials remain in the loopback server.
