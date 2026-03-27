import { notFound } from "next/navigation";
import { Calendar3, Star, ArrowDown, Flag } from "react-bootstrap-icons";
import { KARMA_THRESHOLDS } from "@codepawl/shared";
import { createClient } from "app/lib/supabase/server";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return {
    title: `${username} — Profile`,
  };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (error || !profile) {
    notFound();
  }

  const joinDate = new Date(profile.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
        <div className="flex items-start gap-4">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="w-16 h-16 rounded-full"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-2xl font-bold text-neutral-500">
              {profile.username[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-xl font-bold mb-0">
              {profile.display_name || profile.username}
            </h2>
            <p className="text-sm text-neutral-500">@{profile.username}</p>
            {profile.bio && (
              <p className="mt-3 text-neutral-700 dark:text-neutral-300">{profile.bio}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-sm text-neutral-500">
              <span className="flex items-center gap-1">
                <Star /> {profile.karma} karma
              </span>
              <span className="flex items-center gap-1">
                <Calendar3 /> Joined {joinDate}
              </span>
            </div>
            {/* Karma privilege indicators */}
            <div className="flex items-center gap-3 mt-2 text-xs text-neutral-400 dark:text-neutral-500">
              <span className={`flex items-center gap-1 ${profile.karma >= KARMA_THRESHOLDS.DOWNVOTE ? "text-green-600 dark:text-green-400" : ""}`}>
                <ArrowDown />
                {profile.karma >= KARMA_THRESHOLDS.DOWNVOTE
                  ? "Can downvote"
                  : `${KARMA_THRESHOLDS.DOWNVOTE - profile.karma} karma to downvote`}
              </span>
              <span className={`flex items-center gap-1 ${profile.karma >= KARMA_THRESHOLDS.FLAG ? "text-green-600 dark:text-green-400" : ""}`}>
                <Flag />
                {profile.karma >= KARMA_THRESHOLDS.FLAG
                  ? "Can flag"
                  : `${KARMA_THRESHOLDS.FLAG - profile.karma} karma to flag`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
