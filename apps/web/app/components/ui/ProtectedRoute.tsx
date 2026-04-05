"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "app/lib/supabase/client";

const API_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000"
    : "";

interface Props {
  children: ReactNode;
  requiredRole?: "admin" | "user";
}

export function ProtectedRoute({ children, requiredRole }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "authorized" | "denied">("loading");

  useEffect(() => {
    const check = async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        // Supabase not configured — redirect to login
        router.push(`/login?redirect=${window.location.pathname}`);
        return;
      }

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push(`/login?redirect=${window.location.pathname}`);
        return;
      }

      if (requiredRole === "admin") {
        try {
          const res = await fetch(`${API_URL}/api/community/me`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const profile = res.ok ? await res.json() : null;
          if (profile?.role !== "admin") {
            setState("denied");
            return;
          }
        } catch {
          setState("denied");
          return;
        }
      }

      setState("authorized");
    };

    check();
  }, [router, requiredRole]);

  if (state === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-neutral-100 rounded-full animate-spin" />
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Access denied</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
