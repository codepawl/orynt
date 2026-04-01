import { notFound } from "next/navigation";
import Link from "next/link";
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

  const [{ data: profile, error }, { data: { user } }] = await Promise.all([
    supabase.from("profiles").select("*").eq("username", username).single(),
    supabase.auth.getUser(),
  ]);

  if (error || !profile) {
    notFound();
  }

  const isOwnProfile = user?.id === profile.id;

  // Fetch recent posts by this user
  const { data: recentPosts } = await supabase
    .from("posts")
    .select("id, title, created_at, vote_count")
    .eq("author_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(10);

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
              className="w-32 h-32 rounded-full object-cover"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-5xl font-bold text-neutral-500">
              {profile.username[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold mb-0">
                {profile.display_name || profile.username}
              </h2>
              {isOwnProfile && (
                <Link
                  href="/settings"
                  className="text-xs px-2.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
                >
                  Edit profile →
                </Link>
              )}
            </div>
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

      {/* Recent posts */}
      {recentPosts && recentPosts.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
          <h3 className="text-lg font-semibold mb-4">Recent posts</h3>
          <ul className="space-y-3">
            {recentPosts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/community/post/${post.id}`}
                  className="flex items-center justify-between gap-4 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-md px-3 py-2 -mx-3 transition-colors no-underline"
                >
                  <span className="text-neutral-900 dark:text-neutral-100 truncate">
                    {post.title}
                  </span>
                  <span className="text-xs text-neutral-400 shrink-0">
                    {new Date(post.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
