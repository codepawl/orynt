"use client";

import { useTransition } from "react";
import Link from "next/link";
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

  const handleClick = () => {
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
