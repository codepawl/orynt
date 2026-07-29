SHELL := /bin/sh

.DEFAULT_GOAL := cli

PNPM ?= pnpm
NODE ?= node

CLI_ENTRY := packages/cli/dist/main.js
CLI_PACKAGE_DIRS := \
	packages/shared \
	packages/repository-sandbox \
	packages/codex-adapter \
	packages/verifier \
	packages/memory \
	packages/skill-registry \
	packages/cognitive-kernel \
	packages/gateway \
	packages/coding-apprentice \
	packages/cli
CLI_SOURCE_DIRS := $(addsuffix /src,$(CLI_PACKAGE_DIRS))
CLI_SOURCE_FILES := $(shell find $(CLI_SOURCE_DIRS) -type f -name '*.ts' ! -name '*.test.ts' -print 2>/dev/null)
CLI_SOURCE_TREE := $(shell find $(CLI_SOURCE_DIRS) \( -type d -o \( -type f -name '*.ts' ! -name '*.test.ts' \) \) -print 2>/dev/null)
CLI_PACKAGE_CONFIGS := $(foreach package,$(CLI_PACKAGE_DIRS),$(package)/package.json $(package)/tsconfig.json)
CLI_BUILD_INPUTS := \
	Makefile \
	package.json \
	pnpm-lock.yaml \
	pnpm-workspace.yaml \
	$(CLI_PACKAGE_CONFIGS) \
	$(CLI_SOURCE_TREE)
CLI_RUNTIME_OUTPUTS := $(patsubst %.ts,%.js,$(subst /src/,/dist/,$(CLI_SOURCE_FILES)))

.PHONY: cli cli-build cli-rebuild cli-preflight

cli: cli-build
	@exec $(NODE) scripts/run-cli.mjs

cli-build: cli-preflight $(CLI_ENTRY)
	@set -eu; \
	missing=""; \
	for output in $(CLI_RUNTIME_OUTPUTS); do \
		if [ ! -f "$$output" ]; then \
			missing="$$output"; \
			break; \
		fi; \
	done; \
	if [ -n "$$missing" ]; then \
		printf 'CLI runtime output is missing (%s); rebuilding...\n' "$$missing"; \
		$(PNPM) build:cli; \
	fi; \
	for output in $(CLI_RUNTIME_OUTPUTS); do \
		if [ ! -f "$$output" ]; then \
			printf 'CLI build did not produce required output: %s\n' "$$output" >&2; \
			exit 1; \
		fi; \
	done

$(CLI_ENTRY): $(CLI_BUILD_INPUTS) | cli-preflight
	$(PNPM) build:cli

cli-rebuild: cli-preflight
	$(PNPM) build:cli

cli-preflight:
	@command -v $(NODE) >/dev/null 2>&1 || { printf '%s\n' 'Node.js is required to run the Orynt CLI.' >&2; exit 1; }
	@command -v $(PNPM) >/dev/null 2>&1 || { printf '%s\n' 'pnpm is required to build the Orynt CLI.' >&2; exit 1; }
	@test -d packages/cli/node_modules || { printf '%s\n' 'Workspace dependencies are unavailable. Run pnpm install first.' >&2; exit 1; }
