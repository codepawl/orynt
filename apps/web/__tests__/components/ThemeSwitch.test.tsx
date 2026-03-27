import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock next-themes
const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: mockSetTheme }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock motion/react to render plain elements
vi.mock("motion/react", () => ({
  motion: {
    button: ({ children, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
      <button {...props}>{children}</button>
    ),
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

import { ThemeSwitch } from "app/components/ui/theme-switch";

describe("ThemeSwitch", () => {
  it("renders the toggle button", () => {
    render(<ThemeSwitch />);
    const button = screen.getByRole("button", { name: /mode/i });
    expect(button).toBeInTheDocument();
  });

  it("calls setTheme when clicked", () => {
    render(<ThemeSwitch />);
    const button = screen.getByRole("button", { name: /mode/i });
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
