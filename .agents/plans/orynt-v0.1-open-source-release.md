# Orynt v0.1 open-source release

## Release contract

- Ship `orynt@0.1.0` as an Apache-2.0 public beta; the CLI is the product.
- Support browser automation only after an explicit local `start` or `attach`.
- Keep improvement candidates in shadow until an operator explicitly approves
  promotion.
- Make no startup update request before stored user consent.
- Publish npm and four native archives (Linux x64, Windows x64, macOS arm64,
  macOS x64) from one protected tag SHA. Desktop remains a frozen,
  non-released compatibility adapter.

## Required implementation

- Repair the core health fixtures without weakening verified semantic task
  plans for mutable repository runs.
- Add deterministic, live-evidence, legal, security, packaging, and release
  gates; release workflows must call those owned gates.
- Follow signed GitHub release redirects safely, enforce
  `minimumCliVersion`, verify archive size/hash before extraction, and retain
  rollback behavior.
- Package complete third-party notices and SBOM evidence, require exactly the
  supported native matrix, and smoke-test packaged resources.
- Document architecture, permissions, automation, variables, tests, security,
  contribution, support, and release operations before making the repository
  public.

## Publication boundary

Repository visibility changes, tags, npm publication, GitHub Releases, signing
key creation, secret changes, and history rewriting require separate operator
approval. Full history is retained unless a secret, IP, or license audit finds
a real blocker.

## Go criteria

All owned release gates pass; live evidence is current and source-bound; the
history/legal audit is clean; all package/install smokes pass; documentation
matches implemented behavior; and both public-visibility and publication
checkpoints receive explicit operator approval.
