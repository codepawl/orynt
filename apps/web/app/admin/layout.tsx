"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  HouseDoor,
  FileEarmarkText,
  Rss,
  ShieldExclamation,
  BoxArrowRight,
  JournalText,
  People,
  ChevronDown,
  ChevronRight,
} from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { ProtectedRoute } from "app/components/ui/ProtectedRoute";
import { ToastProvider } from "./components/Toast";

type NavLink = {
  type: "link";
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
};

type NavGroup = {
  type: "group";
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  prefixes: string[];
  children: { href: string; label: string }[];
};

type NavItem = NavLink | NavGroup;

const NAV: NavItem[] = [
  { type: "link", href: "/admin", icon: HouseDoor, label: "Dashboard" },
  {
    type: "group",
    label: "Content",
    icon: FileEarmarkText,
    prefixes: ["/admin/blog", "/admin/articles"],
    children: [
      { href: "/admin/blog", label: "Blog Posts" },
      { href: "/admin/articles", label: "News Articles" },
    ],
  },
  {
    type: "group",
    label: "Community",
    icon: People,
    prefixes: ["/admin/community", "/admin/moderation"],
    children: [
      { href: "/admin/community", label: "Posts" },
      { href: "/admin/moderation", label: "Moderation" },
    ],
  },
  { type: "link", href: "/admin/feeds", icon: Rss, label: "Feeds" },
];

const LINK_CLS = (active: boolean) =>
  `flex items-center gap-3 px-6 py-2.5 text-sm no-underline transition-colors ${
    active
      ? "text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800 font-medium"
      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-900"
  }`;

const CHILD_CLS = (active: boolean) =>
  `flex items-center pl-11 pr-6 py-2 text-sm no-underline transition-colors ${
    active
      ? "text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800 font-medium"
      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-900"
  }`;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Auto-expand groups when current path is inside them
  const defaultOpen = (group: NavGroup) =>
    group.prefixes.some((p) => pathname.startsWith(p));

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    NAV.forEach((item) => {
      if (item.type === "group") init[item.label] = defaultOpen(item);
    });
    return init;
  });

  // Keep groups open when navigating into them
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      NAV.forEach((item) => {
        if (item.type === "group" && defaultOpen(item)) {
          next[item.label] = true;
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="flex min-h-screen bg-white dark:bg-neutral-950">
        <aside className="w-[220px] shrink-0 border-r border-neutral-200 dark:border-neutral-800 flex flex-col">
          <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <Link
              href="/"
              className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 no-underline"
            >
              CodePawl Admin
            </Link>
          </div>

          <nav className="flex-1 py-2">
            {NAV.map((item) => {
              if (item.type === "link") {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={LINK_CLS(active)}>
                    <item.icon size={15} />
                    {item.label}
                  </Link>
                );
              }

              // group
              const isOpen = openGroups[item.label] ?? false;
              const groupActive = item.prefixes.some((p) => pathname.startsWith(p));

              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.label)}
                    className={`w-full flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                      groupActive
                        ? "text-neutral-900 dark:text-neutral-100 font-medium"
                        : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                    } hover:bg-neutral-50 dark:hover:bg-neutral-900`}
                  >
                    <item.icon size={15} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </button>

                  {isOpen && (
                    <div>
                      {item.children.map((child) => {
                        const childActive = pathname.startsWith(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={CHILD_CLS(childActive)}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="px-4 py-4 border-t border-neutral-200 dark:border-neutral-800">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-2 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <BoxArrowRight size={15} />
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 p-6 min-w-0">
          {children}
        </main>
        <ToastProvider />
      </div>
    </ProtectedRoute>
  );
}
