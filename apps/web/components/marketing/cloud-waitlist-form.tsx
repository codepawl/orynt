"use client";

import { useEffect, useMemo, useState } from "react";

import { ContactForm } from "./contact-form";

const SOURCE_TAGS = new Set([
  "cloud_waitlist",
  "cloud_evidence_demo",
  "artifact_preview_feedback",
]);

const intentCopy = {
  waitlist: {
    subject: "CodePawl Cloud Evidence waitlist",
    message:
      "I want to join the CodePawl Cloud Evidence waitlist. CodePawl Cloud is upcoming; I understand the current artifact preview is local/browser-only.",
    submit: "Join waitlist",
  },
  hosted_review: {
    subject: "Hosted evidence review request",
    message:
      "I want to request a hosted evidence review conversation. CodePawl Cloud is upcoming; I understand no artifact contents should be submitted through this form.",
    submit: "Request hosted review",
  },
  workflow_feedback: {
    subject: "Cloud Evidence workflow feedback",
    message:
      "I want to share the artifact review workflow I need. CodePawl Cloud is upcoming; I understand the current artifact preview is local/browser-only.",
    submit: "Send workflow feedback",
  },
} as const;

type Intent = keyof typeof intentCopy;

function getInitialState() {
  if (typeof window === "undefined") {
    return { source: "cloud_waitlist", intent: "waitlist" as Intent };
  }

  const params = new URLSearchParams(window.location.search);
  const source = params.get("source") ?? "cloud_waitlist";
  const intent = params.get("intent") ?? "waitlist";

  return {
    source: SOURCE_TAGS.has(source) ? source : "cloud_waitlist",
    intent: intent in intentCopy ? (intent as Intent) : "waitlist",
  };
}

export function CloudWaitlistForm() {
  const [state, setState] = useState(getInitialState);

  useEffect(() => {
    setState(getInitialState());
  }, []);

  const copy = intentCopy[state.intent];
  const fields = useMemo(
    () => [
      {
        name: "repoType" as const,
        label: "GitHub org/repo type (optional)",
        placeholder: "Example: private monorepo, OSS action repo, regulated app repo",
      },
      {
        name: "desiredWorkflow" as const,
        label: "Desired workflow (optional)",
        placeholder: "Example: evidence review before merge, auditor packet, incident replay",
      },
      {
        name: "cloudNeeds" as const,
        label: "Hosted storage, team review, or trace search needs (optional)",
        placeholder: "Tell us whether you need hosted artifact storage, team review, or trace search.",
      },
    ],
    [],
  );

  return (
    <ContactForm
      sourceTag={state.source}
      defaultSubject={copy.subject}
      defaultMessage={copy.message}
      optionalFields={fields}
      submitLabel={copy.submit}
      successTitle="Thanks - you are on the Cloud Evidence list."
      successBody="A human reads every waitlist and workflow note. Do not send artifact contents here; the current preview remains local/browser-only."
    />
  );
}
