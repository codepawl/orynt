export function Footer() {
  return (
    <footer className="bg-ink-0 border-ink-4 border-t">
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-[2fr_3fr] sm:items-start">
          <div>
            <p className="cp-h4 text-fg-1 font-display">CodePawl</p>
            <p className="cp-small text-fg-3 mt-2">
              Infrastructure for autonomous coding agents.
            </p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="cp-caption text-fg-3">Email</dt>
              <dd className="mt-1">
                <a
                  href="mailto:founder@codepawl.com"
                  className="text-fg-2 hover:text-fg-1 cp-small transition-colors"
                >
                  founder@codepawl.com
                </a>
              </dd>
            </div>
            <div>
              <dt className="cp-caption text-fg-3">GitHub</dt>
              <dd className="mt-1">
                <a
                  href="https://github.com/codepawl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fg-2 hover:text-fg-1 cp-small transition-colors"
                >
                  github.com/codepawl
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="border-ink-4 mx-auto flex max-w-[1240px] items-center justify-between border-t px-6 py-6">
        <p className="cp-caption text-fg-4">© 2026 CodePawl</p>
        <p className="cp-caption text-fg-4">Early-stage research engineering.</p>
      </div>
    </footer>
  );
}
