"use client";

import React from "react";
import {
  Github,
  RssFill,
  Linkedin,
  EnvelopeFill,
  CodeSlash,
  type Icon,
} from "react-bootstrap-icons";
import { metaData, socialLinks } from "../../config";
import { Layout, Space, Typography } from "antd";

const { Footer: AntFooter } = Layout;
const { Text, Link } = Typography;

const YEAR = new Date().getFullYear();

function SocialLink({ href, icon: Icon, label }: { href: string; icon: Icon; label: string }) {
  return (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      style={{ fontSize: "1.2rem", color: "inherit" }}
      aria-label={label}
    >
      <Icon />
    </a>
  );
}

function SocialLinks() {
  return (
    <Space size="middle">
      <SocialLink href={socialLinks.github} icon={Github} label="GitHub profile" />
      <SocialLink href={socialLinks.linkedin} icon={Linkedin} label="LinkedIn profile" />
      <SocialLink href={socialLinks.kaggle} icon={CodeSlash} label="Kaggle profile" />
      <SocialLink href={socialLinks.email} icon={EnvelopeFill} label="Email contact" />
      <a 
        href="/rss.xml" 
        target="_self" 
        style={{ fontSize: "1.2rem", color: "inherit" }}
        aria-label="RSS feed"
      >
        <RssFill />
      </a>
    </Space>
  );
}

export default function Footer() {
  return (
    <AntFooter style={{ background: "transparent", textAlign: "center", padding: "24px 0" }}>
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        <SocialLinks />
        <Space size="middle" separator={<Text type="secondary" className="text-neutral-400 dark:text-neutral-500">&middot;</Text>}>
          <Link href="/privacy" className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs" style={{ textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs" style={{ textDecoration: "none" }}>Terms</Link>
          <Link href="/cookies" className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs" style={{ textDecoration: "none" }}>Cookies</Link>
        </Space>
        <Text type="secondary" className="text-neutral-600 dark:text-neutral-300">
          &copy; {YEAR} <Link href="/" className="link-animated">{metaData.title}</Link>
        </Text>
      </Space>
    </AntFooter>
  );
}
