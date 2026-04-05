-- Seed the CodePawl Bot system account for auto-posting.
-- This creates a profile entry with a fixed UUID (no auth.users entry needed
-- since the bot posts via the service key, bypassing RLS).

-- Use a deterministic UUID so we can reference it in code
INSERT INTO profiles (id, username, display_name, avatar_url, role, karma)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'codepawl-bot',
    'CodePawl Bot',
    NULL,
    'user',
    0
)
ON CONFLICT (id) DO NOTHING;
