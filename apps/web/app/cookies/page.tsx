import type { Metadata } from "next";
import Link from "next/link";
import { metaData } from "../config";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: `Cookie Policy for ${metaData.title}`,
  alternates: { canonical: `${metaData.baseUrl}cookies` },
};

export default function CookiePolicy() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
        Cookie Policy
      </h1>
      <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">Last updated: March 31, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2>What Are Cookies</h2>
        <p>
          Cookies are small text files stored on your device by your web browser. They help websites remember
          your preferences and keep you signed in.
        </p>

        <h2>Cookies We Use</h2>

        <h3>Essential Cookies</h3>
        <table>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>codepawl-consent</code></td>
              <td>Records your cookie consent choice (accepted/declined)</td>
              <td>1 year</td>
            </tr>
          </tbody>
        </table>
        <p>This cookie cannot be disabled — it is required to remember your consent preference.</p>

        <h3>Authentication Cookies</h3>
        <table>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>sb-*-auth-token</code></td>
              <td>Supabase authentication session — set when you sign in with GitHub</td>
              <td>Session / 1 week</td>
            </tr>
          </tbody>
        </table>
        <p>This cookie is only set if you log in. Clearing it will sign you out.</p>

        <h3>Analytics</h3>
        <p>
          <strong>Vercel Analytics</strong> and <strong>Vercel Speed Insights</strong> measure site
          performance and usage patterns using privacy-focused, cookieless methods. No cookies are set by
          these services. They are only loaded if you accept the cookie consent banner.
        </p>

        <h2>Third-Party Cookies</h2>
        <p>
          Embedded content from third parties (such as tweets or YouTube videos in blog posts) may set their
          own cookies when loaded. We do not control these. Please refer to the respective services&apos;
          cookie policies:
        </p>
        <ul>
          <li>
            <a href="https://help.twitter.com/en/rules-and-policies/twitter-cookies" target="_blank" rel="noopener noreferrer">Twitter / X Cookie Policy</a>
          </li>
          <li>
            <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener noreferrer">Google / YouTube Cookie Policy</a>
          </li>
          <li>
            <a href="https://docs.github.com/en/site-policy/privacy-policies/github-cookies" target="_blank" rel="noopener noreferrer">GitHub Cookie Policy</a>
          </li>
        </ul>

        <h2>Managing Cookies</h2>
        <p>
          You can control cookies via the consent banner shown on your first visit. You can also manage or
          delete cookies through your browser settings. Most browsers allow you to:
        </p>
        <ul>
          <li>View and delete stored cookies</li>
          <li>Block cookies from specific or all sites</li>
          <li>Set preferences for first-party vs third-party cookies</li>
        </ul>

        <h2>More Information</h2>
        <p>
          For details on how we handle personal data, see our <Link href="/privacy">Privacy Policy</Link>.
          Questions? Contact us at <a href="mailto:hello@codepawl.com">hello@codepawl.com</a>.
        </p>
      </div>
    </section>
  );
}
