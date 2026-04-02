"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown, List, X, PlusCircle } from "react-bootstrap-icons";
import type { WikiPageSummary } from "@codepawl/shared";

interface WikiSidebarProps {
  pages: WikiPageSummary[];
  projectSlug: string;
  showAddButton?: boolean;
}

interface TreeNode extends WikiPageSummary {
  children: TreeNode[];
}

function buildTree(pages: WikiPageSummary[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const page of pages) {
    nodeMap.set(page.id, { ...page, children: [] });
  }

  for (const page of pages) {
    const node = nodeMap.get(page.id)!;
    if (page.parent_id && nodeMap.has(page.parent_id)) {
      nodeMap.get(page.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function TreeItem({ node, projectSlug, depth }: { node: TreeNode; projectSlug: string; depth: number }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const href = `/projects/${projectSlug}/wiki/${node.slug}`;
  const isActive = pathname === href;
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded-md transition-colors ${
          isActive
            ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 cursor-pointer bg-transparent border-none text-neutral-400"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <Link
          href={href}
          className="flex-1 py-1.5 pr-2 text-sm no-underline truncate"
        >
          {node.title}
        </Link>
      </div>
      {hasChildren && expanded && (
        <ul className="list-none p-0 m-0">
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} projectSlug={projectSlug} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function WikiSidebar({ pages, projectSlug, showAddButton }: WikiSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const tree = buildTree(pages);

  const sidebarContent = (
    <>
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <Link
          href={`/projects/${projectSlug}/wiki`}
          className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 no-underline"
        >
          Documentation
        </Link>
      </div>
      <nav className="p-2 flex-1 overflow-y-auto">
        {tree.length > 0 ? (
          <ul className="list-none p-0 m-0 space-y-0.5">
            {tree.map((node) => (
              <TreeItem key={node.id} node={node} projectSlug={projectSlug} depth={0} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-400 px-3 py-4">No pages yet.</p>
        )}
      </nav>
      {showAddButton && (
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href={`/projects/${projectSlug}/wiki/new`}
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 no-underline"
          >
            <PlusCircle size={14} />
            Add page
          </Link>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 mb-4 cursor-pointer bg-transparent border border-neutral-200 dark:border-neutral-800 rounded-md"
      >
        {mobileOpen ? <X size={16} /> : <List size={16} />}
        {mobileOpen ? "Close menu" : "Pages"}
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="md:hidden mb-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
          {sidebarContent}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 h-fit sticky top-24">
        {sidebarContent}
      </aside>
    </>
  );
}
