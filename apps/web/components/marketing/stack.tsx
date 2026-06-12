import {
  STACK_PRODUCTS,
  productAvailabilityLabel,
  productBadgeClass,
  productStateClass,
} from "./products";

export function Stack() {
  return (
    <section aria-label="The CodePawl stack" className="border-ink-4 border-b">
      <div className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">003 · the codepawl stack</p>
        <h2 className="cp-h2 text-fg-1 max-w-3xl">
          Openpawl is the current open runtime; future layers add evidence,
          memory, replay, and optimization.
        </h2>

        <pre className="border-ink-5 bg-code-bg cp-code mt-10 inline-block border p-6 leading-relaxed">
          <code>{`CodePawl
├── Openpawl        available coordination runtime, GitHub Actions first
├── CodePawl Cloud  upcoming hosted evidence layer
├── TracePawl       roadmap coordination evidence and replay layer
├── Mempawl         roadmap memory and handoff layer
└── CachePawl       roadmap optimization layer`}</code>
        </pre>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {STACK_PRODUCTS.map((product) => (
            <article
              key={product.id}
              className={`cp-card bg-ink-1 border p-6 ${productStateClass(product)}`}
            >
              <header className="mb-4 flex items-center justify-between gap-3">
                <p className="cp-caption text-fg-3">{product.language}</p>
                <span className={productBadgeClass(product)}>
                  {product.availability === "available" || product.availability === "beta" ? (
                    <span className="product-pulse-dot" aria-hidden />
                  ) : null}
                  {productAvailabilityLabel(product)}
                </span>
              </header>
              <h3 className="cp-h3 text-fg-1">{product.name}</h3>
              <p className="cp-body text-fg-2 mt-2">{product.tagline}</p>
              <p className="cp-small text-fg-3 mt-4">{product.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
