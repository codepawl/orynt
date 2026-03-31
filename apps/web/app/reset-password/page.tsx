"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "app/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/forgot-password");
      } else {
        setCheckingSession(false);
      }
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    }
  };

  if (checkingSession) return null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-800 p-8">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
          Set new password
        </h2>

        {success ? (
          <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">
            Password updated! Redirecting to sign in…
          </p>
        ) : (
          <>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              Choose a new password for your account.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
                  New password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer border-none"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
