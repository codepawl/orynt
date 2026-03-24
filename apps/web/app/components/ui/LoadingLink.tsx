"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Spin } from "antd";

interface LoadingLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function LoadingLink({ href, children, className, style, onClick }: LoadingLinkProps) {
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      onClick();
    }
    startTransition(() => {
      // Navigation will happen automatically via Next.js Link
    });
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={className}
      style={style}
      aria-busy={isPending}
    >
      {isPending ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Spin size="small" />
          {children}
        </span>
      ) : (
        children
      )}
    </Link>
  );
}
