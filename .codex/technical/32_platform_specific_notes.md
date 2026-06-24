# Platform-Specific Notes

## macOS

- Use Tauri bundle.
- Prepare code signing/notarization later.
- Future desktop control requires Accessibility permission.
- Screen Recording may be needed for screenshot fallback outside browser.

## Windows

- Important commercial target.
- Prepare installer and signing.
- Future desktop control should use Windows UI Automation.
- Watch antivirus false positives from bundled sidecar.

## Linux

- Dev preview first.
- Future desktop control via AT-SPI/DBus investigation.

## Cross-platform rules

- Use app data dirs.
- Do not hardcode paths.
- Keep sidecar binary naming platform-aware.
- Test paths with spaces/unicode.
- Do not assume shell availability.
