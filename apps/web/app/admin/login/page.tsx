"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Typography, message } from "antd";
import { loginWithKey } from "../lib/api";

const { Title, Text } = Typography;

export default function AdminLogin() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!key.trim()) return;

    setLoading(true);
    try {
      await loginWithKey(key.trim());
      message.success("Authenticated");
      router.push("/admin");
    } catch {
      message.error("Invalid API key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-[#141414] px-4">
      <Card style={{ maxWidth: 400, width: "100%" }}>
        <Title level={3} style={{ marginBottom: 8 }}>
          Admin Login
        </Title>
        <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
          Enter your admin API key to continue.
        </Text>
        <Input.Password
          size="large"
          placeholder="API Key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onPressEnter={handleLogin}
          style={{ marginBottom: 16 }}
        />
        <Button
          type="primary"
          size="large"
          block
          loading={loading}
          onClick={handleLogin}
        >
          Login
        </Button>
      </Card>
    </div>
  );
}
