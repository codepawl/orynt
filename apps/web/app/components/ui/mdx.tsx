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
import { RepoCard } from "./RepoCard";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode from "rehype-pretty-code";
import remarkMath from "remark-math";

const rehypePrettyCodeOptions = {
  theme: { dark: "one-dark-pro", light: "github-light" },
  keepBackground: false,
  defaultLang: "plaintext",
};


function CustomLink(props) {
  const href = props.href;
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
    plaintext: "Text",
  };
  return langMap[lang?.toLowerCase()] || lang?.toUpperCase() || "Code";
}

function Code({ children, className, ...props }) {
  return <code className={className} {...props}>{children}</code>;
}

function Figure({ children, ...props }) {
  // rehype-pretty-code wraps code blocks in <figure>
  if ("data-rehype-pretty-code-figure" in props) {
    return (
      <div className="my-6 group">
        {children}
      </div>
    );
  }
  return <figure {...props}>{children}</figure>;
}

function Figcaption({ children, ...props }) {
  // rehype-pretty-code title (```python title="main.py")
  if ("data-rehype-pretty-code-title" in props) {
    return (
      <figcaption
        className="flex items-center px-4 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800/50 rounded-t-md border-b border-neutral-200 dark:border-neutral-700"
        {...props}
      >
        {children}
      </figcaption>
    );
  }
  return <figcaption {...props}>{children}</figcaption>;
}

function Pre({ children, ...props }) {
  const dataLanguage = props["data-language"];
  const isRehypePrettyCode = dataLanguage !== undefined;

  // Extract code text for copy button
  let codeText = "";
  const childrenArray = Children.toArray(children);
  for (const child of childrenArray) {
    if (React.isValidElement(child)) {
      codeText = extractCodeText((child.props as { children?: React.ReactNode }).children);
      break;
    }
  }
  if (!codeText) {
    codeText = extractCodeText(children);
  }

  const displayLanguage = dataLanguage ? formatLanguageName(dataLanguage) : null;
  const preClassName = "bg-neutral-100 dark:bg-neutral-800/50 rounded-md overflow-x-auto py-3 px-4 text-sm font-mono";

  const headerBar = (displayLanguage || codeText) ? (
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
  ) : null;

  const hasTitle = isRehypePrettyCode; // Figure component provides outer wrapper
  const preElement = (
    <pre
      className={`${preClassName} ${headerBar || hasTitle ? "rounded-t-none" : ""}`}
      {...props}
    >
      {children}
    </pre>
  );

  if (isRehypePrettyCode) {
    // Figure component provides the outer <div className="my-6 group"> wrapper
    return <>{headerBar}{preElement}</>;
  }

  // Fallback for non-rehype-pretty-code pre blocks (e.g., plain markdown)
  return (
    <div className="my-6 group">
      {headerBar}
      {preElement}
    </div>
  );
}

function Table({ data }) {
  const headers = data.headers.map((header, index) => (
    <th key={index} className="text-neutral-900 dark:text-neutral-100">{header}</th>
  ));
  const rows = data.rows.map((row, index) => (
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
    <div className="px-4 py-3 bg-neutral-100 dark:bg-neutral-800/50 rounded p-1 text-sm flex items-center text-neutral-900 dark:text-neutral-100 mb-8">
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
    const slug = slugify(children);
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

const components = {
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
  RepoCard,
  pre: Pre,
  code: Code,
  figure: Figure,
  figcaption: Figcaption,
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
            rehypePlugins: [[rehypePrettyCode, rehypePrettyCodeOptions], rehypeKatex],
          },
        }}
      />
    </>
  );
}
