"use client";

import { useEffect, useState } from "react";
import {
  Table, Button, Tag, Modal, Form, Input, Select, Switch, Space,
  Typography, message, Popconfirm,
} from "antd";
import { Plus, Trash, ArrowRepeat, PlayCircle } from "react-bootstrap-icons";
import { getFeeds, createFeed, updateFeed, deleteFeed, fetchFeed } from "../lib/api";
import type { Feed } from "../lib/types";

const { Title } = Typography;

export default function FeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [fetchingId, setFetchingId] = useState<string | null>(null);

  const loadFeeds = async () => {
    setLoading(true);
    try {
      const data = await getFeeds();
      setFeeds(data);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeeds();
  }, []);

  const handleAdd = async () => {
    try {
      const values = await form.validateFields();
      await createFeed(values);
      message.success("Feed added");
      form.resetFields();
      setModalOpen(false);
      loadFeeds();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    }
  };

  const handleToggle = async (feed: Feed) => {
    try {
      await updateFeed(feed.id, { is_active: !feed.is_active });
      message.success(feed.is_active ? "Deactivated" : "Activated");
      loadFeeds();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFeed(id);
      message.success("Deleted");
      loadFeeds();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleFetch = async (feed: Feed) => {
    setFetchingId(feed.id);
    try {
      const result = await fetchFeed(feed.id);
      message.success(
        `${result.feed}: ${result.new_articles} new, ${result.skipped_duplicates} skipped`
      );
      loadFeeds();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setFetchingId(null);
    }
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      width: 120,
      render: (c: string) => <Tag>{c}</Tag>,
    },
    {
      title: "Active",
      dataIndex: "is_active",
      key: "is_active",
      width: 80,
      render: (active: boolean, record: Feed) => (
        <Switch size="small" checked={active} onChange={() => handleToggle(record)} />
      ),
    },
    {
      title: "Last Fetched",
      dataIndex: "last_fetched_at",
      key: "last_fetched_at",
      width: 140,
      render: (d: string | null) => d ? new Date(d).toLocaleString() : "Never",
    },
    {
      title: "Errors",
      dataIndex: "error_count",
      key: "error_count",
      width: 80,
      render: (count: number) =>
        count > 0 ? <Tag color="error">{count}</Tag> : <Tag color="success">0</Tag>,
    },
    {
      title: "",
      key: "actions",
      width: 120,
      render: (_: unknown, record: Feed) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<PlayCircle />}
            loading={fetchingId === record.id}
            onClick={() => handleFetch(record)}
          />
          <Popconfirm title="Delete this feed?" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" size="small" danger icon={<Trash />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Feeds</Title>
        <Space>
          <Button icon={<ArrowRepeat />} onClick={loadFeeds} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<Plus />} onClick={() => setModalOpen(true)}>
            Add Feed
          </Button>
        </Space>
      </div>

      <Table
        dataSource={feeds}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
      />

      <Modal
        title="Add RSS Feed"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        okText="Add"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. HuggingFace Blog" />
          </Form.Item>
          <Form.Item name="url" label="RSS URL" rules={[{ required: true, type: "url" }]}>
            <Input placeholder="https://example.com/feed.xml" />
          </Form.Item>
          <Form.Item name="category" label="Category" initialValue="general">
            <Select options={[
              { label: "General", value: "general" },
              { label: "Research", value: "research" },
              { label: "Tools", value: "tools" },
              { label: "Industry", value: "industry" },
              { label: "Tutorials", value: "tutorials" },
              { label: "Hardware", value: "hardware" },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
