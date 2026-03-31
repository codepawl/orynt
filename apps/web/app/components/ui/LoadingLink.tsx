"use client";

import { useTransition } from "react";
import Link from "next/link";

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
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
          {children}
        </span>
      ) : (
        children
      )}
    </Link>
  );
}
