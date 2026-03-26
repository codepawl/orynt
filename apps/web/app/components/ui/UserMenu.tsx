"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dropdown } from "antd";
import { PersonCircle, BoxArrowRight, PersonBadge } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
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
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  const items = [
    {
      key: "profile",
      label: <Link href={`/profile/${username}`}>Profile</Link>,
      icon: <PersonBadge />,
    },
    { type: "divider" as const },
    {
      key: "logout",
      label: "Sign out",
      icon: <BoxArrowRight />,
      onClick: handleLogout,
    },
  ];

  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
      <button
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer border-none bg-transparent"
        type="button"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={username}
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <PersonCircle className="w-7 h-7 text-neutral-500" />
        )}
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 hidden sm:inline">
          {username}
        </span>
      </button>
    </Dropdown>
  );
}
