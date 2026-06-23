# Basic Fixture

This synthetic fixture represents a scoped Rust core change with complete local validation evidence.

Expected verdict: `verified`.

Why: the diff is scoped, the required test/typecheck/build logs are present and passing, and no protected paths or dependency manifests are touched.
