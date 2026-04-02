"use client";

import { useState } from "react";
import Link from "next/link";
import { BoxArrowUpRight, FileEarmarkPdf, ChatDots } from "react-bootstrap-icons";
import type { Paper } from "@codepawl/shared";
import { VerificationBadge } from "./VerificationBadge";

interface PaperDetailProps {
  paper: Paper;
  reproductionCount: number;
}

export function PaperDetail({ paper, reproductionCount }: PaperDetailProps) {
  const [showAbstract, setShowAbstract] = useState(false);

  const tags = paper.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // Result breakdown from reproductionCount
  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <VerificationBadge status={paper.verification_status} size="lg" />
        {paper.venue && (
          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            {paper.venue}{paper.year ? ` ${paper.year}` : ""}
          </span>
        )}
      </div>

      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
        {paper.title}
      </h1>

      <p className="text-neutral-500 mb-4">{paper.authors}</p>

      {/* Links */}
      <div className="flex flex-wrap gap-2 mb-4">
        {paper.arxiv_url && (
          <a
            href={paper.arxiv_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            <BoxArrowUpRight size={12} />
            arXiv
          </a>
        )}
        {paper.pdf_url && (
          <a
            href={paper.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            <FileEarmarkPdf size={12} />
            PDF
          </a>
        )}
        {tags.length > 0 && tags.map((tag) => (
          <Link
            key={tag}
            href={`/community?tag=${tag}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            <ChatDots size={12} />
            #{tag}
          </Link>
        ))}
      </div>

      {/* Abstract */}
      {paper.abstract && (
        <div className="mb-4">
          <button
            onClick={() => setShowAbstract(!showAbstract)}
            className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer bg-transparent border-none"
          >
            {showAbstract ? "Hide abstract" : "Show abstract"}
          </button>
          {showAbstract && (
            <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed bg-neutral-50 dark:bg-neutral-900 rounded-lg p-4">
              {paper.abstract}
            </p>
          )}
        </div>
      )}

      {/* Stats + submit */}
      <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 pt-4">
        <div className="flex items-center gap-4 text-sm text-neutral-500">
          <span>
            <strong className="text-neutral-900 dark:text-neutral-100">{reproductionCount}</strong>{" "}
            reproduction{reproductionCount !== 1 ? "s" : ""}
          </span>
          {paper.year && !paper.venue && <span>{paper.year}</span>}
        </div>
        <Link
          href={`/papers/${paper.id}/reproduce`}
          className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-80 transition-opacity no-underline"
        >
          Submit reproduction
        </Link>
      </div>
    </div>
  );
}
