"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "app/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const EXCLUDED_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function EmailVerificationBanner() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!user || user.email_confirmed_at) return null;
  if (EXCLUDED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const handleResend = async () => {
    if (!user.email || resending) return;
    setResending(true);
    const supabase = createClient();
    await supabase.auth.resend({ type: "signup", email: user.email }).catch(() => {});
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  };

  return (
    <div className="w-full px-4 py-2.5 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300 flex items-center justify-center gap-2 flex-wrap">
      <span>Please verify your email address.</span>
      {resent ? (
        <span className="font-medium">Verification email sent!</span>
      ) : (
        <button
          onClick={handleResend}
          disabled={resending}
          className="underline font-medium hover:no-underline disabled:opacity-50 cursor-pointer bg-transparent border-none text-amber-700 dark:text-amber-300 p-0"
        >
          {resending ? "Sending…" : "Resend verification email"}
        </button>
      )}
    </div>
  );
}
