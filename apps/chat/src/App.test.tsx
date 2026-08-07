import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("standalone Orynt chat UI", () => {
  it("renders the starter-quality thread, accessible composer, and new-chat control", () => {
    globalThis.fetch = (async (input) =>
      String(input) === "/api/sessions"
        ? new Response(JSON.stringify({ sessionId: "s1" }), { status: 201 })
        : new Response(new ReadableStream({ start() {} }))) as typeof fetch;
    render(<App />);
    expect(screen.getByText("What are we working on?")).toBeTruthy();
    expect(screen.getByLabelText("Message Orynt")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
  });
  it("keeps Shift+Enter available in the composer", () => {
    globalThis.fetch = (async (input) =>
      String(input) === "/api/sessions"
        ? new Response(JSON.stringify({ sessionId: "s1" }), { status: 201 })
        : new Response(new ReadableStream({ start() {} }))) as typeof fetch;
    render(<App />);
    const input = screen.getByLabelText("Message Orynt") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(input.value).toBe("first");
  });
});
