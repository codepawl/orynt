"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

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

  // Only use the image if it's a valid absolute URL or root-relative path
  const validImage =
    image && (image.startsWith("http://") || image.startsWith("https://") || image.startsWith("/"))
      ? image
      : undefined;

  const displayInitials =
    initials ||
    title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") ||
    "BL";

  useEffect(() => {
    const checkTruncation = () => {
      if (descriptionRef.current && description) {
        const element = descriptionRef.current;
        setIsTruncated(element.scrollHeight > element.clientHeight);
      } else {
        setIsTruncated(false);
      }
    };

    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [description]);

  const displayDate = date || (year ? String(year) : "");

  const cardContent = (
    <div
      className={`card-shadow-offset group w-full cursor-pointer rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent p-3 transition-shadow hover:shadow-md min-h-[180px] h-full ${className}`}
    >
      <div className="flex gap-4 items-stretch h-full">
        <div
          className="relative w-32 h-32 rounded-lg overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex-shrink-0 flex items-center justify-center"
          aria-hidden="true"
        >
          {validImage ? (
            <Image
              src={validImage}
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

        <div className="flex flex-col justify-between w-full min-h-[128px] flex-1 gap-2">
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex justify-between items-baseline flex-wrap gap-2 w-full">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-950 dark:group-hover:text-neutral-50 transition-colors text-base leading-snug">
                {title}
              </span>
              {displayDate && (
                <span className="text-sm text-neutral-600 dark:text-neutral-400 flex-shrink-0">
                  {displayDate}
                </span>
              )}
            </div>

            {description && (
              <div className="relative flex-1" style={{ minHeight: "3em" }}>
                <div
                  ref={descriptionRef}
                  className="content-card-description text-neutral-700 dark:text-neutral-300 text-sm leading-relaxed"
                  style={{ paddingRight: isTruncated ? "80px" : "0" }}
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
        </div>
      </div>
    </div>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="w-full no-underline block"
      >
        {cardContent}
      </a>
    );
  }

  return (
    <Link href={href} onClick={onClick} className="w-full no-underline block">
      {cardContent}
    </Link>
  );
}
