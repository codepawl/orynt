SHELL := /bin/sh

.DEFAULT_GOAL := cli

BUN ?= bun

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
	bun.lock \
	bunfig.toml \
	$(CLI_PACKAGE_CONFIGS) \
	$(CLI_SOURCE_TREE)
CLI_RUNTIME_OUTPUTS := $(patsubst %.ts,%.js,$(subst /src/,/dist/,$(CLI_SOURCE_FILES)))

.PHONY: \
	help \
	cli cli-build cli-rebuild cli-preflight \
	desktop desktop-web desktop-build desktop-test desktop-check \
	desktop-package desktop-package-unsigned desktop-preflight

help:
	@printf '%s\n' \
		'Orynt development targets:' \
		'' \
		'  make                         Build and run the CLI (default)' \
		'  make cli                    Build and run the CLI' \
		'  make cli-build              Incrementally build the CLI' \
		'  make cli-rebuild            Force a full CLI build' \
		'' \
		'  make desktop                Build and run the Tauri desktop app' \
		'  make desktop-web            Run only the desktop renderer in a browser' \
		'  make desktop-build          Typecheck and build Tauri plus renderer' \
		'  make desktop-test           Run desktop runtime and renderer tests' \
		'  make desktop-check          Run desktop tests and integrated build' \
		'  make desktop-package        Build a signed package (fail-closed)' \
		'  make desktop-package-unsigned' \
		'                               Build an explicit unsigned smoke package'

cli: cli-build
	@exec $(BUN) run scripts/run-cli.mjs

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
		$(BUN) run build:cli; \
	fi; \
	for output in $(CLI_RUNTIME_OUTPUTS); do \
		if [ ! -f "$$output" ]; then \
			printf 'CLI build did not produce required output: %s\n' "$$output" >&2; \
			exit 1; \
		fi; \
	done

$(CLI_ENTRY): $(CLI_BUILD_INPUTS) | cli-preflight
	$(BUN) run build:cli

cli-rebuild: cli-preflight
	$(BUN) run build:cli

cli-preflight:
	@command -v $(BUN) >/dev/null 2>&1 || { printf '%s\n' 'Bun is required to build and run the Orynt CLI.' >&2; exit 1; }
	@test -d packages/cli/node_modules || { printf '%s\n' 'Workspace dependencies are unavailable. Run bun install first.' >&2; exit 1; }

desktop: desktop-preflight
	@exec $(BUN) run dev:desktop

desktop-web: desktop-preflight
	@exec $(BUN) run dev:desktop:web

desktop-build: desktop-preflight
	$(BUN) run build:desktop

desktop-test: desktop-preflight
	$(BUN) run test:desktop

desktop-check: desktop-preflight
	$(BUN) run check:desktop

desktop-package: desktop-preflight
	$(BUN) run package:desktop

desktop-package-unsigned: desktop-preflight
	$(BUN) run package:desktop:unsigned

desktop-preflight:
	@command -v $(BUN) >/dev/null 2>&1 || { printf '%s\n' 'Bun is required to build the Orynt Tauri app.' >&2; exit 1; }
	@command -v cargo >/dev/null 2>&1 || { printf '%s\n' 'Rust is required to build the Orynt Tauri app.' >&2; exit 1; }
	@test -d apps/desktop/node_modules || { printf '%s\n' 'Workspace dependencies are unavailable. Run bun install first.' >&2; exit 1; }
	@test -f apps/desktop/src-tauri/tauri.conf.json || { printf '%s\n' 'Tauri configuration is missing.' >&2; exit 1; }
