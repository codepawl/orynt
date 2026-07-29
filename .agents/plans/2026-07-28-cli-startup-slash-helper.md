# CLI First-Launch Boundary and Slash Command Palette

Add a persisted, informational safety acknowledgement to the first interactive TTY launch without replacing the existing approval before every repository run.

Replace the interactive TTY line reader with a dependency-free composer that opens a filtered command palette when `/` is typed, supports keyboard completion and editing, preserves multiline and history behavior, and restores terminal state on every exit path. Keep non-TTY and headless behavior backward compatible.
