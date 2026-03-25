"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ThemeSwitch } from "../ui/theme-switch";
import { InlineLogo } from "./InlineLogo";
import { metaData } from "../../config";

const navItems = [
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/news", label: "News" },
  { href: "/projects", label: "Projects" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 py-5">
      <div className="flex justify-between items-center">
        <Link
          href="/"
          className="text-xl font-sans font-bold text-inherit no-underline flex items-center gap-2 hover:text-inherit transition-opacity duration-200 hover:opacity-70"
        >
          <InlineLogo size={32} />
          {metaData.title}
        </Link>
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? "text-neutral-900 dark:text-neutral-100"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-x-1 -bottom-px h-0.5 bg-neutral-900 dark:bg-neutral-100 rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
          <div className="ml-2">
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </nav>
  );
}
