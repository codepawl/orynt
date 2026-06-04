import Image from "next/image";
import Link from "next/link";
import { Github } from "react-bootstrap-icons";

import {
  STACK_PRODUCTS,
  productAvailabilityLabel,
  productStateClass,
} from "./products";

export function Nav() {
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
          className="text-fg-1 cp-h4 inline-flex items-center gap-2 font-display"
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
                className="cp-nav text-fg-3 hover:text-fg-1 inline-flex items-center gap-2 py-3 transition-colors"
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
                        className={`hover:bg-ink-2 grid gap-1 border p-3 transition-colors ${productStateClass(product)}`}
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
                className="cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Research
              </Link>
            </li>
            <li>
              <Link
                href="/blog"
                className="cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Blog
              </Link>
            </li>
            <li>
              <Link
                href="/contact"
                className="cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Contact
              </Link>
            </li>
          </ul>
        </nav>
        <a
          href="https://github.com/codepawl"
          target="_blank"
          rel="noopener noreferrer"
          className="cp-button border-ratchet text-ratchet hover:bg-ink-4 hover:text-ink-1 inline-flex items-center gap-3 border px-3 py-2 transition-colors"
          aria-label="GitHub Follow @codepawl"
        >
          <Github aria-hidden size={18} />
          <span className="grid text-left leading-none">
            <span className="nav-product-status">GitHub</span>
            <span>Follow @codepawl</span>
          </span>
        </a>
      </div>
    </header>
  );
}
