"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table, Tag, Button, Input, Select, Space, Typography, message, Popconfirm,
} from "antd";
import { Trash, ArrowRepeat } from "react-bootstrap-icons";
import {
  getArticles, bulkChangeStatus, deleteArticle,
} from "../lib/api";
import type { Article, PaginatedResponse } from "../lib/types";

const { Title } = Typography;
const { Search } = Input;

const STATUS_COLORS: Record<string, string> = {
  draft: "default",
  review: "processing",
  published: "success",
  rejected: "error",
  archived: "warning",
};

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Review", value: "review" },
  { label: "Published", value: "published" },
  { label: "Rejected", value: "rejected" },
  { label: "Archived", value: "archived" },
];

export default function ArticlesPage() {
  const router = useRouter();
  const [data, setData] = useState<PaginatedResponse<Article>>({
    items: [], total: 0, page: 1, page_size: 20, total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getArticles({ status, search, page, page_size: 20 });
      setData(result);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBulkStatus = async (newStatus: string) => {
    if (selectedIds.length === 0) return;
    try {
      await bulkChangeStatus(selectedIds, newStatus);
      message.success(`Updated ${selectedIds.length} articles`);
      setSelectedIds([]);
      fetchData();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteArticle(id);
      message.success("Deleted");
      fetchData();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const columns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      render: (title: string, record: Article) => (
        <a onClick={() => router.push(`/admin/articles/${record.id}`)}>
          {title || record.original_title}
        </a>
      ),
      ellipsis: true,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    {
      title: "Tags",
      dataIndex: "tags",
      key: "tags",
      width: 200,
      ellipsis: true,
      render: (tags: string) =>
        tags ? tags.split(",").slice(0, 3).map((t) => (
          <Tag key={t.trim()} style={{ marginBottom: 2 }}>{t.trim()}</Tag>
        )) : "—",
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      width: 120,
      render: (d: string) => new Date(d).toLocaleDateString(),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, record: Article) => (
        <Popconfirm title="Delete this article?" onConfirm={() => handleDelete(record.id)}>
          <Button type="text" size="small" danger icon={<Trash />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Articles</Title>
        <Button icon={<ArrowRepeat />} onClick={fetchData} loading={loading}>
          Refresh
        </Button>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={STATUS_OPTIONS}
          style={{ width: 130 }}
          placeholder="Status"
        />
        <Search
          placeholder="Search articles..."
          onSearch={(v) => { setSearch(v); setPage(1); }}
          allowClear
          style={{ width: 250 }}
        />
        {selectedIds.length > 0 && (
          <>
            <Button onClick={() => handleBulkStatus("review")} type="primary" ghost>
              Move to Review ({selectedIds.length})
            </Button>
            <Button onClick={() => handleBulkStatus("rejected")} danger ghost>
              Reject ({selectedIds.length})
            </Button>
          </>
        )}
      </Space>

      <Table
        dataSource={data.items}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as string[]),
        }}
        pagination={{
          current: data.page,
          total: data.total,
          pageSize: data.page_size,
          onChange: (p) => setPage(p),
          showSizeChanger: false,
        }}
      />
    </div>
  );
}
