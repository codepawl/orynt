"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown, List, X } from "react-bootstrap-icons";
import { motion, AnimatePresence } from "motion/react";
import type { DocNavItem } from "app/lib/github-docs";

interface Props {
  nav: DocNavItem[];
  projectSlug: string;
  currentDocSlug: string;
}

function NavItem({
  item,
  projectSlug,
  currentDocSlug,
  depth,
}: {
  item: DocNavItem;
  projectSlug: string;
  currentDocSlug: string;
  depth: number;
}) {
  const href = item.slug
    ? `/projects/${projectSlug}/docs/${item.slug}`
    : `/projects/${projectSlug}/docs`;
  const isActive = currentDocSlug === item.slug;
  const isParentActive =
    item.children?.some((child) => currentDocSlug === child.slug) ?? false;
  const hasChildren = (item.children?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(isActive || isParentActive);

  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded-md transition-colors ${
          isActive
            ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium"
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
          {item.title}
        </Link>
      </div>
      <AnimatePresence initial={false}>
        {hasChildren && expanded && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="list-none p-0 m-0 overflow-hidden"
          >
            {item.children!.map((child) => (
              <NavItem
                key={child.slug}
                item={child}
                projectSlug={projectSlug}
                currentDocSlug={currentDocSlug}
                depth={depth + 1}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

export function DocsSidebar({ nav, projectSlug, currentDocSlug }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  // Derive current slug from pathname if not provided explicitly
  const activeSlug =
    currentDocSlug ??
    pathname.replace(`/projects/${projectSlug}/docs`, "").replace(/^\//, "");

  const sidebarContent = (
    <>
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <Link
          href={`/projects/${projectSlug}/docs`}
          className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 no-underline"
        >
          Documentation
        </Link>
      </div>
      <nav className="p-2 flex-1 overflow-y-auto">
        <ul className="list-none p-0 m-0 space-y-0.5">
          {nav.map((item) => (
            <NavItem
              key={item.slug}
              item={item}
              projectSlug={projectSlug}
              currentDocSlug={activeSlug}
              depth={0}
            />
          ))}
        </ul>
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 mb-4 cursor-pointer bg-transparent border border-neutral-200 dark:border-neutral-800 rounded-md"
      >
        {mobileOpen ? <X size={16} /> : <List size={16} />}
        {mobileOpen ? "Close menu" : "Navigation"}
      </button>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden mb-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 overflow-hidden"
          >
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 h-fit sticky top-24">
        {sidebarContent}
      </aside>
    </>
  );
}
