"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Card, Flex, Typography } from "antd";
import { useNavigation } from "./NavigationContext";

const { Text } = Typography;

export interface ContentCardProps {
  title: string;
  description?: string;
  date?: string;
  year?: number | string;
  href: string;
  image?: string;
  initials?: string;
  onClick?: (e: React.MouseEvent) => void;
  external?: boolean;
  className?: string;
}

export function ContentCard({
  title,
  description,
  date,
  year,
  href,
  image,
  initials,
  onClick,
  external = false,
  className = "",
}: ContentCardProps) {
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const pathname = usePathname();
  const { setNavigating, isNavigating } = useNavigation();
  const clickRef = useRef<boolean>(false);

  // Generate initials from title if not provided
  const displayInitials = initials || 
    title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "BL";

  // Reset click lock when navigation completes (pathname changes)
  useEffect(() => {
    clickRef.current = false;
    setNavigating(false);
  }, [pathname, setNavigating]);

  // Check if description is truncated
  useEffect(() => {
    const checkTruncation = () => {
      if (descriptionRef.current && description) {
        const element = descriptionRef.current;
        const isTextTruncated = element.scrollHeight > element.clientHeight;
        setIsTruncated(isTextTruncated);
      } else {
        setIsTruncated(false);
      }
    };

    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [description]);

  const thumbClassName = "w-32 h-32";
  const displayDate = date || (year ? String(year) : "");

  const isDisabled = isNavigating && pathname !== href && !pathname.startsWith(href + "/");
  
  const cardContent = (
    <Card
      hoverable={!isDisabled}
      size="small"
      style={{ 
        width: "100%", 
        cursor: isDisabled ? "not-allowed" : "pointer", 
        backgroundColor: "transparent", 
        minHeight: "180px",
        height: "100%",
        opacity: isDisabled ? 0.6 : 1,
        transition: "opacity 0.2s ease",
      }}
      className={`card-shadow-offset ${className}`}
    >
      <div className="flex gap-4 items-stretch" style={{ height: "100%", flex: 1 }}>
        <div
          className={`relative ${thumbClassName} rounded-lg overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex-shrink-0 flex items-center justify-center`}
          aria-hidden="true"
        >
          {image ? (
            <Image
              src={image}
              alt={title}
              fill
              sizes="(min-width: 1024px) 128px, 33vw"
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <span className="text-neutral-700 dark:text-neutral-200 font-semibold text-lg">
              {displayInitials}
            </span>
          )}
        </div>

        <Flex
          vertical
          justify="space-between"
          style={{ width: "100%", minHeight: "128px", flex: 1 }}
          gap="small"
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <Flex
              justify="space-between"
              align="baseline"
              wrap="wrap"
              gap="small"
              style={{ width: "100%" }}
            >
              <Text
                strong
                className="text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-950 dark:group-hover:text-neutral-50 transition-colors"
                style={{ fontSize: 16, lineHeight: 1.4 }}
              >
                {title}
              </Text>
              {displayDate && (
                <Text
                  type="secondary"
                  className="text-neutral-600 dark:text-neutral-400 flex-shrink-0"
                  style={{ fontSize: 14 }}
                >
                  {displayDate}
                </Text>
              )}
            </Flex>

            {description && (
              <div className="relative" style={{ flex: 1, minHeight: "3em" }}>
                <div
                  ref={descriptionRef}
                  className="content-card-description text-neutral-700 dark:text-neutral-300"
                  style={{ 
                    fontSize: 14,
                    lineHeight: 1.5,
                    paddingRight: isTruncated ? "80px" : "0",
                  }}
                >
                  {description}
                </div>
                {isTruncated && (
                  <div className="content-card-read-more">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      read more →
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Flex>
      </div>
    </Card>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        style={{ width: "100%", textDecoration: "none", display: "block" }}
      >
        {cardContent}
      </a>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    // Prevent navigation if already on the target page
    if (pathname === href) {
      e.preventDefault();
      return;
    }
    
    // Block all navigation if any navigation is in progress
    if (isNavigating || clickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // Trigger navigation state if navigating to a different page
    if (pathname !== href && !pathname.startsWith(href + "/")) {
      clickRef.current = true;
      setNavigating(true);
    }
    
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      style={{ width: "100%", textDecoration: "none", display: "block" }}
    >
      {cardContent}
    </Link>
  );
}
