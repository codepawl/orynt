"use client";

import { useEffect, useState } from "react";
import { Button, Card, Table, Tag, Typography, message, Modal } from "antd";
import { createClient } from "app/lib/supabase/client";
import { getBackendApiUrl } from "@codepawl/shared";

const { Title } = Typography;
const API_URL = getBackendApiUrl();

interface FlagItem {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: "post" | "comment";
  reason: string | null;
  status: string;
  created_at: string;
  // Joined data
  reporter_username?: string;
  target_title?: string;
  target_content?: string;
  target_author?: string;
}

export default function ModerationPage() {
  const [flags, setFlags] = useState<FlagItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      // Fetch pending flags with reporter info
      const { data, error } = await supabase
        .from("flags")
        .select(`
          *,
          reporter:profiles!reporter_id(username)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enrich with target info
      const enriched: FlagItem[] = [];
      for (const flag of data || []) {
        const reporter = flag.reporter as unknown as { username: string } | null;
        const item: FlagItem = {
          ...flag,
          reporter_username: reporter?.username,
        };

        if (flag.target_type === "post") {
          const { data: post } = await supabase
            .from("posts")
            .select("title, author:profiles!author_id(username)")
            .eq("id", flag.target_id)
            .single();
          if (post) {
            item.target_title = post.title;
            const author = post.author as unknown as { username: string } | null;
            item.target_author = author?.username;
          }
        } else {
          const { data: comment } = await supabase
            .from("comments")
            .select("content, author:profiles!author_id(username)")
            .eq("id", flag.target_id)
            .single();
          if (comment) {
            item.target_content = comment.content?.substring(0, 100);
            const author = comment.author as unknown as { username: string } | null;
            item.target_author = author?.username;
          }
        }
        enriched.push(item);
      }

      setFlags(enriched);
    } catch {
      message.error("Failed to load flags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const handleAction = async (
    flagId: string,
    action: "remove" | "dismiss"
  ) => {
    const flag = flags.find((f) => f.id === flagId);
    if (!flag) return;

    try {
      const supabase = createClient();

      if (action === "remove") {
        // Delete the target content
        const table = flag.target_type === "post" ? "posts" : "comments";
        await supabase.from(table).delete().eq("id", flag.target_id);
        message.success(`${flag.target_type} removed`);
      }

      // Update flag status
      await supabase
        .from("flags")
        .update({ status: action === "remove" ? "reviewed" : "dismissed" })
        .eq("id", flagId);

      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch {
      message.error("Action failed");
    }
  };

  const columns = [
    {
      title: "Type",
      dataIndex: "target_type",
      key: "type",
      render: (type: string) => (
        <Tag color={type === "post" ? "blue" : "green"}>{type}</Tag>
      ),
    },
    {
      title: "Content",
      key: "content",
      render: (_: unknown, record: FlagItem) =>
        record.target_title || record.target_content || "—",
    },
    {
      title: "Author",
      key: "author",
      dataIndex: "target_author",
    },
    {
      title: "Reported by",
      key: "reporter",
      dataIndex: "reporter_username",
    },
    {
      title: "Reason",
      dataIndex: "reason",
      key: "reason",
      render: (reason: string | null) => reason || "—",
    },
    {
      title: "Date",
      dataIndex: "created_at",
      key: "date",
      render: (date: string) =>
        new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: FlagItem) => (
        <div className="flex gap-2">
          <Button
            danger
            size="small"
            onClick={() => {
              Modal.confirm({
                title: `Remove this ${record.target_type}?`,
                content: "This action cannot be undone.",
                okText: "Remove",
                okType: "danger",
                onOk: () => handleAction(record.id, "remove"),
              });
            }}
          >
            Remove
          </Button>
          <Button
            size="small"
            onClick={() => handleAction(record.id, "dismiss")}
          >
            Dismiss
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Title level={3} style={{ margin: 0 }}>
          Moderation
        </Title>
        <Tag color="orange">{flags.length} pending</Tag>
      </div>
      <Card>
        <Table
          dataSource={flags}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 800 }}
          locale={{ emptyText: "No flagged content" }}
        />
      </Card>
    </div>
  );
}
