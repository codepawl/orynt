import type { Metadata } from "next";
import Link from "next/link";
import { metaData } from "../config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for ${metaData.title}`,
  alternates: { canonical: `${metaData.baseUrl}privacy` },
};

export default function PrivacyPolicy() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
        Privacy Policy
      </h1>
      <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">Last updated: March 25, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2>Overview</h2>
        <p>
          {metaData.title} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates the website at{" "}
          <Link href="/">{metaData.baseUrl.replace(/\/$/, "")}</Link>. This policy explains what data we
          collect, how we use it, and your rights.
        </p>

        <h2>Data We Collect</h2>
        <h3>Analytics</h3>
        <p>
          We use <strong>Vercel Analytics</strong> and <strong>Vercel Speed Insights</strong> to understand
          how visitors use our site. These services collect anonymous, aggregated data such as page views,
          referral sources, browser type, and country. No personally identifiable information is collected
          through analytics.
        </p>

        <h3>Personal Information</h3>
        <p>
          We do not collect, store, or process personal information. There are no user accounts, contact
          forms, or newsletter signups on this site.
        </p>

        <h2>Cookies</h2>
        <p>
          We use a single functional cookie to store your theme preference (light/dark mode). No tracking
          cookies are used. See our <Link href="/cookies">Cookie Policy</Link> for details.
        </p>

        <h2>Third-Party Services</h2>
        <p>Our site may embed content from third-party services:</p>
        <ul>
          <li><strong>GitHub</strong> &mdash; repository data via our API</li>
          <li><strong>Twitter/X</strong> &mdash; embedded tweets in blog posts</li>
          <li><strong>YouTube</strong> &mdash; video links in blog posts</li>
        </ul>
        <p>
          These services may collect data according to their own privacy policies. We encourage you to review
          their policies.
        </p>

        <h2>Data Sharing</h2>
        <p>
          We do not sell, trade, or transfer any data to third parties. Analytics data is processed solely by
          Vercel in accordance with their privacy policy.
        </p>

        <h2>Your Rights</h2>
        <p>
          Since we do not collect personal data, there is no personal data to access, modify, or delete. If
          you have questions about this policy, contact us at{" "}
          <a href="mailto:nxan2911@gmail.com">nxan2911@gmail.com</a>.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy from time to time. Changes will be posted on this page with an updated
          date.
        </p>
      </div>
    </section>
  );
}
