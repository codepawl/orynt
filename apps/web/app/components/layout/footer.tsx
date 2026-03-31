"use client";

import React from "react";
import Link from "next/link";
import {
  Github,
  RssFill,
  Linkedin,
  EnvelopeFill,
  CodeSlash,
  type Icon,
} from "react-bootstrap-icons";
import { metaData, socialLinks } from "../../config";

const YEAR = new Date().getFullYear();

function SocialLink({ href, icon: Icon, label }: { href: string; icon: Icon; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
      aria-label={label}
    >
      <Icon />
    </a>
  );
}

export default function Footer() {
  return (
    <footer className="text-center py-6">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-5">
          <SocialLink href={socialLinks.github} icon={Github} label="GitHub profile" />
          <SocialLink href={socialLinks.linkedin} icon={Linkedin} label="LinkedIn profile" />
          <SocialLink href={socialLinks.kaggle} icon={CodeSlash} label="Kaggle profile" />
          <SocialLink href={socialLinks.email} icon={EnvelopeFill} label="Email contact" />
          <a
            href="/rss.xml"
            target="_self"
            className="text-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            aria-label="RSS feed"
          >
            <RssFill />
          </a>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <a href="/privacy" className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors no-underline">Privacy</a>
          <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
          <a href="/terms" className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors no-underline">Terms</a>
          <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
          <a href="/cookies" className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors no-underline">Cookies</a>
          <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
          <a href="/about" className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors no-underline">About</a>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          &copy; {YEAR}{" "}
          <Link href="/" className="link-animated">
            {metaData.title}
          </Link>
        </p>
      </div>
    </footer>
  );
}
