import "./global.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import { Playfair_Display } from "next/font/google";
import { Navbar } from "./components/layout/nav";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Footer from "./components/layout/footer";
import { ThemeProvider } from "./components/ui/theme-switch";
import AntdRegistry from "./lib/AntdRegistry";
import { AntdConfigProvider } from "./components/ui/AntdConfigProvider";
import { NavigationLoading } from "./components/ui/NavigationLoading";
import { NavigationProvider } from "./components/ui/NavigationContext";
import { WebVitals } from "./components/ui/WebVitals";
import { PerformanceMonitor } from "./components/ui/PerformanceMonitor";
import { metaData } from "./config";

export const metadata: Metadata = {
  metadataBase: new URL(metaData.baseUrl),
  title: {
    default: metaData.title,
    template: `%s | ${metaData.title}`,
  },
  description: metaData.description,
  openGraph: {
    images: metaData.ogImage,
    title: metaData.title,
    description: metaData.description,
    url: metaData.baseUrl,
    siteName: metaData.name,
    locale: "en_US",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  twitter: {
    title: metaData.name,
    card: "summary_large_image",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
  },
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "600", "700"],
});

const cx = (...classes) => classes.filter(Boolean).join(" ");

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cx(inter.variable, jetbrainsMono.variable, playfairDisplay.variable)} suppressHydrationWarning>
      <head>
        <link
          rel="alternate"
          type="application/rss+xml"
          href="/rss.xml"
          title="RSS Feed"
        />
        <link
          rel="alternate"
          type="application/atom+xml"
          href="/atom.xml"
          title="Atom Feed"
        />
        <link
          rel="alternate"
          type="application/feed+json"
          href="/feed.json"
          title="JSON Feed"
        />
      </head>
      <body className="antialiased flex flex-col items-center justify-center mx-auto mt-2 lg:mt-8 mb-20 lg:mb-40 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100">
        <AntdRegistry>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <AntdConfigProvider>
              <NavigationProvider>
                <NavigationLoading />
                <main className="flex-auto min-w-0 mt-2 md:mt-6 flex flex-col px-4 sm:px-6 md:px-8 lg:px-12 w-full max-w-screen-sm sm:max-w-screen-md md:max-w-screen-lg lg:max-w-screen-xl xl:max-w-7xl mx-auto">
                  <Navbar />
                  {children}
                  <Footer />
                  <Analytics />
                  <SpeedInsights />
                  <WebVitals />
                  <PerformanceMonitor />
                </main>
              </NavigationProvider>
            </AntdConfigProvider>
          </ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
