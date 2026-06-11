import { Link } from "@/components/link";
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
          className="cp-hover-link text-fg-1 cp-h4 inline-flex items-center gap-2 font-display"
        >
          <img src="/logo_for_light_mode.svg" alt="" width={28} height={28} className="h-7 w-7" />
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
              <div className="cp-menu invisible absolute left-0 top-full w-80 translate-y-2 border-2 border-ink-4 bg-ink-1 p-2 opacity-0 shadow-[6px_6px_0_var(--ink-4)] transition-all group-hover/products:visible group-hover/products:translate-y-0 group-hover/products:opacity-100 group-focus-within/products:visible group-focus-within/products:translate-y-0 group-focus-within/products:opacity-100">
                <ul className="grid gap-1">
                  {STACK_PRODUCTS.map((product) => (
                    <li key={product.id}>
                      <Link
                        href={product.slug === "openpawl" ? "/openpawl" : `/products/${product.slug}`}
                        className={`cp-hover-contained hover:bg-ink-2 grid gap-1 border p-3 transition-colors ${productStateClass(product)}`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="cp-link text-fg-1">
                            {product.name}
                          </span>
                          <span className="nav-product-status">
                            {product.availability === "available" || product.availability === "beta" ? (
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
                href="/openpawl"
                className="cp-hover-link cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Openpawl
              </Link>
            </li>
            <li>
              <Link
                href="/openpawl/docs"
                className="cp-hover-link cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Docs
              </Link>
            </li>
            <li>
              <Link
                href="/contact"
                className="cp-hover-link cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Cloud Waitlist
              </Link>
            </li>
            <li>
              <Link
                href="/status"
                className="cp-hover-link cp-nav text-fg-3 hover:text-fg-1 transition-colors"
              >
                Status
              </Link>
            </li>
          </ul>
        </nav>
        <Link
          href="/openpawl/install"
          className="cp-hover-button cp-button bg-ratchet text-ink-0 hover:bg-ratchet-hot hidden border border-ratchet px-3 py-2 transition-colors sm:inline-flex"
        >
          Install
        </Link>
      </div>
    </header>
  );
}
