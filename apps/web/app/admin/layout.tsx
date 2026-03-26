"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Layout, Menu, Button, Typography } from "antd";
import {
  HouseDoor,
  FileEarmarkText,
  Rss,
  ShieldExclamation,
  BoxArrowRight,
} from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { ProtectedRoute } from "app/components/ui/ProtectedRoute";

const { Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: "/admin", icon: <HouseDoor />, label: "Dashboard" },
  { key: "/admin/articles", icon: <FileEarmarkText />, label: "Articles" },
  { key: "/admin/feeds", icon: <Rss />, label: "Feeds" },
  { key: "/admin/moderation", icon: <ShieldExclamation />, label: "Moderation" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Don't wrap login page in admin layout or protection
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Find active key (exact match or starts with)
  const activeKey =
    menuItems.find((item) =>
      item.key === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(item.key)
    )?.key || "/admin";

  return (
    <ProtectedRoute requiredRole="admin">
      <Layout style={{ minHeight: "100vh" }}>
        <Sider
          width={220}
          style={{ background: "inherit" }}
          breakpoint="lg"
          collapsedWidth={0}
        >
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--ant-color-border)" }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <Text strong style={{ fontSize: 16 }}>
                CodePawl Admin
              </Text>
            </Link>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activeKey]}
            style={{ border: "none", background: "transparent" }}
            items={menuItems.map((item) => ({
              ...item,
              label: <Link href={item.key}>{item.label}</Link>,
            }))}
          />
          <div style={{ padding: "16px 24px", position: "absolute", bottom: 0, width: "100%" }}>
            <Button
              type="text"
              icon={<BoxArrowRight />}
              onClick={handleLogout}
              block
              style={{ textAlign: "left" }}
            >
              Logout
            </Button>
          </div>
        </Sider>
        <Content style={{ padding: 24 }}>
          {children}
        </Content>
      </Layout>
    </ProtectedRoute>
  );
}
