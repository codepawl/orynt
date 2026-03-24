"use client";

import React from "react";
import {
  Github,
  Rss,
  Linkedin,
  Mail,
  Code2,
  type LucideIcon,
} from "lucide-react";
import { metaData, socialLinks } from "../../config";
import { Layout, Space, Typography } from "antd";

const { Footer: AntFooter } = Layout;
const { Text, Link } = Typography;

const YEAR = new Date().getFullYear();

function SocialLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
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
      <SocialLink href={socialLinks.kaggle} icon={Code2} label="Kaggle profile" />
      <SocialLink href={socialLinks.email} icon={Mail} label="Email contact" />
      <a 
        href="/rss.xml" 
        target="_self" 
        style={{ fontSize: "1.2rem", color: "inherit" }}
        aria-label="RSS feed"
      >
        <Rss />
      </a>
    </Space>
  );
}

export default function Footer() {
  return (
    <AntFooter style={{ background: "transparent", textAlign: "center", padding: "24px 0" }}>
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        <SocialLinks />
            <Text type="secondary" className="text-neutral-600 dark:text-neutral-300">
              © {YEAR} <Link href="/" className="link-animated">{metaData.title}</Link>
            </Text>
      </Space>
    </AntFooter>
  );
}
