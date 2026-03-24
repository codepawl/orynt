import type { Metadata } from "next";
import { metaData, socialLinks } from "../config";

export const metadata: Metadata = {
  title: "Profile",
  description: `Profile of ${metaData.name} - ${metaData.description}`,
  alternates: {
    canonical: `${metaData.baseUrl}profile`,
  },
  openGraph: {
    title: `Profile | ${metaData.name}`,
    description: metaData.description,
    url: `${metaData.baseUrl}profile`,
    images: [`${metaData.baseUrl}/og?title=${encodeURIComponent(`Profile | ${metaData.name}`)}`],
    siteName: metaData.name,
    locale: "en_US",
    type: "profile",
  },
  twitter: {
    card: "summary_large_image",
    title: `Profile | ${metaData.name}`,
    description: metaData.description,
  },
};

export default function ProfileLayout({
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
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name: metaData.name,
            jobTitle: "Data Scientist & Machine Learning Engineer",
            description: metaData.description,
            url: `${metaData.baseUrl}profile`,
            image: `${metaData.baseUrl}/profile.png`,
            sameAs: [
              socialLinks.github,
              socialLinks.linkedin,
              socialLinks.kaggle,
              socialLinks.youtube,
            ],
            email: socialLinks.email.replace("mailto:", ""),
          }),
        }}
      />
      {children}
    </>
  );
}
