"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Typography, Button, Space, Flex } from "antd";

const { Title, Text } = Typography;

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error detected:", error);
  }, [error]);

  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh]">
      <Flex
        vertical
        align="center"
        gap="middle"
        style={{ maxWidth: 448, padding: "0 16px", textAlign: "center" }}
      >
        <Title
          level={1}
          className="text-neutral-900 dark:text-neutral-100"
          style={{ margin: 0 }}
        >
          Something went wrong
        </Title>
        <Text
          className="text-neutral-600 dark:text-neutral-400"
          style={{ fontSize: 16 }}
        >
          An unexpected error occurred. Don&apos;t worry, it happens to the best of us.
        </Text>
        <Text
          type="secondary"
          className="text-neutral-500 dark:text-neutral-500"
          style={{ fontSize: 14 }}
        >
          Error: {error.message || "Unknown error"}
        </Text>
        <Space size="middle" wrap>
          <Button type="primary" onClick={reset}>
            Try again
          </Button>
          <Link href="/">
            <Button type="default">Go home</Button>
          </Link>
        </Space>
      </Flex>
    </section>
  );
}
