import { notFound } from "next/navigation";
import { Card, Typography } from "antd";
import { Calendar3, Star } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/server";

const { Title, Text, Paragraph } = Typography;

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
      <Card>
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
            <Title level={3} style={{ marginBottom: 0 }}>
              {profile.display_name || profile.username}
            </Title>
            <Text type="secondary">@{profile.username}</Text>
            {profile.bio && (
              <Paragraph style={{ marginTop: 12 }}>{profile.bio}</Paragraph>
            )}
            <div className="flex items-center gap-4 mt-3 text-sm text-neutral-500">
              <span className="flex items-center gap-1">
                <Star /> {profile.karma} karma
              </span>
              <span className="flex items-center gap-1">
                <Calendar3 /> Joined {joinDate}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
