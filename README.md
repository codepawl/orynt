# CodePawl

CodePawl is the company and platform for AI-assisted frontend design systems. The current pivot is focused on one product line: CodePawl Design.

CodePawl Design is planned as an AI frontend design platform that can inspect rendered interfaces, critique UI quality, compare variants, and eventually help generate better frontend work. This repository is intentionally starting with the research and evaluation foundation instead of a polished product shell.

Pawl-JEPA is a planned JEPA-style UI representation model for frontend design critique. Its job is to learn useful representations from rendered UI evidence such as screenshots, DOM structure, accessibility trees, layout metrics, and paired perturbations. It is not implemented yet, and this repo does not train a model today.

PawlBench Design is the planned benchmark and evaluation suite for measuring frontend design quality, robustness, accessibility, and generation improvements. It will grow from the same local render harness used to collect data for Pawl-JEPA.

## Current Milestone

The first milestone is a local render and evaluation harness. Before adding product UI, auth, billing, databases, deployment, hosted inference, or model training, the repo should be able to render static examples locally and collect:

- screenshots
- DOM snapshots
- accessibility snapshots
- layout and performance metrics
- reproducible artifact folders for experiments

The intended next task is to implement the Playwright render harness behind this command:

```bash
uv run codepawl-render examples/simple_landing.html --out artifacts/render_baseline
```

## Repository Layout

```text
apps/
  site/                  Product web app placeholder.
  design/                CodePawl Design product placeholder.
  harness/               Local render/evaluation harness placeholder.
packages/
  renderer/              Future Playwright rendering package.
  metrics/               Future UI metrics package.
  jitter/                Future UI perturbation package.
  generators/            Future fixture and prompt generator package.
  pawl_jepa/             Future model research package.
  pawlbench_design/      Future benchmark package.
experiments/             Staged experiment notes.
reports/                 Research plans and experiment log.
examples/                Static examples for local harness tests.
artifacts/               Local generated outputs, ignored by git.
tests/                   Scaffold and future harness tests.
```

## Setup

This repo is Python-first and uses `uv`.

On Fedora/Linux:

```bash
sudo dnf install -y python3 python3-pip
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync
uv run pytest
```

If `uv` is already installed:

```bash
uv sync
uv run pytest
```

## What Is Intentionally Missing

This scaffold does not include auth, billing, database code, cloud deployment, hosted inference, model training, or a full frontend product. Those should wait until the render harness and evaluation loop are useful locally.
