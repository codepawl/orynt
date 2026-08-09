/**
 * Shared language contract for prose authored by Orynt's model-backed roles.
 *
 * User prompts, repository contents, tool output, proper nouns, and third-party
 * material remain source data and may be preserved verbatim when needed.
 */
export const ORYNT_ENGLISH_OUTPUT_INSTRUCTION =
  "Write every Orynt-authored user-facing field in clear English. This includes replies, questions, option labels and descriptions, refined briefs, task titles and instructions, evidence descriptions, summaries, checks, risks, recovery guidance, and unresolved issues. Accept source material in any language, but do not mirror its language in Orynt-authored prose. Preserve user-provided, repository, tool, proper-name, or third-party text verbatim only when quoting or identifying that source material.";
