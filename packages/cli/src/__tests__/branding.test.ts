import { describe, expect, it } from "vitest";
import {
  OPENPAWL_COMPACT_LOGO,
  OPENPAWL_LOGO_BADGE,
  OPENPAWL_LOGO,
  renderBanner,
  renderCompactLogo,
  renderLogo,
} from "../branding";

function withColorEnv(env: { OPENPAWL_COLOR?: string; NO_COLOR?: string }, run: () => void): void {
  const previousColor = process.env["OPENPAWL_COLOR"];
  const previousNoColor = process.env["NO_COLOR"];

  if (env.OPENPAWL_COLOR === undefined) {
    delete process.env["OPENPAWL_COLOR"];
  } else {
    process.env["OPENPAWL_COLOR"] = env.OPENPAWL_COLOR;
  }

  if (env.NO_COLOR === undefined) {
    delete process.env["NO_COLOR"];
  } else {
    process.env["NO_COLOR"] = env.NO_COLOR;
  }

  try {
    run();
  } finally {
    if (previousColor === undefined) {
      delete process.env["OPENPAWL_COLOR"];
    } else {
      process.env["OPENPAWL_COLOR"] = previousColor;
    }

    if (previousNoColor === undefined) {
      delete process.env["NO_COLOR"];
    } else {
      process.env["NO_COLOR"] = previousNoColor;
    }
  }
}

describe("Openpawl CLI branding", () => {
  it("uses one source of truth for logo symbols", () => {
    withColorEnv({ OPENPAWL_COLOR: "0" }, () => {
      expect(OPENPAWL_LOGO).toBe("[>.-]");
      expect(OPENPAWL_LOGO_BADGE).toBe(" [>.-] ");
      expect(OPENPAWL_COMPACT_LOGO).toBe(">.-");
      expect(renderBanner()).toContain(OPENPAWL_LOGO);
      expect(renderLogo()).toBe(OPENPAWL_LOGO);
      expect(renderCompactLogo()).toBe(OPENPAWL_COMPACT_LOGO);
    });
  });

  it("can render the symbol logo as a colored badge", () => {
    withColorEnv({ OPENPAWL_COLOR: "1" }, () => {
      expect(renderLogo()).toContain("\x1b[");
      expect(renderLogo()).toContain(OPENPAWL_LOGO_BADGE);
      expect(renderCompactLogo()).toContain("\x1b[");
      expect(renderCompactLogo()).toContain(OPENPAWL_COMPACT_LOGO);
    });
  });

  it("lets OPENPAWL_COLOR=1 force color when NO_COLOR is set", () => {
    withColorEnv({ OPENPAWL_COLOR: "1", NO_COLOR: "1" }, () => {
      expect(renderLogo()).toContain("\x1b[");
      expect(renderLogo()).toContain(OPENPAWL_LOGO_BADGE);
    });
  });

  it("keeps plain output when color is disabled", () => {
    withColorEnv({ OPENPAWL_COLOR: "0" }, () => {
      expect(renderLogo()).toBe(OPENPAWL_LOGO);
      expect(renderCompactLogo()).toBe(OPENPAWL_COMPACT_LOGO);
    });
  });
});
