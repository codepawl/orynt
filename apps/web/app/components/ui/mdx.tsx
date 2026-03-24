import React, { Children } from "react";
import Link from "next/link";
import Image from "next/image";
import { MDXRemote } from "next-mdx-remote/rsc";
import { TweetComponent } from "../features/tweet";
import { CaptionComponent } from "./caption";
import { YouTubeComponent } from "../features/youtube";
import { CodeCopyButton } from "./CodeCopyButton";
import { hoverBrightness } from "../../lib/utils/animations";
import { KatexLoader } from "./KatexLoader";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import remarkMath from "remark-math";


function CustomLink(props) {
  let href = props.href;
  if (href.startsWith("/")) {
    return (
      <Link href={href} {...props}>
        {props.children}
      </Link>
    );
  }
  if (href.startsWith("#")) {
    return <a {...props} />;
  }
  return <a target="_blank" rel="noopener noreferrer" {...props} />;
}

function RoundedImage(props) {
  return <Image alt={props.alt} className="rounded-lg" {...props} />;
}

function extractCodeText(children) {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "number") {
    return String(children);
  }
  if (!children) {
    return "";
  }
  
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (React.isValidElement(child)) {
        const element = child as React.ReactElement<{ children?: React.ReactNode }>;
        return extractCodeText(element.props.children);
      }
      return "";
    })
    .join("");
}

function getLanguageFromClassName(className) {
  if (!className) return null;
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : null;
}

function formatLanguageName(lang) {
  const langMap = {
    js: "JavaScript",
    ts: "TypeScript",
    jsx: "JSX",
    tsx: "TSX",
    py: "Python",
    rb: "Ruby",
    go: "Go",
    rs: "Rust",
    sh: "Shell",
    bash: "Bash",
    json: "JSON",
    yaml: "YAML",
    md: "Markdown",
    html: "HTML",
    css: "CSS",
    sql: "SQL",
  };
  return langMap[lang?.toLowerCase()] || lang?.toUpperCase() || "Code";
}

function Code({ children, className, ...props }) {
  const codeText = extractCodeText(children);
  const language = getLanguageFromClassName(className);
  const isCodeBlock = className?.includes("language-");
  const isHighlighted = className?.includes("hljs");

  // For code blocks (inside <pre>), return as-is - rehype-highlight or Pre component will handle highlighting
  if (isCodeBlock) {
    // If already highlighted by rehype-highlight, just return it
    if (isHighlighted) {
      return (
        <code
          className={className || ""}
          {...props}
          data-language={language || undefined}
        >
          {children}
        </code>
      );
    }
    // Otherwise, return as-is for Pre component to handle
    return (
      <code
        className={className || ""}
        {...props}
        data-language={language || undefined}
      >
        {children}
      </code>
    );
  }

  // For inline code, return as plain text (rehype-highlight handles code blocks)
  return <code className={className} {...props}>{children}</code>;
}

