import type { Metadata } from "next";
import Link from "next/link";
import { metaData } from "../config";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms of Service for ${metaData.title}`,
  alternates: { canonical: `${metaData.baseUrl}terms` },
};

export default function TermsOfService() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
        Terms of Service
      </h1>
      <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">Last updated: March 31, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2>Acceptance</h2>
        <p>
          By accessing <Link href="/">{metaData.baseUrl.replace(/\/$/, "")}</Link> you agree to these terms.
          You must be at least 13 years old to create an account. If you do not agree, please do not use the
          platform.
        </p>

        <h2>Your Account</h2>
        <p>
          You are responsible for your account and any activity that occurs under it. Keep your credentials
          secure. Please create only one account per person.
        </p>

        <h2>Your Content</h2>
        <p>
          You own the content you post. By posting, you grant {metaData.title} a non-exclusive, royalty-free
          license to display your content on the platform. You can delete your posts and comments at any time.
          Deleting content removes it from the platform.
        </p>

        <h2>Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Post spam, unsolicited advertisements, or repetitive content</li>
          <li>Harass, threaten, or abuse other users</li>
          <li>Post illegal content or content that violates others&apos; rights</li>
          <li>Impersonate other people or organisations</li>
          <li>Scrape or crawl the platform in an automated way without prior permission</li>
        </ul>

        <h2>Community Guidelines</h2>
        <p>
          Be respectful. Stay broadly on topic (AI, ML, software, tech). Excessive self-promotion — repeatedly
          posting your own products without contributing to discussions — is not welcome.
        </p>

        <h2>Moderation</h2>
        <p>
          We may remove content that violates these terms and warn or ban accounts that repeatedly do so. We
          aim to be consistent and fair. If you believe content was removed in error, contact us.
        </p>

        <h2>Open-Source</h2>
        <p>
          The {metaData.title} platform code is open-source under its repository license. Libraries published
          by {metaData.title} are released under their respective open-source licenses as specified in each
          repository.
        </p>

        <h2>Intellectual Property</h2>
        <p>
          The {metaData.title} name and logo are the property of {metaData.title}. You may quote and share
          links to content with proper attribution.
        </p>

        <h2>Disclaimer</h2>
        <p>
          The platform is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied.
          We are not liable for any damages arising from the use of the platform or reliance on its content.
        </p>

        <h2>Termination</h2>
        <p>
          We may suspend or terminate accounts that violate these terms. You can delete your account at any
          time by contacting us.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these terms at any time. Changes will be posted on this page. Continued use of the
          platform after changes constitutes acceptance.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms? Contact us at{" "}
          <a href="mailto:hello@codepawl.com">hello@codepawl.com</a>.
        </p>
      </div>
    </section>
  );
}
