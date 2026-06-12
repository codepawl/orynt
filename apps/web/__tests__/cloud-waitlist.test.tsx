import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ContactForm } from "../components/marketing/contact-form";
import { CloudPage } from "../src/routes/cloud";
import { CloudWaitlistPage } from "../src/routes/cloud.waitlist";

describe("Cloud waitlist funnel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "received", id: "sub_1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders /cloud with upcoming and local-only copy", () => {
    render(<CloudPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "CodePawl Cloud Evidence is upcoming.",
    );
    expect(screen.getByText(/waitlist-only/i)).toBeTruthy();
    expect(screen.getByText(/local\/browser-only artifact preview/i)).toBeTruthy();
    expect(screen.getAllByText(/No artifact contents are uploaded/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Cloud is live/i)).toBeNull();
    expect(screen.queryByText(/start a free trial/i)).toBeNull();
  });

  test("renders /cloud/waitlist with safe collection copy and optional fields", () => {
    render(<CloudWaitlistPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Join the Cloud Evidence waitlist.",
    );
    expect(screen.getByText(/CodePawl Cloud is not live/i)).toBeTruthy();
    expect(screen.getByText(/Do not paste artifact contents/i)).toBeTruthy();
    expect(screen.getByText("GitHub org/repo type (optional)")).toBeTruthy();
    expect(screen.getByText("Desired workflow (optional)")).toBeTruthy();
    expect(
      screen.getByText("Hosted storage, team review, or trace search needs (optional)"),
    ).toBeTruthy();
  });

  test("submits source tags and optional context through contact infrastructure", async () => {
    render(
      <ContactForm
        sourceTag="artifact_preview_feedback"
        defaultSubject="Cloud Evidence workflow feedback"
        defaultMessage="Workflow feedback message."
        optionalFields={[
          {
            name: "repoType",
            label: "GitHub org/repo type (optional)",
            placeholder: "Repo type",
          },
          {
            name: "desiredWorkflow",
            label: "Desired workflow (optional)",
            placeholder: "Workflow",
          },
          {
            name: "cloudNeeds",
            label: "Hosted storage, team review, or trace search needs (optional)",
            placeholder: "Cloud needs",
          },
        ]}
        submitLabel="Send workflow feedback"
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "We need review packets before merge." },
    });
    fireEvent.change(screen.getByLabelText("GitHub org/repo type (optional)"), {
      target: { value: "Private platform monorepo" },
    });
    fireEvent.change(screen.getByLabelText("Desired workflow (optional)"), {
      target: { value: "Maintainer review before merge" },
    });
    fireEvent.change(
      screen.getByLabelText("Hosted storage, team review, or trace search needs (optional)"),
      { target: { value: "Team review and trace search" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send workflow feedback" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.source).toBe("artifact_preview_feedback");
    expect(body.subject).toContain("[artifact_preview_feedback]");
    expect(body.message).toContain("source_tag: artifact_preview_feedback");
    expect(body.message).toContain("github_org_repo_type: Private platform monorepo");
    expect(body.message).toContain("desired_workflow: Maintainer review before merge");
    expect(body.message).toContain("cloud_needs: Team review and trace search");
  });
});
