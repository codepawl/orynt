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
      <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">Last updated: March 31, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2>Overview</h2>
        <p>
          {metaData.title} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates the community platform at{" "}
          <Link href="/">{metaData.baseUrl.replace(/\/$/, "")}</Link>. This policy explains what data we
          collect when you use the platform, how we use it, and your rights.
        </p>

        <h2>Account Data</h2>
        <p>
          When you sign in via GitHub OAuth, we receive your GitHub username, public email address, and
          avatar URL. This information is stored in our database (via Supabase) and used to create your
          profile. Your username is visible to other users. You can view your profile at{" "}
          <code>/profile/[username]</code>.
        </p>

        <h2>Content You Post</h2>
        <p>
          Posts, comments, and votes you submit are stored in our database and visible to other users of the
          platform. You can delete your own posts and comments at any time. Deleted content is removed from
          the platform, though it may persist in database backups for a short period.
        </p>

        <h2>Usage Analytics</h2>
        <p>
          We use <strong>Vercel Analytics</strong> and <strong>Vercel Speed Insights</strong> to understand
          how visitors use the platform. These services collect anonymous, aggregated data such as page views,
          referral sources, browser type, and country. No personally identifiable information is collected
          through analytics. If you decline the cookie consent banner, these analytics scripts are not loaded.
        </p>

        <h2>Cookies</h2>
        <p>
          We use an authentication session cookie (<code>sb-*-auth-token</code>) when you sign in, and a
          consent preference cookie (<code>codepawl-consent</code>) to remember your cookie banner choice.
          See our <Link href="/cookies">Cookie Policy</Link> for details.
        </p>

        <h2>Third-Party Services</h2>
        <p>We use the following third-party services to operate the platform:</p>
        <ul>
          <li>
            <strong>Supabase</strong> &mdash; authentication and database hosting.{" "}
            <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabase Privacy Policy</a>
          </li>
          <li>
            <strong>Vercel</strong> &mdash; website hosting and analytics.{" "}
            <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel Privacy Policy</a>
          </li>
          <li>
            <strong>GitHub</strong> &mdash; OAuth login provider.{" "}
            <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub Privacy Statement</a>
          </li>
        </ul>
        <p>
          These services act as sub-processors and handle data in accordance with their own privacy policies.
        </p>

        <h2>Data Sharing</h2>
        <p>
          We do not sell, trade, or share your personal data with third parties beyond the sub-processors
          listed above. We do not run advertising or use data brokers.
        </p>

        <h2>Your Rights</h2>
        <ul>
          <li><strong>View your data</strong> &mdash; visit your profile at <code>/profile/[username]</code></li>
          <li><strong>Delete your account</strong> &mdash; contact us at <a href="mailto:hello@codepawl.com">hello@codepawl.com</a></li>
          <li><strong>Export your data</strong> &mdash; contact us at <a href="mailto:hello@codepawl.com">hello@codepawl.com</a></li>
        </ul>

        <h2>Changes</h2>
        <p>
          We may update this policy from time to time. Changes will be posted on this page with an updated
          date. Continued use of the platform after changes constitutes acceptance.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy? Contact us at{" "}
          <a href="mailto:hello@codepawl.com">hello@codepawl.com</a>.
        </p>
      </div>
    </section>
  );
}
