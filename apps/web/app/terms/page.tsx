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
      <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">Last updated: March 25, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2>Acceptance</h2>
        <p>
          By accessing <Link href="/">{metaData.baseUrl.replace(/\/$/, "")}</Link>, you agree to these terms.
          If you do not agree, please do not use the site.
        </p>

        <h2>Content</h2>
        <p>
          All blog posts, articles, and educational content on this site are provided for informational
          purposes only. While we strive for accuracy, we make no warranties about the completeness,
          reliability, or suitability of the information.
        </p>

        <h2>Open-Source Software</h2>
        <p>
          Software and libraries published by {metaData.title} are released under their respective open-source
          licenses as specified in each repository. Use of these projects is governed by their individual
          license terms.
        </p>

        <h2>Intellectual Property</h2>
        <p>
          The {metaData.title} name, logo, and website design are the property of {metaData.title}. Blog
          content is the intellectual property of its authors. You may share links to our content and quote
          excerpts with proper attribution.
        </p>

        <h2>Disclaimer</h2>
        <p>
          This site and its content are provided &ldquo;as is&rdquo; without warranties of any kind, express
          or implied. We are not liable for any damages arising from the use of this site or reliance on its
          content.
        </p>

        <h2>External Links</h2>
        <p>
          Our site may contain links to external websites. We are not responsible for the content or privacy
          practices of those sites.
        </p>

        <h2>Changes</h2>
        <p>
          We reserve the right to update these terms at any time. Continued use of the site after changes
          constitutes acceptance of the new terms.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms? Contact us at{" "}
          <a href="mailto:nxan2911@gmail.com">nxan2911@gmail.com</a>.
        </p>
      </div>
    </section>
  );
}
