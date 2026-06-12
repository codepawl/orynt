import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/components/link", () => ({
  Link: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));

import { CloudWaitlistForm } from "../components/marketing/cloud-waitlist-form";
import { CloudPage } from "../src/routes/cloud";
import { CloudWaitlistPage } from "../src/routes/cloud.waitlist";

describe("Cloud Evidence waitlist pages", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  test("/cloud keeps upcoming, local-only, privacy-safe copy and CTA hierarchy", () => {
    render(<CloudPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Hosted evidence review for agent work is upcoming/i,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/not generally available yet/i)).toBeTruthy();
    expect(screen.getByText(/local\/browser-only/i)).toBeTruthy();
    expect(screen.getByText(/Artifact contents are not uploaded, stored, or processed/i)).toBeTruthy();

    expect(screen.getByRole("link", { name: /Join Cloud Evidence waitlist/i }).getAttribute("href")).toBe(
      "/cloud/waitlist?source=cloud_page_primary",
    );
    expect(screen.getByRole("link", { name: /Open browser-only Evidence Hub/i }).getAttribute("href")).toBe(
      "/cloud/evidence",
    );
    expect(screen.getByRole("link", { name: /Share workflow needs/i }).getAttribute("href")).toBe(
      "/cloud/waitlist?source=cloud_page_secondary",
    );
  });

  test("/cloud/waitlist captures required fields and privacy guidance", () => {
    render(<CloudWaitlistPage />);

    expect(screen.getByRole("heading", { level: 1, name: /Join the Cloud Evidence waitlist/i })).toBeTruthy();
    expect(screen.getByLabelText("Email").hasAttribute("required")).toBe(true);
    expect(screen.getByLabelText("Role or use case").hasAttribute("required")).toBe(true);
    expect(screen.getByLabelText("Workflow need").hasAttribute("required")).toBe(true);
    expect(screen.getByLabelText("Optional notes")).toBeTruthy();
    expect(screen.getAllByText(/current preview is local\/browser-only/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/must not include artifact contents/i).length).toBeGreaterThan(0);
  });

  test("form accepts supported source tags from query string", () => {
    window.history.replaceState({}, "", "/cloud/waitlist?source=cloud_evidence_demo");

    render(<CloudWaitlistForm />);

    expect((screen.getByTestId("cloud-waitlist-source") as HTMLInputElement).value).toBe(
      "cloud_evidence_demo",
    );
  });

  test("form submits the waitlist payload and shows success", async () => {
    window.history.replaceState({}, "", "/cloud/waitlist?source=pricing_cloud");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", emailStatus: "sent" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CloudWaitlistForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "team@example.com" } });
    fireEvent.change(screen.getByLabelText("Role or use case"), {
      target: { value: "Maintainer" },
    });
    fireEvent.change(screen.getByLabelText("Workflow need"), {
      target: { value: "review_openpawl_run_evidence" },
    });
    fireEvent.change(screen.getByLabelText("Optional notes"), {
      target: { value: "Review workflow only." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Join Cloud Evidence waitlist/i }));

    await waitFor(() => {
      expect(screen.getByText(/Check your inbox for confirmation/i)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cloud/waitlist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "team@example.com",
          roleUseCase: "Maintainer",
          workflowNeed: "review_openpawl_run_evidence",
          notes: "Review workflow only.",
          source: "pricing_cloud",
        }),
      }),
    );
  });
});
