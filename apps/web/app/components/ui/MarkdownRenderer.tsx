"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { Components } from "react-markdown";
import { Clipboard, ClipboardCheck } from "react-bootstrap-icons";

interface MarkdownRendererProps {
  content: string;
  /** GitHub repo info for resolving relative image URLs */
  repo?: {
    owner: string;
    name: string;
    defaultBranch?: string;
  };
  className?: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-neutral-700/80 hover:bg-neutral-600 text-neutral-300 hover:text-neutral-100 transition-colors opacity-0 group-hover/pre:opacity-100 cursor-pointer border-none"
      title={copied ? "Copied!" : "Copy code"}
    >
      {copied ? <ClipboardCheck size={14} /> : <Clipboard size={14} />}
    </button>
  );
}

export function MarkdownRenderer({ content, repo, className = "" }: MarkdownRendererProps) {
  const resolveImageUrl = useCallback(
    (src: string) => {
      if (!src) return src;
      if (src.startsWith("http://") || src.startsWith("https://")) return src;
      if (!repo) return src;
      const branch = repo.defaultBranch || "main";
      const cleanSrc = src.replace(/^\.\//, "");
      return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${branch}/${cleanSrc}`;
    },
    [repo],
  );

  const components: Components = {
    h1: ({ children }) => (
      <h1 className="text-2xl font-bold mt-8 mb-4 text-neutral-900 dark:text-neutral-100">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl font-semibold mt-6 mb-3 border-b border-neutral-200 dark:border-neutral-800 pb-2 text-neutral-900 dark:text-neutral-100">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg font-semibold mt-4 mb-2 text-neutral-900 dark:text-neutral-100">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-base font-semibold mt-3 mb-1.5 text-neutral-900 dark:text-neutral-100">
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
        {children}
      </p>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300 underline underline-offset-2"
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className="list-disc pl-6 mb-4 space-y-1 text-neutral-700 dark:text-neutral-300">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-6 mb-4 space-y-1 text-neutral-700 dark:text-neutral-300">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-neutral-300 dark:border-neutral-700 pl-4 italic text-neutral-500 dark:text-neutral-400 my-4">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-4">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-neutral-100 dark:bg-neutral-800">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="text-left p-2 border border-neutral-200 dark:border-neutral-700 font-medium text-neutral-900 dark:text-neutral-100">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="p-2 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300">
        {children}
      </td>
    ),
    hr: () => <hr className="border-neutral-200 dark:border-neutral-800 my-6" />,
    img: ({ src, alt }) => {
      const resolvedSrc = resolveImageUrl(typeof src === "string" ? src : "");
      return (
        <img
          src={resolvedSrc}
          alt={alt || ""}
          className="max-w-full rounded-lg my-4"
          loading="lazy"
        />
      );
    },
    pre: ({ children }) => {
      // Extract text content for copy button
      let codeText = "";
      if (children && typeof children === "object" && "props" in (children as React.ReactElement)) {
        const codeEl = children as React.ReactElement<{ children?: string }>;
        codeText = typeof codeEl.props.children === "string" ? codeEl.props.children : "";
      }

      return (
        <div className="relative group/pre mb-4">
          <pre className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 overflow-x-auto font-mono text-sm text-neutral-800 dark:text-neutral-200">
            {children}
          </pre>
          {codeText && <CopyButton text={codeText} />}
        </div>
      );
    },
    code: ({ className: codeClassName, children }) => {
      const isBlock = codeClassName?.startsWith("language-");
      if (isBlock) {
        return (
          <code className={`${codeClassName || ""} block`}>{children}</code>
        );
      }
      return (
        <code className="bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-sm font-mono text-neutral-800 dark:text-neutral-200">
          {children}
        </code>
      );
    },
    input: ({ type, checked, ...rest }) => {
      if (type === "checkbox") {
        return (
          <input
            type="checkbox"
            checked={checked}
            readOnly
            className="mr-2 accent-amber-500"
            {...rest}
          />
        );
      }
      return <input type={type} {...rest} />;
    },
  };

  return (
    <div className={`markdown-renderer ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
