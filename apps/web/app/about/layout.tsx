import type { Metadata } from "next";
import { metaData, socialLinks, founderLinks } from "../config";

export const metadata: Metadata = {
  title: "About",
  description: `About CodePawl — an open-source AI and machine learning community founded by ${metaData.name}.`,
  alternates: {
    canonical: `${metaData.baseUrl}about`,
  },
  openGraph: {
    title: `About | ${metaData.title}`,
    description: `About CodePawl — an open-source AI and machine learning community founded by ${metaData.name}.`,
    url: `${metaData.baseUrl}about`,
    images: [`${metaData.baseUrl}/og?title=${encodeURIComponent(`About | ${metaData.title}`)}`],
    siteName: metaData.title,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `About | ${metaData.title}`,
    description: `About CodePawl — an open-source AI and machine learning community founded by ${metaData.name}.`,
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: metaData.title,
              url: metaData.baseUrl,
              foundingDate: "2026",
              founder: {
                "@type": "Person",
                name: metaData.name,
              },
              description: metaData.description,
              sameAs: [
                socialLinks.github,
                socialLinks.twitter,
                socialLinks.devto,
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "Person",
              name: metaData.name,
              jobTitle: "AI Engineer & Data Scientist",
              description: metaData.description,
              url: `${metaData.baseUrl}about`,
              image: `${metaData.baseUrl}/profile.png`,
              sameAs: [
                founderLinks.github,
                founderLinks.linkedin,
                founderLinks.kaggle,
              ],
              email: "hello@codepawl.com",
            },
          ]),
        }}
      />
      {children}
    </>
  );
}
