export function ContactBlock() {
  return (
    <section aria-label="Contact" className="border-ink-4 border-b">
      <div className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">007 · contact</p>
        <h2 className="cp-h2 text-fg-1">Get in touch.</h2>
        <dl className="mt-8 grid max-w-3xl gap-8 sm:grid-cols-4">
          <div>
            <dt className="cp-caption text-fg-3">Founder</dt>
            <dd className="cp-body text-fg-1 mt-2">An Nguyen</dd>
          </div>
          <div>
            <dt className="cp-caption text-fg-3">Email</dt>
            <dd className="mt-2">
              <a
                href="mailto:founder@codepawl.com"
                className="cp-link text-fg-1 hover:text-ratchet transition-colors"
              >
                founder@codepawl.com
              </a>
            </dd>
          </div>
          <div>
            <dt className="cp-caption text-fg-3">GitHub</dt>
            <dd className="mt-2">
              <a
                href="https://github.com/codepawl"
                target="_blank"
                rel="noopener noreferrer"
                className="cp-link text-fg-1 hover:text-ratchet transition-colors"
              >
                github.com/codepawl
              </a>
            </dd>
          </div>
          <div>
            <dt className="cp-caption text-fg-3">X</dt>
            <dd className="mt-2">
              <a
                href="https://x.com/codepawl"
                target="_blank"
                rel="noopener noreferrer"
                className="cp-link text-fg-1 hover:text-ratchet transition-colors"
              >
                @codepawl
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
