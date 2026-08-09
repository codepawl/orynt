# Terminal screen modes

Orynt resolves `--screen auto|fullscreen|inline` before constructing the
interactive composer. `auto` is the default and selects the fullscreen viewport
for a capable interactive TTY. `--plain`, `TERM=dumb`, and non-TTY output stay
inline. The saved default can be changed with:

```text
/settings appearance screen auto|fullscreen|inline
```

The saved value applies on the next launch so an active conversation never
switches terminal buffers mid-session.

## Fullscreen behavior

Fullscreen owns one alternate-screen viewport and enables bounded SGR mouse
reporting. The wheel follows its visible region: over the composer it moves
through submitted prompt history, while over the conversation it scrolls the
display history. Drag conversation text without Shift to create an Orynt-owned
selection. The selection remains stable while scrolling or resizing; use
Ctrl+Shift+C to copy it. `/settings clipboard copy-on-select on` can copy on
mouse release and is off by default. Orynt disables mouse reporting on suspend
and exit to recover the shell safely from a stale prior session. Page Up/Down
scroll the bounded display history. Ctrl+Home moves to its start; Ctrl+End
resumes following live output. New output does not move a scrolled viewport.

Use `/copy` to choose a stored Agent response. `/copy latest`,
`/copy previous`, `/copy <n>`, and `/copy all` provide direct forms.

The statusline shows context in exactly one representation. Tokens are the
default (`124k/200k`); switch to one rounded percentage with:

```text
/settings statusline context-format percent
```

The context bar keeps the selected value and changes smoothly from healthy
green through amber to critical red. Provider quota is enabled by default,
shows up to two windows from the primary meter, and refreshes when the session
opens and after each completed, failed, or cancelled turn. Configure it with
`/settings statusline set quota on|off`.

The renderer stores at most 4 MiB and 50,000 wrapped display rows. It wraps only
new history at a stable width, reflows once after a coalesced resize burst, and
updates only dirty terminal rows. Persistent session transcripts remain
separate from this display cache.

## Validation

Run the focused performance gate with:

```sh
bun run bench:cli-render
```

The gate checks a 4 MiB ASCII history, stable-frame cache reuse, bounded memory,
and resize reflow time. Linux PTY coverage in `bun test:e2e-cli` verifies clean
fullscreen resize frames and terminal-state restoration.
