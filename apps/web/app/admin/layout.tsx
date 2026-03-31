"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  HouseDoor,
  FileEarmarkText,
  Rss,
  ShieldExclamation,
  BoxArrowRight,
} from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { ProtectedRoute } from "app/components/ui/ProtectedRoute";
import { ToastProvider } from "./components/Toast";

const navItems = [
  { href: "/admin", icon: HouseDoor, label: "Dashboard" },
  { href: "/admin/articles", icon: FileEarmarkText, label: "Articles" },
  { href: "/admin/feeds", icon: Rss, label: "Feeds" },
  { href: "/admin/moderation", icon: ShieldExclamation, label: "Moderation" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

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
            {navItems.map(({ href, icon: Icon, label }) => {
              const active =
                href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-6 py-2.5 text-sm no-underline transition-colors ${
                    active
                      ? "text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800 font-medium"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </Link>
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
