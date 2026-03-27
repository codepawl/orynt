import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock supabase client
vi.mock("app/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

// Mock community API
vi.mock("app/lib/community", () => ({
  fetchNotifications: vi.fn().mockResolvedValue([]),
  fetchUnreadCount: vi.fn().mockResolvedValue(0),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

import { NotificationBell } from "app/components/ui/NotificationBell";

describe("NotificationBell", () => {
  it("renders nothing when not logged in", () => {
    const { container } = render(<NotificationBell />);
    // Should render nothing since no token
    expect(container.innerHTML).toBe("");
  });
});
