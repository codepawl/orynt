"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "app/lib/supabase/client";

const API_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000"
    : "";

export interface ProfileData {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: string;
  karma: number;
}

interface ProfileContextValue {
  profile: ProfileData | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (
    updates: Partial<Pick<ProfileData, "display_name" | "bio" | "avatar_url">>,
  ) => void;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  updateProfile: () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/community/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setProfile(await res.json());
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
      return;

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        fetchProfile();
      } else if (event === "SIGNED_OUT") {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  const updateProfile = useCallback(
    (
      updates: Partial<Pick<ProfileData, "display_name" | "bio" | "avatar_url">>,
    ) => {
      setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    [],
  );

  return (
    <ProfileContext.Provider
      value={{ profile, loading, refreshProfile, updateProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
