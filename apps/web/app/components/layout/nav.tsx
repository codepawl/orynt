"use client";

import React, { useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Flex, Spin } from "antd";
import { useTheme } from "next-themes";
import { ThemeSwitch } from "../ui/theme-switch";
import { useNavigation } from "../ui/NavigationContext";
import { InlineLogo } from "./InlineLogo";
import { metaData } from "../../config";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const { setNavigating, isNavigating } = useNavigation();
  const isActive = pathname === href || pathname.startsWith(href + "/");
  const clickRef = useRef<boolean>(false);

  // Reset click lock when pathname changes (navigation completed)
  useEffect(() => {
    clickRef.current = false;
  }, [pathname]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname === href) {
      e.preventDefault();
      return;
    }
    if (isNavigating || isPending || clickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    clickRef.current = true;
    setNavigating(true);
    startTransition(() => {});
  };

  const isDisabled = isNavigating || isPending;

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={isActive ? "ant-menu-item-selected nav-link-active" : "nav-link"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        textDecoration: "none",
        opacity: isDisabled && !isActive ? 0.5 : 1,
        pointerEvents: isDisabled && !isActive ? "none" : "auto",
        cursor: isDisabled && !isActive ? "not-allowed" : "pointer",
        transition: "opacity 0.2s ease",
        padding: "8px 12px",
        margin: "-8px -12px",
      }}
      aria-disabled={isDisabled && !isActive}
    >
      {(isPending || (isNavigating && !isActive)) && <Spin size="small" />}
      {children}
    </Link>
  );
}

const navItems = [
  { label: <NavLink href="/profile">Profile</NavLink>, key: "/profile" },
  { label: <NavLink href="/blog">Blog</NavLink>, key: "/blog" },
  { label: <NavLink href="/projects">Projects</NavLink>, key: "/projects" },
];

export function Navbar() {
  const pathname = usePathname();
  const { theme, systemTheme } = useTheme();
  const { setNavigating } = useNavigation();

  // Find the active key based on the current path
  const activeKey = navItems.find((item) => pathname.startsWith(item.key))?.key;

  useEffect(() => {
    const updateMenuColors = () => {
      const isDark = document.documentElement.classList.contains("dark");
      const selectedLinks = document.querySelectorAll(
        ".ant-menu-item-selected .ant-menu-title-content a, .ant-menu-title-content a.ant-menu-item-selected"
      );
      
      selectedLinks.forEach((link) => {
        const element = link as HTMLElement;
        if (isDark) {
          element.style.setProperty("color", "rgba(255, 255, 255, 1)", "important");
        } else {
          element.style.setProperty("color", "rgba(0, 0, 0, 0.88)", "important");
        }
      });
    };

    updateMenuColors();
    const observer = new MutationObserver(updateMenuColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [theme, systemTheme]);

  const { isNavigating } = useNavigation();

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isNavigating) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (pathname !== "/") {
      setNavigating(true);
    }
  };

  return (
    <nav className="mb-8 py-5">
      <Flex justify="space-between" align="center">
        <Link 
          href="/" 
          onClick={handleLogoClick}
          className="text-xl font-sans font-bold text-inherit no-underline flex items-center gap-2 hover:text-inherit transition-opacity duration-200 hover:opacity-70"
        >
          <InlineLogo size={32} />
          {metaData.title}
        </Link>
        <Flex align="center" gap="middle">
          <Menu
            mode="horizontal"
            selectedKeys={activeKey ? [activeKey] : []}
            items={navItems}
            theme={undefined}
            style={{
                borderBottom: "none",
                backgroundColor: "transparent",
                justifyContent: "flex-end"
            }}
          />
          <ThemeSwitch />
        </Flex>
      </Flex>
    </nav>
  );
}
