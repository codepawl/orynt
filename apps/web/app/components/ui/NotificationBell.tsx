"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Bell, BellFill, CheckAll } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "app/lib/community";
import type { Notification } from "@codepawl/shared";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return;
    }

    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    if (!token) {
      setUnreadCount(0);
      return;
    }

    const poll = () => fetchUnreadCount(token).then(setUnreadCount);
    poll();
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [token]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const data = await fetchNotifications(token);
    setNotifications(data);
    setLoading(false);
  }, [token]);

  const handleToggle = () => {
    if (!open) loadNotifications();
    setOpen((v) => !v);
  };

  const handleClickNotification = async (n: Notification) => {
    if (!token || n.is_read) return;
    await markNotificationRead(token, n.id);
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
    );
    setUnreadCount((c) => Math.max(c - 1, 0));
  };

  const handleMarkAllRead = async () => {
    if (!token) return;
    await markAllNotificationsRead(token);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  if (!token) return null;

  const notifLink = (n: Notification) =>
    n.post_id ? `/community/post/${n.post_id}` : "/community";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer border-none bg-transparent"
        type="button"
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <BellFill className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
        ) : (
          <Bell className="w-5 h-5 text-neutral-500" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer bg-transparent border-none flex items-center gap-1"
                type="button"
              >
                <CheckAll /> Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-4 text-center text-sm text-neutral-500">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-neutral-500">No notifications yet</div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {notifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={notifLink(n)}
                    onClick={() => {
                      handleClickNotification(n);
                      setOpen(false);
                    }}
                    className={`block px-4 py-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors no-underline ${
                      n.is_read
                        ? "text-neutral-500 dark:text-neutral-400"
                        : "text-neutral-900 dark:text-neutral-100 bg-blue-50/50 dark:bg-blue-900/10"
                    }`}
                  >
                    <p className="mb-0.5">{n.message}</p>
                    <time className="text-xs text-neutral-400">
                      {new Date(n.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
