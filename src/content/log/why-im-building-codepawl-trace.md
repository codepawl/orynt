---
title: "Why I'm building Codepawl Trace"
description: "Observability tools tell you what failed. They don't tell you why. Trace is the layer that does, and it plugs into the stack you already have."
publishedAt: 2026-05-01
tag: thinking
---

Over the last year I have reviewed close to four thousand agent
traces as paid eval work on Shipd. The job is to read a trace, decide
whether the agent succeeded, and write up why when it didn't.

Every trace came out of decent tooling. Langfuse spans. LangSmith
runs. OpenTelemetry GenAI exports. Beautiful nesting. Token counts.
Latency breakdowns. Every input and output preserved.

The traces told me everything except the one thing the eval asked.

Why did it fail?

I read each trace until I could write the answer. Hours, sometimes.
The pattern was almost always the same: the actual cause was an
interaction two or three steps upstream of the visible symptom, a
tool call returning a near-miss string the model treated as
authoritative, or an assumption that broke quietly between two
components that each behaved as specified. The trace had no opinion
on which step was responsible. A senior engineer arrived at the
answer eventually. A junior copied the wrong span into the report
and moved on.

Somewhere around the thousandth trace I started writing what became
Codepawl Trace.

## The gap I keep hitting

The current AI observability stack is excellent at the layer it covers.
Langfuse, LangSmith, Phoenix, the OpenTelemetry GenAI work, all of
them store traces, slice latency and cost, surface eval scores. The
storage and instrumentation problem is solved.

The diagnosis problem is not.

When an agent fails in production, the trace shows you the symptoms.
The actual question, the one a senior engineer would ask, is harder:
which step caused this, which assumption broke, what is the smallest
change that fixes it without regressing the other ten flows. That
question still gets answered by a human reading spans for hours.

Trace is the layer that answers it.

You point Trace at a trace, however you collect them. Langfuse export.
LangSmith run. OTel span batch. Raw SDK logs from a debug print. Trace
returns a structured diagnosis: the failing step, the root cause
in plain English, the upstream interaction that produced it, and a
suggested fix you can paste into a PR.

Not another dashboard. A debugger that thinks.

## Why this is its own product, not a feature

The obvious counter is "this should just be a feature inside Langfuse."
I disagree, and the disagreement is the reason this is a separate
product.

Observability platforms are built around storage and queries. Their
data model is spans, their UX is filters, their pricing is volume.
Failure diagnosis has a different shape. It is read-heavy on a single
trace at a time, write-light, and the value is the model reasoning
over your data, not the data itself. Bolting that onto a span
storage product is the kind of thing that ships as a "Beta AI
Insights" panel and never gets out of beta.

Trace lives upstream of your storage. You bring your traces, in
whatever format you have. We diagnose. The traces stay yours, in
whatever system you already pay for. We complement Langfuse and
LangSmith. We do not replace them.

## What's in v0.1

Alpha lands late June. The first release covers:

- Adapters for Langfuse, LangSmith, and OpenTelemetry GenAI spans
- A raw-log adapter for teams running their own SDK wrappers
- Single-trace diagnosis with a structured output: failing step, root
  cause, suggested fix, confidence
- A CLI for piping traces from a file or a tail
- A self-hosted Docker image, no telemetry phoning home

The diagnosis model is not GPT-4 with a clever prompt. The first
public release uses a small fine-tuned classifier in front of a
larger reasoning step. The first release covers a hand-curated set
of failure categories built from real traces. New categories ship
monthly.

Eval suite runner ships in v0.2. Multi-trace pattern detection ships
in v0.3.

## Pricing, in writing

Self-host: free, MIT licensed, no limits. Your traces never leave
your infra. This is the default for v1.

Hobbyist cloud: $19/mo, 10k diagnoses, one user. For solo devs who
want the SaaS without running it.

Team cloud: $49/mo, 100k diagnoses, five users. For small teams
that want shared traces and history.

Annual is 17% off both tiers. Cloud opens Q3 2026.

If you self-host, you owe me nothing. The license is MIT and I
mean it.

## Why Codepawl, why now

Codepawl is a one-person dev tools studio. Trace is the first
product. The studio framing is deliberate: I am not building a
single SaaS, I am building a small set of tools for engineers
shipping AI systems, all under the same brand and design system.
Trace is what I wanted in front of me through those four thousand
reviews.

The build log lives here. The repo opens to public when the alpha
ships. If you want to know when that happens, watch the GitHub org
or check back here. There is no email signup yet, by design.