function Pre({ children, className, ...props }) {
  // Extract code element and language from children
  let codeElement: React.ReactElement | null = null;
  let language: string | null = null;
  let codeText = "";
  let codeClassName = "";
  let isAlreadyHighlighted = false;

  // Try to find code element in children
  const childrenArray = Children.toArray(children);
  
  for (const child of childrenArray) {
    if (React.isValidElement(child)) {
      // Check if it's a code element directly
      if (child.type === "code" || (typeof child.type === "string" && child.type === "code")) {
        codeElement = child;
        const childProps = child.props as { className?: string; children?: React.ReactNode };
        codeClassName = childProps?.className || "";
        language = getLanguageFromClassName(codeClassName);
        codeText = extractCodeText(childProps.children);
        
        // Check if already highlighted by rehype-highlight (has hljs class)
        if (codeClassName.includes("hljs")) {
          isAlreadyHighlighted = true;
        }
        break;
      }
    }
  }

  // If still no code found, try extracting from all children
  if (!codeText) {
    codeText = extractCodeText(children);
    // Try to find language from any code element in the tree
    Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const childClassName = (child.props as { className?: string })?.className || "";
        if (childClassName.includes("language-")) {
          language = getLanguageFromClassName(childClassName);
          codeClassName = childClassName;
        }
        if (childClassName.includes("hljs")) {
          isAlreadyHighlighted = true;
        }
      }
    });
  }

  const displayLanguage = language ? formatLanguageName(language) : null;
  const preClassName = `bg-neutral-100 dark:bg-neutral-800/50 rounded-md overflow-x-auto py-3 px-4 text-sm font-mono ${className || ""}`;

  return (
    <div className="my-6 group">
      {/* Header with language label and copy button - outside pre */}
      {(displayLanguage || codeText) && (
        <div className="flex justify-between items-center px-4 py-2 bg-neutral-100 dark:bg-neutral-800/50 rounded-t-md border-b border-neutral-200 dark:border-neutral-700">
          {displayLanguage && (
            <div className="px-2 py-0.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {displayLanguage}
            </div>
          )}
          {codeText && (
            <div>
              <CodeCopyButton code={codeText} />
            </div>
          )}
        </div>
      )}
      {/* Code block */}
      <pre
        className={`${preClassName} ${(displayLanguage || codeText) ? "rounded-t-none" : ""} ${isAlreadyHighlighted ? "hljs" : ""}`}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

function Table({ data }) {
  let headers = data.headers.map((header, index) => (
    <th key={index} className="text-neutral-900 dark:text-neutral-100">{header}</th>
  ));
  let rows = data.rows.map((row, index) => (
    <tr key={index}>
      {row.map((cell, cellIndex) => (
        <td key={cellIndex} className="text-neutral-800 dark:text-neutral-200">{cell}</td>
      ))}
    </tr>
  ));
  return (
    <table className="w-full border-collapse my-4">
      <thead>
        <tr className="text-left border-b border-neutral-300 dark:border-neutral-700">{headers}</tr>
      </thead>
      <tbody className="border-b border-neutral-200 dark:border-neutral-800">{rows}</tbody>
    </table>
  );
}

function Strikethrough(props) {
  return <del {...props} />;
}

function Callout(props) {
  return (
    <div className="px-4 py-3 bg-[#F7F7F7] dark:bg-[#181818] rounded p-1 text-sm flex items-center text-neutral-900 dark:text-neutral-100 mb-8">
      <div className="flex items-center w-4 mr-4">{props.emoji}</div>
      <div className="w-full callout leading-relaxed">{props.children}</div>
    </div>
  );
}

function Tags(props) {
  const extractText = (children) => {
    if (typeof children === "string") {
      return children;
    }
    if (typeof children === "number") {
      return String(children);
    }
    if (!children) {
      return "";
    }
    
    return Children.toArray(children)
      .map((child) => {
        if (typeof child === "string" || typeof child === "number") {
          return String(child);
        }
        if (React.isValidElement(child)) {
          const element = child as React.ReactElement<{ children?: React.ReactNode }>;
          return extractText(element.props.children);
        }
        return "";
      })
      .join("");
  };

  const text = extractText(props.children);
  const trimmedText = text.trim();
  
  if (!trimmedText || !trimmedText.toLowerCase().startsWith("tags:")) {
    return <p {...props} />;
  }

  const tagsText = trimmedText.replace(/^tags:\s*/i, "");
  const tags = tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (tags.length === 0) {
    return <p {...props} />;
  }

  return (
    <div className="my-6 flex flex-wrap gap-2 justify-center">
      {tags.map((tag, index) => (
        <span
          key={index}
          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function slugify(str) {
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/&/g, "-and-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
}

function createHeading(level) {
  const Heading = ({ children }) => {
    let slug = slugify(children);
    const baseTextColor = "text-neutral-900 dark:text-neutral-100";
    const animationClasses = hoverBrightness.classes;
    
    const headingClasses = {
      1: `${baseTextColor} text-4xl md:text-5xl font-bold mt-8 mb-4 block ${animationClasses}`,
      2: `${baseTextColor} text-[30px] md:text-4xl font-semibold mt-8 mb-4 block ${animationClasses}`,
      3: `${baseTextColor} text-[25px] font-semibold mt-6 mb-3 block ${animationClasses}`,
      4: `${baseTextColor} text-xl font-semibold mt-6 mb-3 block ${animationClasses}`,
      5: `${baseTextColor} text-lg font-semibold mt-4 mb-2 block ${animationClasses}`,
      6: `${baseTextColor} text-base font-semibold mt-4 mb-2 block ${animationClasses}`,
    };
    return React.createElement(
      `h${level}`,
      { id: slug, className: headingClasses[level] || `${baseTextColor} block ${animationClasses}` },
      [
        children,
        React.createElement("a", {
          href: `#${slug}`,
          key: `link-${slug}`,
          className: `anchor ${hoverBrightness.classes}`,
          "aria-label": `Link to ${slug}`,
        }),
      ]
    );
  };
  Heading.displayName = `Heading${level}`;
  return Heading;
}

let components = {
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  h4: createHeading(4),
  h5: createHeading(5),
  h6: createHeading(6),
  Image: RoundedImage,
  a: CustomLink,
  StaticTweet: TweetComponent,
  Caption: CaptionComponent,
  YouTube: YouTubeComponent,
  pre: Pre,
  code: Code,
  Table,
  del: Strikethrough,
  Callout,
  p: Tags,
};

export function CustomMDX(props) {
  return (
    <>
      <KatexLoader source={typeof props.source === "string" ? props.source : undefined} />
      <MDXRemote
        {...props}
        components={{ ...components, ...(props.components || {}) }}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkMath],
            rehypePlugins: [rehypeHighlight, rehypeKatex],
          },
        }}
      />
    </>
  );
}
