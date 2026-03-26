"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Typography } from "antd";
import { Github } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const handleGitHubLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card style={{ maxWidth: 400, width: "100%" }}>
        <Title level={3} style={{ marginBottom: 8 }}>
          Sign in to CodePawl
        </Title>
        <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
          Join the AI/ML community. Sign in with your GitHub account.
        </Text>
        <Button
          type="primary"
          size="large"
          block
          icon={<Github />}
          loading={loading}
          onClick={handleGitHubLogin}
        >
          Sign in with GitHub
        </Button>
      </Card>
    </div>
  );
}
