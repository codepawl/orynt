"use client";

import React from "react";
import { Typography, Avatar, Flex, Space, Divider } from "antd";
import {
  Github,
  Linkedin,
  Mail,
  Youtube,
  Code2,
} from "lucide-react";
import { socialLinks, metaData } from "../config";
import type { LucideIcon } from "lucide-react";

const { Title, Text, Paragraph } = Typography;

function SocialLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
      aria-label={label}
    >
      <Icon className="text-xl" />
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <Title level={2} style={{ marginTop: 0, marginBottom: 24 }} className="text-neutral-900 dark:text-neutral-100">
        {title}
      </Title>
      {children}
    </div>
  );
}

function ExperienceItem({ 
  title, 
  company, 
  location, 
  period, 
  items 
}: { 
  title: string; 
  company: string; 
  location: string; 
  period: string; 
  items: string[] 
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={4} style={{ marginTop: 0, marginBottom: 4 }} className="text-neutral-900 dark:text-neutral-100">
        {title}
      </Title>
      <Text strong className="text-neutral-800 dark:text-neutral-200">{company}</Text>
      <Text type="secondary" className="text-neutral-600 dark:text-neutral-400"> • {location}</Text>
      <br />
      <Text type="secondary" style={{ fontSize: 14 }} className="text-neutral-600 dark:text-neutral-400">
        {period}
      </Text>
      <ul style={{ marginTop: 12, marginBottom: 0, paddingLeft: 24, listStyleType: 'disc' }} className="text-neutral-800 dark:text-neutral-200">
        {items.map((item, index) => (
          <li key={index} style={{ marginBottom: 8, lineHeight: 1.6 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectItem({ 
  title, 
  location, 
  period, 
  items 
}: { 
  title: string; 
  location: string; 
  period: string; 
  items: string[] 
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={4} style={{ marginTop: 0, marginBottom: 4 }} className="text-neutral-900 dark:text-neutral-100">
        {title}
      </Title>
      <Text type="secondary" style={{ fontSize: 14 }} className="text-neutral-600 dark:text-neutral-400">
        {location} • {period}
      </Text>
      <ul style={{ marginTop: 12, marginBottom: 0, paddingLeft: 24, listStyleType: 'disc' }} className="text-neutral-800 dark:text-neutral-200">
        {items.map((item, index) => (
          <li key={index} style={{ marginBottom: 8, lineHeight: 1.6 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Profile() {
  return (
    <section>
      <Flex
        align="center"
        justify="space-between"
        wrap="wrap-reverse"
        style={{ marginBottom: 32 }}
        gap="large"
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <Title level={1} style={{ marginTop: 0, marginBottom: 16 }} className="text-neutral-900 dark:text-neutral-100">
            {metaData.name}
          </Title>
          <Text
            type="secondary"
            style={{ display: "block", marginBottom: 16, fontSize: 18 }}
            className="text-neutral-600 dark:text-neutral-300"
          >
            Data Scientist & Machine Learning Engineer
          </Text>
          <Paragraph
            style={{ fontSize: 16, lineHeight: 1.8, marginBottom: 24 }}
            className="text-neutral-800 dark:text-neutral-200"
          >
            Ho Chi Minh City, Vietnam
          </Paragraph>
          <Space size="large" wrap style={{ marginBottom: 32 }}>
            <SocialLink href={socialLinks.github} icon={Github} label="GitHub" />
            <SocialLink href={socialLinks.linkedin} icon={Linkedin} label="LinkedIn" />
            <SocialLink href={socialLinks.kaggle} icon={Code2} label="Kaggle" />
            <SocialLink href={socialLinks.youtube} icon={Youtube} label="YouTube" />
            <SocialLink href={socialLinks.email} icon={Mail} label="Email" />
          </Space>
        </div>
        <div style={{ marginBottom: 0 }}>
          <Avatar
            size={120}
            src="/profile.jpg"
            alt={metaData.name}
          />
        </div>
      </Flex>

      <Divider />

      <Section title="Education">
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ marginTop: 0, marginBottom: 4 }} className="text-neutral-900 dark:text-neutral-100">
            FPT University Ho Chi Minh City, Vietnam
          </Title>
          <Text strong className="text-neutral-800 dark:text-neutral-200">B.Sc. in Artificial Intelligence</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 14 }} className="text-neutral-600 dark:text-neutral-400">
            October 2022 - December 2025
          </Text>
          <ul style={{ marginTop: 12, marginBottom: 0, paddingLeft: 24, listStyleType: 'disc' }} className="text-neutral-800 dark:text-neutral-200">
            <li style={{ marginBottom: 8, lineHeight: 1.6 }}>
              Status: Completed all coursework & Capstone. Waiting for official degree conferral (Jan 2026).
            </li>
            <li style={{ marginBottom: 8, lineHeight: 1.6 }}>
              Availability: Available for immediate full-time employment.
            </li>
            <li style={{ marginBottom: 8, lineHeight: 1.6 }}>
              GPA: 3.39/4.00.
            </li>
            <li style={{ marginBottom: 8, lineHeight: 1.6 }}>
              Capstone Project: A Diffusion Approach to Image Editing.
            </li>
          </ul>
        </div>
      </Section>

      <Section title="Experience">
        <ExperienceItem
          title="Data Science Intern"
          company="FPT Telecom"
          location="Ho Chi Minh City, Vietnam"
          period="November 2025 - Present"
          items={[
            "Developed data pipelines to analyze customer churn, satisfaction, and modem health to improve service reliability and retention.",
            "Engineered LLM chatbots utilizing the Model Context Protocol (MCP) and researched DevOps methodologies for pipeline optimization.",
            "Collaborated with cross-functional teams to refine technical workflows and improve modeling clarity."
          ]}
        />
        <ExperienceItem
          title="Teaching Assistant"
          company="Full Stack Data Science (FSDS) - Robusto AI"
          location="Ho Chi Minh City, Vietnam"
          period="September 2025 - Present"
          items={[
            "Developed 10+ comprehensive lesson modules on advanced Data Science, Machine Learning, and Deep Learning for over 600 students.",
            "Designed hands-on coding labs using PyTorch and Scikit-learn, while introducing foundational MLOps principles into students' deployment workflows.",
            "Collaborated with instructors to refine course materials, simplifying complex concepts to improve student learning outcomes."
          ]}
        />
        <ExperienceItem
          title="AI Engineer Intern"
          company="CEH INFORMATION SERVICES COMPANY LIMITED"
          location="Ho Chi Minh City, Vietnam"
          period="September 2024 - December 2024"
          items={[
            "Designed and deployed Deep Learning models for container label detection, increasing recognition accuracy by 30% and saving 10 hours of manual verification per week.",
            "Integrated YOLOv8 research into production pipelines, accelerating the adoption of state-of-the-art computer vision methods.",
            "Optimized large-scale deployment pipelines using TensorRT, reducing latency by 30ms to support real-time operations."
          ]}
        />
      </Section>

      <Section title="Leadership & Activities">
        <ExperienceItem
          title="Founder & Content Creator"
          company="CodePawl"
          location="Ho Chi Minh City, Vietnam"
          period="September 2025 - Present"
          items={[
            "Founded and scaled a coding community across YouTube and social platforms.",
            "Produced educational videos, growing the community to 100+ members and achieving 1,000+ total views.",
            "Designed coding walkthroughs and projects to improve accessibility of advanced technical topics.",
            "Initiated development of a website to centralize resources, expand reach, and strengthen community interaction."
          ]}
        />
      </Section>

      <Section title="Key Projects & Community">
        <ProjectItem
          title="ArtMancer - A Diffusion Approach to Image Editing"
          location="Ho Chi Minh City, Vietnam"
          period="Final Capstone Project • September 2025 - December 2025"
          items={[
            "Developed a diffusion-based image editing framework utilizing the Qwen-Image-Edit-2509 model for high-precision manipulation tasks.",
            "Optimized specialized pipelines for three core operations: object removal, context-aware insertion, and automated white balance.",
            "Implemented advanced preprocessing and diffusion sampling techniques to ensure structural integrity and aesthetic consistency.",
            "Engineered a centralized platform to host the model, enhancing accessibility and user experience for generative AI tools."
          ]}
        />
      </Section>

      <Section title="Honors & Awards">
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ marginTop: 0, marginBottom: 4 }} className="text-neutral-900 dark:text-neutral-100">
            Young Psychology Expert 2025 (UEF) - Third Place
          </Title>
          <Text type="secondary" style={{ fontSize: 14 }} className="text-neutral-600 dark:text-neutral-400">
            Ho Chi Minh City, Vietnam • March 2025
          </Text>
          <ul style={{ marginTop: 12, marginBottom: 0, paddingLeft: 24, listStyleType: 'disc' }} className="text-neutral-800 dark:text-neutral-200">
            <li style={{ marginBottom: 8, lineHeight: 1.6 }}>
              Awarded for the &apos;InnSoul&apos; app concept - an AI-powered platform connecting users with psychologists.
            </li>
            <li style={{ marginBottom: 8, lineHeight: 1.6 }}>
              Developed the &apos;Lac Lac&apos; AI assistant for supportive chat (initial therapy) and automated customer triaging.
            </li>
            <li style={{ marginBottom: 8, lineHeight: 1.6 }}>
              Designed an intelligent matching algorithm to optimize user-expert connections based on specific needs and specializations.
            </li>
          </ul>
        </div>
      </Section>

      <Section title="Skills">
        <div className="text-neutral-800 dark:text-neutral-200" style={{ lineHeight: 1.8 }}>
          <Paragraph style={{ marginBottom: 12 }}>
            <Text strong>Languages:</Text> English (Fluent), Vietnamese (Native).
          </Paragraph>
          <Paragraph style={{ marginBottom: 12 }}>
            <Text strong>Programming:</Text> Python (PyTorch, TensorFlow, Scikit-learn), TypeScript/JavaScript (Next.js, React), R, SQL.
          </Paragraph>
          <Paragraph style={{ marginBottom: 12 }}>
            <Text strong>AI & Deep Learning:</Text> Diffusion Models, LLMs, Reinforcement Learning, Computer Vision, NLP.
          </Paragraph>
          <Paragraph style={{ marginBottom: 12 }}>
            <Text strong>MLOps & Infrastructure:</Text> Docker, Git, Feature Stores, CI/CD for ML, Model Context Protocol (MCP).
          </Paragraph>
          <Paragraph style={{ marginBottom: 12 }}>
            <Text strong>Cloud & Data:</Text> AWS (SageMaker), Google Cloud, FastAPI, RESTful APIs, BigData Pipelines.
          </Paragraph>
          <Paragraph style={{ marginBottom: 0 }}>
            <Text strong>Web Development:</Text> Next.js, RESTful APIs.
          </Paragraph>
        </div>
      </Section>
    </section>
  );
}
