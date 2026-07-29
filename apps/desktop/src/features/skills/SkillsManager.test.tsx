import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SkillsManager } from "./SkillsManager";

describe("SkillsManager", () => {
  it("keeps install and enable as separately approved lifecycle changes", async () => {
    const onEligibleSkillsChange = vi.fn();
    render(
      <SkillsManager
        learnedSkills={[]}
        onEligibleSkillsChange={onEligibleSkillsChange}
        onLearnedSkillAction={vi.fn()}
        repositoryPath="/repo"
      />,
    );

    expect(await screen.findByRole("tab", { name: "Installed" })).toHaveAttribute("aria-selected", "true");
    const installedList = await screen.findByRole("list", { name: "Installed skills" });
    expect(within(installedList).getByText("skill-creator")).toBeInTheDocument();
    fireEvent.click(within(installedList).getByText("code-reviewer").closest("button")!);
    expect(screen.getByText(/Runtime-owned skill/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move to Trash" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    const search = screen.getByRole("textbox", { name: "Search skill marketplace" });
    fireEvent.change(search, { target: { value: "docs" } });
    const catalogSkill = within(await screen.findByRole("list", { name: "Marketplace skills" })).getByText("docs-writer").closest("button");
    expect(catalogSkill).not.toBeNull();
    fireEvent.click(catalogSkill!);
    fireEvent.click(screen.getByRole("button", { name: "Install for project" }));

    const installPlan = await screen.findByRole("alertdialog", { name: /Install docs-writer/i });
    expect(within(installPlan).getByText(/without enabling it/i)).toBeInTheDocument();
    fireEvent.click(within(installPlan).getByRole("button", { name: "Approve and apply" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "Installed" }));
    fireEvent.click(within(await screen.findByRole("list", { name: "Installed skills" })).getByText("docs-writer").closest("button")!);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    const enablePlan = await screen.findByRole("alertdialog", { name: /Enable docs-writer/i });
    fireEvent.click(within(enablePlan).getByRole("button", { name: "Approve and apply" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(onEligibleSkillsChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ name: "docs-writer", enabled: true, eligible: true })]));
  });

  it("separates learned skills from installed packages and exposes source policy", async () => {
    render(
      <SkillsManager
        learnedSkills={[]}
        onEligibleSkillsChange={vi.fn()}
        onLearnedSkillAction={vi.fn()}
        repositoryPath="/repo"
      />,
    );
    await screen.findByRole("list", { name: "Installed skills" });

    fireEvent.click(screen.getByRole("tab", { name: "Learned" }));
    expect(screen.getByText(/not installed Agent Skill packages/i)).toBeInTheDocument();
    expect(screen.getByText("No learned skills")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Sources & policy" }));
    expect(screen.getByText("Orynt built-ins")).toBeInTheDocument();
    expect(screen.getByText(/Shipped with this Orynt build/i)).toBeInTheDocument();
    expect(screen.getByText("OpenAI curated")).toBeInTheDocument();
    expect(screen.getByText(/Stars and downloads are discovery metadata only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
