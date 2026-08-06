export const ORYNT_VERSION = process.env.ORYNT_VERSION?.trim() || "0.1.0";
export const ORYNT_INSTALL_KIND =
  process.env.ORYNT_INSTALL_KIND === "native" ? "native" : "npm";
