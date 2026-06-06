"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

import {
  STACK_PRODUCTS,
  productAvailabilityLabel,
  productStateClass,
} from "./products";

export function Nav() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <header className="border-ink-4 bg-ink-1/95 sticky top-0 z-50 border-b-2 backdrop-blur">
      <a
        href="#main"
        className="cp-button bg-ratchet text-ink-0 sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:px-3 focus:py-2"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="cp-hover-link text-fg-1 cp-h4 inline-flex items-center gap-2 font-display"
        >
          <Image
            src="/logo_for_light_mode.svg"
            alt=""
            width={28}
            height={28}
            priority
            className="h-7 w-7"
          />
          CODEPAWL
        </Link>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-6">
            <li className="group/products relative">
              <Link
                href="/products"
                className="cp-hover-link cp-nav text-fg-3 hover:text-fg-1 inline-flex items-center gap-2 py-3 transition-colors"
              >
                Products
                <span aria-hidden="true" className="text-ratchet">
                  ↓
                </span>
              </Link>
              <div className="invisible absolute left-0 top-full w-80 translate-y-2 border-2 border-ink-4 bg-ink-1 p-2 opacity-0 shadow-[6px_6px_0_var(--ink-4)] transition-all group-hover/products:visible group-hover/products:translate-y-0 group-hover/products:opacity-100 group-focus-within/products:visible group-focus-within/products:translate-y-0 group-focus-within/products:opacity-100">
                <ul className="grid gap-1">
                  {STACK_PRODUCTS.map((product) => (
                    <li key={product.id}>
                      <Link
                        href={`/products/${product.slug}`}
                        className={`cp-hover-contained hover:bg-ink-2 grid gap-1 border p-3 transition-colors ${productStateClass(product)}`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="cp-link text-fg-1">
                            {product.name}
                          </span>
                          <span className="nav-product-status">
                            {product.availability === "active" ? (
                              <span className="product-pulse-dot" aria-hidden />
                            ) : null}
                            {productAvailabilityLabel(product)}
                          </span>
                        </span>
                        <span className="cp-small text-fg-3">
                          {product.tagline}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
            <li>
              <Link
                href="/research"
                className="cp-hover-link cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Research
              </Link>
            </li>
            <li>
              <Link
                href="/blog"
                className="cp-hover-link cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Blog
              </Link>
            </li>
            <li>
              <Link
                href="/contact"
                className="cp-hover-link cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Contact
              </Link>
            </li>
          </ul>
        </nav>
        <div className="flex min-h-10 items-center gap-2">
          {isMounted ? (
            <>
              <Show when="signed-out">
                <SignInButton>
                  <button
                    type="button"
                    className="cp-hover-button cp-button border-fg-3 text-fg-1 hover:bg-ink-3 inline-flex items-center border px-3 py-2 transition-colors"
                  >
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton>
                  <button
                    type="button"
                    className="cp-hover-button cp-button bg-ratchet text-ink-0 hover:bg-ratchet-hot inline-flex items-center border border-ratchet px-3 py-2 transition-colors"
                  >
                    Sign up
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <div className="inline-flex items-center">
                  <UserButton
                    fallback={
                      <span
                        aria-hidden="true"
                        className="bg-ink-2 ring-ink-4/20 inline-block h-8 w-8 animate-pulse rounded-full ring-1 shadow-[0_0_0_3px_rgba(143,77,54,0.12)]"
                      />
                    }
                    appearance={{
                      elements: {
                        userButtonAvatarBox: "h-8 w-8 rounded-full border-0",
                        userButtonTrigger:
                          "cp-hover-button rounded-full focus:shadow-[0_0_0_3px_rgba(143,77,54,0.22)]",
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
                        profileSectionItem: "text-fg-1",
                        profileSectionItemList: "cp-hover-contained text-fg-1",
                        profileSectionPrimaryButton:
                          "cp-hover-link text-ratchet hover:text-ratchet-hot",
                        formFieldLabel: "text-fg-1",
                        formFieldInfoText: "text-fg-3",
                      },
                    }}
                    userProfileProps={{
                      appearance: {
                        elements: {
                          card: "bg-ink-1 text-fg-1",
                          page: "bg-ink-1 text-fg-1",
                          pageScrollBox: "bg-ink-1 text-fg-1",
                          pageTitle: "text-fg-1",
                          pageSubtitle: "text-fg-3",
                          navbar: "bg-ink-1 text-fg-1",
                          navbarTitle: "text-fg-1",
                          navbarDescription: "text-fg-3",
                          navbarButton:
                            "cp-hover-contained text-fg-2 hover:bg-ink-2 hover:text-ratchet",
                          navbarButtonText: "text-fg-1",
                          profileSectionTitleText: "text-fg-1",
                          profileSectionContent: "text-fg-2",
                          profileSectionItem: "cp-hover-contained text-fg-1",
                          profileSectionItemTitle: "text-fg-1",
                          profileSectionItemSubtitle: "text-fg-3",
                          profileSectionItemDescription: "text-fg-3",
                          profileSectionPrimaryButton:
                            "cp-hover-link text-ratchet hover:text-ratchet-hot",
                          formFieldLabel: "text-fg-1",
                          formFieldInfoText: "text-fg-3",
                        },
                      },
                    }}
                  />
                </div>
              </Show>
            </>
          ) : (
            <span
              aria-hidden="true"
              className="border-ink-4 bg-ink-2 inline-block h-8 w-8 rounded-full border"
            />
          )}
        </div>
      </div>
    </header>
  );
}
