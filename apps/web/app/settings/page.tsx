"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "app/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { AvatarUpload } from "./AvatarUpload";

const API_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000"
    : "";

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: string;
  karma: number;
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);

  // Profile section
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileError, setProfileError] = useState("");

  // Email section
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [emailError, setEmailError] = useState("");

  // Password section
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Account section
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login?redirect=/settings");
        return;
      }
      setUser(session.user);
      setToken(session.access_token);
      try {
        const res = await fetch(`${API_URL}/api/community/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const p: Profile = await res.json();
          setProfile(p);
          setDisplayName(p.display_name ?? "");
          setBio(p.bio ?? "");
          setAvatarUrl(p.avatar_url ?? "");
        }
      } catch {
        // non-fatal
      }
      setLoading(false);
    });
  }, [router]);

  // Show email update success from /auth/confirm redirect
  useEffect(() => {
    if (searchParams.get("email_updated") === "1") {
      setEmailMsg("Email updated successfully.");
    }
  }, [searchParams]);

  const isOAuthOnly = (u: User) =>
    !u.identities?.some((id) => id.provider === "email");

  const handleProfileSave = async () => {
    if (!user) return;
    setProfileSaving(true);
    setProfileError("");
    setProfileMsg("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch(`${API_URL}/api/community/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      setProfileMsg("Profile updated.");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleEmailChange = async () => {
    if (!newEmail.trim()) { setEmailError("Email is required"); return; }
    setEmailSaving(true);
    setEmailError("");
    setEmailMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailSaving(false);
    if (error) {
      setEmailError(error.message);
    } else {
      setEmailMsg("Check your new email for a confirmation link.");
      setNewEmail("");
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) { setPasswordError("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match"); return; }
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordMsg("Password updated.");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto w-full py-8 px-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-neutral-100 dark:bg-neutral-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm";
  const primaryBtn =
    "px-5 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer border-none";
  const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5";

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-8">Settings</h1>

      {/* Profile */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Profile</h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Username</label>
            <input
              type="text"
              value={profile?.username ?? ""}
              disabled
              className={`${inputClass} opacity-50 cursor-not-allowed`}
            />
            <p className="text-xs text-neutral-400 mt-1">Username cannot be changed.</p>
          </div>
          <div>
            <label className={labelClass}>Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
              className={inputClass}
            />
            <p className="text-xs text-neutral-400 mt-1 text-right">{displayName.length}/50</p>
          </div>
          <div>
            <label className={labelClass}>Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short bio…"
              maxLength={300}
              rows={3}
              className={`${inputClass} resize-none`}
            />
            <p className="text-xs text-neutral-400 mt-1 text-right">{bio.length}/300</p>
          </div>
          <AvatarUpload
            currentUrl={avatarUrl || null}
            username={profile?.username ?? ""}
            token={token}
            onUploaded={(url) => setAvatarUrl(url)}
            onRemoved={() => setAvatarUrl("")}
          />
          {profileError && <p className="text-sm text-red-500">{profileError}</p>}
          {profileMsg && <p className="text-sm text-green-600 dark:text-green-400">{profileMsg}</p>}
          <button onClick={handleProfileSave} disabled={profileSaving} className={primaryBtn}>
            {profileSaving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </section>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      {/* Email */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Email</h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Current email</label>
            <input
              type="email"
              value={user?.email ?? ""}
              disabled
              className={`${inputClass} opacity-50 cursor-not-allowed`}
            />
          </div>
          <div>
            <label className={labelClass}>New email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@example.com"
              className={inputClass}
            />
          </div>
          {emailError && <p className="text-sm text-red-500">{emailError}</p>}
          {emailMsg && <p className="text-sm text-green-600 dark:text-green-400">{emailMsg}</p>}
          <button onClick={handleEmailChange} disabled={emailSaving} className={primaryBtn}>
            {emailSaving ? "Sending…" : "Change email"}
          </button>
        </div>
      </section>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      {/* Password */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
          {user && isOAuthOnly(user) ? "Set a password" : "Change password"}
        </h2>
        {user && isOAuthOnly(user) && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
            Set a password to enable email/password sign-in.
          </p>
        )}
        <div className="space-y-4 mt-4">
          <div>
            <label className={labelClass}>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
          {passwordMsg && <p className="text-sm text-green-600 dark:text-green-400">{passwordMsg}</p>}
          <button onClick={handlePasswordChange} disabled={passwordSaving} className={primaryBtn}>
            {passwordSaving ? "Updating…" : "Update password"}
          </button>
        </div>
      </section>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      {/* Account */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Account</h2>
        {showDeleteConfirm ? (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 space-y-3">
            <p className="text-sm text-red-700 dark:text-red-300">
              To delete your account, email{" "}
              <a href="mailto:hello@codepawl.com" className="underline">
                hello@codepawl.com
              </a>{" "}
              from your registered address. We&apos;ll process it within 48 hours.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-5 py-2.5 rounded-md border border-red-300 dark:border-red-800 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors cursor-pointer bg-transparent"
          >
            Delete account
          </button>
        )}
      </section>
    </div>
  );
}
