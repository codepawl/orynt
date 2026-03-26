"use client";

import { useEffect, useState } from "react";
import { Button, Card, Col, Row, Statistic, Table, Tag, Typography, Spin, message } from "antd";
import {
  FileEarmarkText,
  Rss,
  CheckCircle,
  ExclamationTriangle,
} from "react-bootstrap-icons";
import { getDashboard, triggerCollectAll } from "./lib/api";
import type { Article, DashboardStats } from "./lib/types";
import Link from "next/link";

const { Title } = Typography;

const STATUS_COLORS: Record<string, string> = {
  draft: "default",
  review: "processing",
  published: "success",
  rejected: "error",
  archived: "warning",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  const loadData = () => {
    getDashboard()
      .then((data) => {
        setStats(data.stats);
        setRecent(data.recent);
      })
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const result = await triggerCollectAll();
      message.success(`Collected ${result.new_articles} new articles from ${result.feeds_processed} feeds`);
      loadData();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setCollecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ minHeight: 300 }}>
        <Spin size="large" />
      </div>
    );
  }

  const columns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      render: (title: string, record: Article) => (
        <Link href={`/admin/articles/${record.id}`}>
          {title || record.original_title}
        </Link>
      ),
      ellipsis: true,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status]}>{status}</Tag>
      ),
    },
    {
      title: "Tags",
      dataIndex: "tags",
      key: "tags",
      ellipsis: true,
      render: (tags: string) =>
        tags
          ? tags.split(",").map((t) => (
              <Tag key={t.trim()} style={{ marginBottom: 2 }}>
                {t.trim()}
              </Tag>
            ))
          : "—",
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      render: (d: string) => new Date(d).toLocaleDateString(),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Dashboard</Title>
        <Button type="primary" loading={collecting} onClick={handleCollect}>
          Collect Now
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Total Articles"
              value={stats?.total_articles || 0}
              prefix={<FileEarmarkText />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Pending Review"
              value={(stats?.draft_count || 0) + (stats?.review_count || 0)}
              prefix={<ExclamationTriangle />}
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Published"
              value={stats?.published_count || 0}
              prefix={<CheckCircle />}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Active Feeds"
              value={stats?.active_feeds || 0}
              prefix={<Rss />}
            />
          </Card>
        </Col>
      </Row>

      <Title level={4} style={{ marginBottom: 16 }}>
        Recent Articles
      </Title>
      <Table
        dataSource={recent}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
      />
    </div>
  );
}
