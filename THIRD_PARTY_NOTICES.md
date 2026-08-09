# Third-party notices

Orynt's release tooling derives the exact production dependency inventory and
bundled license texts with:

```bash
bun release:legal
```

The generated `THIRD_PARTY_NOTICES.md` and `orynt.spdx.json` are included in
every npm and native artifact. The current CLI closure contains permissively
licensed MIT and BSD-3-Clause packages; the release gate fails for a missing or
unapproved license.
