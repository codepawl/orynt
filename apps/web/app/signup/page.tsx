"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "app/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Email is required"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?type=signup`,
      },
    });
    setLoading(false);
    if (err) {
      if (err.message.toLowerCase().includes("already registered") || err.message.toLowerCase().includes("already exists")) {
        setError("An account with this email exists. Try signing in with GitHub instead.");
      } else {
        setError(err.message);
      }
    } else {
      setSuccess(true);
    }
  };

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm";

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-800 p-8">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2 text-center">
          Create an account
        </h2>

        {success ? (
          <div className="mt-4 text-center space-y-3">
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Check your email to confirm your account.
            </p>
            <Link
              href="/login"
              className="block text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 text-center">
              Join the AI/ML community.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
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
                placeholder="Password (min. 8 characters)"
                autoComplete="new-password"
                className={inputClass}
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
                className={inputClass}
              />

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer border-none"
              >
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-neutral-900 dark:text-neutral-100 hover:opacity-80 transition-opacity">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
