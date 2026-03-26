"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Radio, Select, Typography, message } from "antd";
import { createClient } from "app/lib/supabase/client";
import { createPost } from "app/lib/community";
import { CATEGORIES } from "@codepawl/shared";

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function SubmitPage() {
  const router = useRouter();
  const [type, setType] = useState<"link" | "text" | "show">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter out 'general' for user selection
  const tagOptions = CATEGORIES.filter((c) => c !== "general").map((c) => ({
    label: c,
    value: c,
  }));

  const handleSubmit = async () => {
    if (!title.trim()) {
      message.error("Title is required");
      return;
    }
    if (type === "link" && !url.trim()) {
      message.error("URL is required for link posts");
      return;
    }
    if (type !== "link" && !content.trim()) {
      message.error("Content is required");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        message.error("Please sign in first");
        router.push("/login?redirect=/community/submit");
        return;
      }

      const post = await createPost(session.access_token, {
        type,
        title: title.trim(),
        url: type === "link" ? url.trim() : undefined,
        content: type !== "link" ? content.trim() : undefined,
        tags: selectedTags.join(", "),
      });

      message.success("Post created!");
      router.push(`/community/post/${post.id}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full">
      <Title level={2}>Submit to Community</Title>
      <Card>
        <div className="space-y-4">
          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              Post type
            </Text>
            <Radio.Group
              value={type}
              onChange={(e) => setType(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="link">Link</Radio.Button>
              <Radio.Button value="text">Text</Radio.Button>
              <Radio.Button value="show">Show CodePawl</Radio.Button>
            </Radio.Group>
          </div>

          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              Title
            </Text>
            <Input
              size="large"
              placeholder="What's interesting?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              showCount
            />
          </div>

          {type === "link" ? (
            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                URL
              </Text>
              <Input
                size="large"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                Content
              </Text>
              <TextArea
                rows={6}
                placeholder={
                  type === "show"
                    ? "Tell the community about what you've built..."
                    : "Share your thoughts..."
                }
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={10000}
                showCount
              />
            </div>
          )}

          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              Tags (optional)
            </Text>
            <Select
              mode="multiple"
              placeholder="Select tags"
              options={tagOptions}
              value={selectedTags}
              onChange={setSelectedTags}
              style={{ width: "100%" }}
              maxCount={6}
            />
          </div>

          <Button
            type="primary"
            size="large"
            block
            loading={loading}
            onClick={handleSubmit}
          >
            Submit
          </Button>
        </div>
      </Card>
    </div>
  );
}
