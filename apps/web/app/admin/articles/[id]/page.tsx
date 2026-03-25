"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Button, Card, Col, Input, Row, Space, Spin, Tag, Typography, message,
} from "antd";
import { ArrowLeft, XCircle, CheckCircle } from "react-bootstrap-icons";
import {
  getArticle, updateArticle, changeArticleStatus,
} from "../../lib/api";
import type { Article } from "../../lib/types";

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_COLORS: Record<string, string> = {
  draft: "default",
  review: "processing",
  published: "success",
  rejected: "error",
  archived: "warning",
};

export default function ArticleEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");

  useEffect(() => {
    getArticle(id)
      .then((a) => {
        setArticle(a);
        setTitle(a.title || a.original_title || "");
        setSlug(a.slug || "");
        setSummary(a.summary || "");
        setTags(a.tags || "");
        setImageUrl(a.image_url || "");
        setMetaTitle(a.meta_title || "");
        setMetaDescription(a.meta_description || "");
      })
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateArticle(id, {
        title, slug, summary, tags, image_url: imageUrl,
        meta_title: metaTitle, meta_description: metaDescription,
      } as any);
      setArticle({ ...article, ...updated } as Article);
      message.success("Saved");
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const updated = await changeArticleStatus(id, newStatus);
      setArticle({ ...article, ...updated } as Article);
      message.success(`Status → ${newStatus}`);
    } catch (err: any) {
      message.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ minHeight: 300 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!article) {
    return <Text>Article not found</Text>;
  }

  return (
    <div>
      <div className="flex items-center gap-4" style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeft />} onClick={() => router.push("/admin/articles")}>
          Back
        </Button>
        <Title level={4} style={{ margin: 0, flex: 1 }} ellipsis>
          {title}
        </Title>
        <Tag color={STATUS_COLORS[article.status]}>{article.status}</Tag>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Content" size="small">
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Title</Text>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Slug</Text>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Summary</Text>
                <TextArea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Tags (comma-separated)</Text>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Card title="Actions" size="small">
              <Space direction="vertical" style={{ width: "100%" }}>
                <Button type="primary" block loading={saving} onClick={handleSave}>
                  Save
                </Button>
                {(article.status === "draft" || article.status === "review") && (
                  <Button
                    block
                    type="primary"
                    icon={<CheckCircle />}
                    onClick={() => handleStatusChange("published")}
                  >
                    Publish
                  </Button>
                )}
                {article.status === "draft" && (
                  <Button block icon={<CheckCircle />} onClick={() => handleStatusChange("review")}>
                    Move to Review
                  </Button>
                )}
                {article.status !== "rejected" && article.status !== "published" && (
                  <Button block danger icon={<XCircle />} onClick={() => handleStatusChange("rejected")}>
                    Reject
                  </Button>
                )}
              </Space>
            </Card>

            <Card title="SEO" size="small">
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Meta Title ({metaTitle.length}/60)
                  </Text>
                  <Input
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    maxLength={60}
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Meta Description ({metaDescription.length}/155)
                  </Text>
                  <TextArea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    maxLength={155}
                    rows={3}
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Image URL</Text>
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
                </div>
              </Space>
            </Card>

            <Card title="Source" size="small">
              <Text type="secondary" style={{ fontSize: 12 }}>Original URL</Text>
              <div>
                <a href={article.original_url} target="_blank" rel="noopener noreferrer">
                  {article.original_url}
                </a>
              </div>
              {article.original_published_at && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Published</Text>
                  <div>{new Date(article.original_published_at).toLocaleDateString()}</div>
                </div>
              )}
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
}
