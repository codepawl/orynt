"use client";

import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/react";
import { ui } from "@clerk/ui";

import { PostHogProvider } from "@/components/posthog-provider";

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
      "cp-hover-contained border border-ink-4 bg-ink-0 text-fg-1 hover:bg-ink-2",
    formFieldInput:
      "border-2 border-ink-4 bg-ink-0 text-fg-1 focus:shadow-[0_0_0_3px_rgba(143,77,54,0.22)]",
    formButtonPrimary:
      "cp-hover-contained bg-ratchet text-ink-0 hover:bg-ratchet-hot hover:text-ink-0",
    footerActionLink: "text-ratchet hover:text-ratchet-hot",
    userButtonPopoverCard:
      "border-2 border-ink-4 bg-ink-1 text-fg-1 shadow-[8px_8px_0_var(--ink-4)]",
    userButtonPopoverActionButton:
      "cp-hover-contained text-fg-1 hover:bg-ink-2 hover:text-ratchet",
    userButtonPopoverActionButtonText: "text-fg-1",
    userButtonPopoverActionButtonIcon: "text-fg-3",
    userPreviewMainIdentifier: "text-fg-1",
    userPreviewSecondaryIdentifier: "text-fg-3",
    userPreviewTextContainer: "text-fg-1",
    navbar: "bg-ink-1 text-fg-1",
    navbarButton:
      "cp-hover-contained text-fg-2 hover:bg-ink-2 hover:text-ratchet",
    navbarButtonIcon: "text-fg-3",
    navbarButtonText: "text-fg-1",
    page: "bg-ink-1 text-fg-1",
    pageScrollBox: "bg-ink-1 text-fg-1",
    pageTitle: "text-fg-1",
    pageSubtitle: "text-fg-3",
    profileSectionTitleText: "text-fg-1",
    profileSectionContent: "text-fg-2",
    profileSectionItem: "cp-hover-contained text-fg-1",
    profileSectionItemList: "cp-hover-contained text-fg-1",
    profileSectionPrimaryButton:
      "cp-hover-link text-ratchet hover:text-ratchet-hot",
    formFieldLabel: "text-fg-1",
    formFieldInfoText: "text-fg-3",
    formFieldSuccessText: "text-success",
    formFieldWarningText: "text-warning",
    formFieldErrorText: "text-danger",
  },
};

export function AppProviders({ children }: { children: ReactNode }) {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return (
    <ClerkProvider
      ui={ui}
      appearance={clerkAppearance}
      publishableKey={publishableKey}
      __internal_bypassMissingPublishableKey={!publishableKey}
    >
      <PostHogProvider>
        {children}
      </PostHogProvider>
    </ClerkProvider>
  );
}
