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
      <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">Last updated: March 25, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2>What Are Cookies</h2>
        <p>
          Cookies are small text files stored on your device by your web browser. They help websites remember
          your preferences and improve your experience.
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
              <td><code>theme</code></td>
              <td>Stores your light/dark mode preference</td>
              <td>1 year</td>
            </tr>
            <tr>
              <td><code>codepawl-consent</code></td>
              <td>Records your cookie consent choice (accepted/declined)</td>
              <td>1 year</td>
            </tr>
          </tbody>
        </table>

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
              <td>Supabase authentication session (set when you sign in with GitHub)</td>
              <td>Session / 1 week</td>
            </tr>
            <tr>
              <td><code>admin_session</code></td>
              <td>Admin dashboard session (httpOnly)</td>
              <td>24 hours</td>
            </tr>
          </tbody>
        </table>

        <h3>Analytics</h3>
        <p>
          <strong>Vercel Analytics</strong> and <strong>Vercel Speed Insights</strong> are used to measure
          site performance and usage patterns. These services use privacy-focused, cookieless analytics that
          do not track individual users across sites.
          If you decline cookies via our consent banner, these analytics scripts are not loaded.
        </p>

        <h2>Third-Party Cookies</h2>
        <p>
          Embedded content from third parties (such as tweets or YouTube links) may set their own cookies.
          We do not control these cookies. Please refer to the respective services&apos; cookie policies:
        </p>
        <ul>
          <li>Twitter/X</li>
          <li>YouTube (Google)</li>
          <li>GitHub</li>
        </ul>

        <h2>Managing Cookies</h2>
        <p>
          You can control and delete cookies through your browser settings. Most browsers allow you to:
        </p>
        <ul>
          <li>View what cookies are stored</li>
          <li>Delete individual or all cookies</li>
          <li>Block cookies from specific or all sites</li>
          <li>Set preferences for first-party vs third-party cookies</li>
        </ul>
        <p>
          Note that disabling the theme cookie will reset your color mode preference on each visit.
        </p>

        <h2>More Information</h2>
        <p>
          For more details on how we handle data, see our <Link href="/privacy">Privacy Policy</Link>.
          Contact us at <a href="mailto:nxan2911@gmail.com">nxan2911@gmail.com</a> with any questions.
        </p>
      </div>
    </section>
  );
}
