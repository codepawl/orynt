import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import { PostHogProvider } from "@/components/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { fontBody, fontDisplay, fontMono } from "@/lib/fonts";
import "./globals.css";

const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#8f4d36",
    colorPrimaryForeground: "#f5f2ed",
    colorBackground: "#eae7e1",
    colorForeground: "#141414",
    colorMuted: "#ddd9d0",
    colorMutedForeground: "#66635d",
    colorInput: "#f5f2ed",
    colorInputForeground: "#141414",
    colorNeutral: "#3a3935",
    colorBorder: "#141414",
    colorRing: "#8f4d36",
    borderRadius: "0",
    fontFamily: "var(--font-body)",
    fontFamilyButtons: "var(--font-body)",
  },
  elements: {
    cardBox: "border-2 border-ink-4 shadow-[8px_8px_0_var(--ink-4)]",
    card: "bg-ink-1 text-fg-1",
    headerTitle: "font-display text-fg-1",
    headerSubtitle: "text-fg-3",
    socialButtonsBlockButton:
      "border border-ink-4 bg-ink-0 text-fg-1 hover:bg-ink-2",
    formFieldInput:
      "border-2 border-ink-4 bg-ink-0 text-fg-1 focus:shadow-[0_0_0_3px_rgba(143,77,54,0.22)]",
    formButtonPrimary:
      "bg-ratchet text-ink-0 hover:bg-ratchet-hot shadow-[4px_4px_0_var(--ink-4)] hover:shadow-none",
    footerActionLink: "text-ratchet hover:text-ratchet-hot",
    userButtonPopoverCard:
      "border-2 border-ink-4 bg-ink-1 text-fg-1 shadow-[8px_8px_0_var(--ink-4)]",
    userButtonPopoverActionButton:
      "text-fg-1 hover:bg-ink-2 hover:text-ratchet",
    userButtonPopoverActionButtonText: "text-fg-1",
    userButtonPopoverActionButtonIcon: "text-fg-3",
    userPreviewMainIdentifier: "text-fg-1",
    userPreviewSecondaryIdentifier: "text-fg-3",
    userPreviewTextContainer: "text-fg-1",
    navbar: "bg-ink-1 text-fg-1",
    navbarButton: "text-fg-2 hover:bg-ink-2 hover:text-ratchet",
    navbarButtonIcon: "text-fg-3",
    navbarButtonText: "text-fg-1",
    page: "bg-ink-1 text-fg-1",
    pageScrollBox: "bg-ink-1 text-fg-1",
    pageTitle: "text-fg-1",
    pageSubtitle: "text-fg-3",
    profileSectionTitleText: "text-fg-1",
    profileSectionContent: "text-fg-2",
    profileSectionItem: "text-fg-1",
    profileSectionItemList: "text-fg-1",
    profileSectionPrimaryButton: "text-ratchet hover:text-ratchet-hot",
    formFieldLabel: "text-fg-1",
    formFieldInfoText: "text-fg-3",
    formFieldSuccessText: "text-success",
    formFieldWarningText: "text-warning",
    formFieldErrorText: "text-danger",
  },
};

export const metadata: Metadata = {
  title: {
    default: "CodePawl",
    template: "%s | CodePawl",
  },
  description:
    "Debugging, memory, coordination, and optimization infrastructure for AI agents.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07090C" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const fontClasses = [
    fontDisplay.variable,
    fontBody.variable,
    fontMono.variable,
  ].join(" ");

  return (
    <html lang="en" className={fontClasses} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ClerkProvider appearance={clerkAppearance}>
          <PostHogProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem={false}
              disableTransitionOnChange
            >
              {children}
            </ThemeProvider>
          </PostHogProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
