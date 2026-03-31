"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PersonCircle, BoxArrowRight, PersonBadge, ShieldLock, GearFill } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const API_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000"
    : "";

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setLoading(false);
      return;
    }

    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.access_token) {
        fetch(`${API_URL}/api/community/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((profile) => {
            if (profile?.role === "admin") setIsAdmin(true);
          })
          .catch(() => {});
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        setIsAdmin(false);
        return;
      }
      fetch(`${API_URL}/api/community/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((profile) => setIsAdmin(profile?.role === "admin"))
        .catch(() => {});
    });

    return () => subscription.unsubscribe();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="px-3 py-1.5 text-sm font-medium rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-80 transition-opacity no-underline"
      >
        Sign in
      </Link>
    );
  }

  const username =
    user.user_metadata?.user_name || user.user_metadata?.preferred_username || "user";
  const avatarUrl = user.user_metadata?.avatar_url;

  const handleLogout = async () => {
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut().catch(() => {});
    router.push("/");
    router.refresh();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer border-none bg-transparent"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={username} className="w-7 h-7 rounded-full" />
        ) : (
          <PersonCircle className="w-7 h-7 text-neutral-500" />
        )}
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 hidden sm:inline">
          {username}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
          <Link
            href={`/profile/${username}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            <PersonBadge size={14} />
            Profile
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            <GearFill size={14} />
            Settings
          </Link>
          {isAdmin && (
            <>
              <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
              >
                <ShieldLock size={14} />
                Admin
              </Link>
            </>
          )}
          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors w-full text-left"
          >
            <BoxArrowRight size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
