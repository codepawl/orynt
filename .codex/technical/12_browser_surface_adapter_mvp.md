# Browser Surface Adapter MVP

## Browser control layer

Use Playwright in the Node sidecar.

## Browser session modes

```text
Ephemeral profile
  default for MVP tests and demos
  no persistent cookies

Persistent profile
  opt-in only
  useful for logged-in dashboards
  stronger retention/privacy warnings
```

## Capabilities

```text
navigate
click
fill
select
press
scroll
wait
extract_text
extract_table
detect_download
take_screenshot_fallback
```

## Observation sources

```text
DOM structure
accessibility/ARIA snapshot
Playwright locators
URL/title
console/network events
screenshot/crop fallback
```

Screenshot is fallback, not default.

## Element refs

```text
B04 button "Sign in"
I02 textbox "Email"
L07 link "Forgot password"
M01 modal "Confirm delete"
```

Model chooses from candidate IDs; runtime resolves to Playwright locators.

## Failure taxonomy

```text
target_not_found
not_visible
not_enabled
stale_element
overlay_blocked
navigation_timeout
silent_noop
captcha_detected
unsupported_canvas_ui
permission_required
```
