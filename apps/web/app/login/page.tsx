"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "app/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const errorParam = searchParams.get("error");

  const [oauthLoading, setOauthLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState(
    errorParam === "auth_failed" ? "Authentication failed. Please try again." :
    errorParam === "invalid_link" ? "The link is invalid or has expired." :
    ""
  );

  const handleGitHubLogin = async () => {
    setOauthLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Email and password are required"); return; }
    setEmailLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setEmailLoading(false);
    if (err) {
      if (err.message.toLowerCase().includes("invalid login credentials") || err.message.toLowerCase().includes("invalid credentials")) {
        setError("Invalid email or password. No password set? Try GitHub sign-in or use forgot password.");
      } else {
        setError(err.message);
      }
    } else {
      router.push(redirect);
      router.refresh();
    }
  };

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm";

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-800 p-8">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2 text-center">
          Sign in to CodePawl
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 text-center">
          Join the AI/ML community.
        </p>

        {error && (
          <p className="mb-4 text-sm text-red-500 text-center">{error}</p>
        )}

        {/* GitHub OAuth */}
        <button
          onClick={handleGitHubLogin}
          disabled={oauthLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50 cursor-pointer border-none"
        >
          <svg viewBox="0 0 16 16" className="w-5 h-5 fill-current">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          {oauthLoading ? "Redirecting…" : "Sign in with GitHub"}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
          <span className="text-xs text-neutral-400 dark:text-neutral-500">or sign in with email</span>
          <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
        </div>

        {/* Email / password */}
        <form onSubmit={handleEmailLogin} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={emailLoading}
            className="w-full px-4 py-2.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer bg-transparent"
          >
            {emailLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <Link href="/forgot-password" className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
            Forgot password?
          </Link>
          <span>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-neutral-900 dark:text-neutral-100 hover:opacity-80 transition-opacity">
              Sign up
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
