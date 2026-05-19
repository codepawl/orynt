"""Plain HTML newsletter confirmation email.

Phase 4 stub. Later we can swap this for a react-email rendered template,
but for MVP a single-string template suffices and avoids the Node toolchain
inside the Python service.
"""

from __future__ import annotations


def render_confirm_email(*, confirm_url: str, ttl_days: int) -> tuple[str, str]:
    """Return (subject, html) for the double opt-in confirmation."""

    subject = "Confirm your Codepawl newsletter subscription"
    body_css = (
        "font-family: ui-sans-serif, system-ui, sans-serif; "
        "color: #0b0e13; background: #f4f6fa; padding: 40px;"
    )
    card_css = (
        "margin: 0 auto; max-width: 560px; background: #ffffff; "
        "padding: 32px; border: 1px solid #cdd5df;"
    )
    marker_css = (
        "font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; "
        "color: #ff6b1a; margin: 0 0 16px;"
    )
    btn_css = (
        "display: inline-block; background: #ff6b1a; color: #ffffff; "
        "padding: 12px 20px; text-decoration: none; font-weight: 600;"
    )
    mono_css = "font-family: ui-monospace, Menlo, monospace; color: #2a3140;"
    html = f"""<!doctype html>
<html lang="en">
<body style="{body_css}">
  <table cellpadding="0" cellspacing="0" border="0" style="{card_css}">
    <tr><td>
      <p style="{marker_css}">Codepawl</p>
      <h1 style="font-size: 24px; margin: 0 0 16px; color: #0b0e13;">
        Confirm your subscription
      </h1>
      <p style="font-size: 16px; line-height: 1.5; color: #2a3140; margin: 0 0 24px;">
        You asked to subscribe to the Codepawl newsletter. Click the button
        below within {ttl_days} days to finish signing up. If this wasn't you,
        you can ignore this email.
      </p>
      <p style="margin: 0 0 24px;">
        <a href="{confirm_url}" style="{btn_css}">Confirm subscription</a>
      </p>
      <p style="font-size: 14px; color: #5a6577; margin: 0;">
        Or paste this link into your browser:<br />
        <span style="{mono_css}">{confirm_url}</span>
      </p>
    </td></tr>
  </table>
</body>
</html>"""
    return subject, html
