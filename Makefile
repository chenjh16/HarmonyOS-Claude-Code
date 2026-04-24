# =============================================================================
# Claude Code for HarmonyOS — Build System
# =============================================================================
#
# Build and package the Claude Code CLI for HarmonyOS PC and other platforms.
#
# Quick start:
#   make deps         — install dependencies (uses Bun or npm)
#   make build-npm    — build as npm package
#   make npm-pack     — build + create .tgz
#   make build-ohos   — build + bundle for HarmonyOS PC deployment
#   make dev          — run from source
#
# Requirements:
#   - Bun >= 1.2 (https://bun.sh) — for building
#   - The resulting npm package runs on plain Node.js >= 20 (no Bun needed)
#
# =============================================================================

SHELL  := /bin/bash
.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

VERSION ?= $(shell node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0-dev")

SRC_DIR     := src
ENTRY_POINT := $(SRC_DIR)/entrypoints/cli.tsx
DIST_DIR    ?= dist
NPM_DIST    ?= npm-dist
SCRIPT_DIR  := script

export REPO_ROOT ?= $(CURDIR)

BUN ?= $(or \
  $(shell command -v bun 2>/dev/null), \
  $(wildcard $(HOME)/.bun/bin/bun), \
  $(wildcard /usr/local/bin/bun), \
  bun \
)

BIN_NAME := claude
PREFIX   ?= /usr/local

UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

ifeq ($(UNAME_S),Darwin)
  HOST_OS := darwin
else ifeq ($(UNAME_S),Linux)
  HOST_OS := linux
else
  HOST_OS := win32
endif

ifeq ($(UNAME_M),arm64)
  HOST_ARCH := arm64
else ifeq ($(UNAME_M),aarch64)
  HOST_ARCH := arm64
else
  HOST_ARCH := x64
endif

HOST_TARGET := $(HOST_OS)-$(HOST_ARCH)
HOST_EXT    := $(if $(filter win32,$(HOST_OS)),.exe,)
HOST_OUT    := $(DIST_DIR)/claude-code-$(HOST_TARGET)/$(BIN_NAME)$(HOST_EXT)

.PHONY: all build build-npm build-all build-target build-ohos release \
        npm-pack npm-install gh-release \
        run run-quick dev deps stubs typecheck test lint install uninstall \
        smoke-test clean distclean check-bun help

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------

help: ## Show this help message
	@echo ""
	@echo "  Claude Code for HarmonyOS (v$(VERSION))"
	@echo ""
	@echo "  Usage: make [target]"
	@echo ""
	@echo "  Build Targets:"
	@echo "    deps                 Install dependencies"
	@echo "    stubs                Create stub modules"
	@echo "    build-npm            Build as npm package"
	@echo "    npm-pack             Build and pack as .tgz"
	@echo "    npm-install          Build and install globally via npm"
	@echo "    build                Build standalone binary for current platform"
	@echo "    build-all            Build for all 6 platforms"
	@echo "    build-target         Build for specific target (T=os-arch)"
	@echo "    build-ohos           Build npm package + deploy bundle for HarmonyOS PC"
	@echo "    release              Build + package release for all platforms"
	@echo "    gh-release           Build all + create GitHub Release"
	@echo ""
	@echo "  Run:"
	@echo "    dev                  Run from source"
	@echo "    run                  Build and run the binary"
	@echo "    run-quick            Build and run (skip onboarding)"
	@echo "    install              Install to PREFIX (default: /usr/local)"
	@echo "    uninstall            Remove from PREFIX"
	@echo ""
	@echo "  Quality:"
	@echo "    typecheck            Run TypeScript type checking"
	@echo "    test                 Run tests"
	@echo "    lint                 Run linter"
	@echo "    smoke-test           Build and run smoke test"
	@echo ""
	@echo "  Other:"
	@echo "    clean                Remove build artifacts"
	@echo "    distclean            Remove build artifacts and node_modules"
	@echo ""
	@echo "  Variables:"
	@echo "    VERSION              Build version (default: from package.json)"
	@echo "    PREFIX               Install prefix (default: /usr/local)"
	@echo "    T                    Target platform (e.g. T=linux-x64)"
	@echo ""
	@echo "  Note: Bun >= 1.2 is required for building."
	@echo "  Install: curl -fsSL https://bun.sh/install | bash"
	@echo "  The output npm package runs on plain Node.js >= 20."
	@echo ""

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

check-bun:
	@command -v $(BUN) >/dev/null 2>&1 || { \
	  echo "  ✗ Bun not found. Install: curl -fsSL https://bun.sh/install | bash"; \
	  exit 1; \
	}

deps: check-bun ## Install dependencies
	@echo "  Installing dependencies..."
	@$(BUN) install
	@echo "  ✓ Dependencies installed"

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

dev: deps ## Run from source (development mode)
	@$(BUN) run --conditions=browser $(ENTRY_POINT)

typecheck: deps ## Run TypeScript type checking
	@$(BUN) run --bun tsc --noEmit

test: deps ## Run tests
	@$(BUN) test --timeout 30000

lint: deps ## Run linter
	@$(BUN) run biome check $(SRC_DIR)/

# ---------------------------------------------------------------------------
# Build: npm package
# ---------------------------------------------------------------------------

stubs: check-bun ## Create stub modules for missing internal files
	@$(BUN) run $(SCRIPT_DIR)/create-stubs.ts

build-npm: deps stubs ## Build as npm package
	@echo ""
	@echo "  Building Claude Code v$(VERSION) as npm package..."
	@echo ""
	@CLAUDE_CODE_VERSION=$(VERSION) $(BUN) run $(SCRIPT_DIR)/build-npm.ts
	@echo ""
	@printf "  \033[1;32m→ %s/\033[0m\n\n" "$(CURDIR)/$(NPM_DIST)"

npm-pack: build-npm ## Build and pack as .tgz for npm publish
	@cd $(NPM_DIST) && npm pack
	@printf "  ✓ Package: \033[1;32m%s\033[0m\n" "$(CURDIR)/$(NPM_DIST)/claude-code-ohos-$(VERSION).tgz"

npm-install: build-npm ## Build and install globally via npm
	@echo "  Installing claude-code globally..."
	@npm install -g ./$(NPM_DIST)/
	@printf "  ✓ Installed: \033[1;32m%s\033[0m\n" "$$(which claude 2>/dev/null || echo '(claude not in PATH)')"

# ---------------------------------------------------------------------------
# Build: HarmonyOS PC (npm package + deploy bundle)
# ---------------------------------------------------------------------------
#
# HarmonyOS PC cannot use standalone binaries (Bun has no ohos compile target).
# Instead, Claude Code runs as a pure-JavaScript npm package on Node.js >= 20.
# This target produces a ready-to-deploy bundle:
#   npm-dist/claude-code-ohos-<version>.tgz   (npm package)
#   npm-dist/start-claude.sh                           (startup script)

OHOS_DEPLOY_DIR ?= ohos-deploy

build-ohos: npm-pack ## Build npm package + deploy bundle for HarmonyOS PC
	@echo ""
	@echo "  ╔══════════════════════════════════════════╗"
	@echo "  ║  HarmonyOS PC Deploy Bundle              ║"
	@echo "  ╚══════════════════════════════════════════╝"
	@echo ""
	@rm -rf $(OHOS_DEPLOY_DIR)
	@mkdir -p $(OHOS_DEPLOY_DIR)
	@cp $(NPM_DIST)/claude-code-ohos-$(VERSION).tgz $(OHOS_DEPLOY_DIR)/
	@cp start-claude.sh $(OHOS_DEPLOY_DIR)/
	@echo '#!/bin/sh'                                                          > $(OHOS_DEPLOY_DIR)/install.sh
	@echo '# Quick install script for HarmonyOS PC'                           >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo '# Transfer this directory to HarmonyOS PC, then run:'              >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo '#   sh install.sh'                                                 >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'set -e'                                                            >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'cd "$$(dirname "$$0")"'                                            >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'TGZ=$$(ls claude-code-ohos-*.tgz 2>/dev/null | head -1)'  >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'if [ -z "$$TGZ" ]; then echo "Error: .tgz not found"; exit 1; fi'  >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'echo "Installing $$TGZ ..."'                                       >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'npm install -g "$$TGZ"'                                            >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'mkdir -p ~/.claude'                                                >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'cp start-claude.sh ~/.claude/start-claude.sh'                      >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'chmod +x ~/.claude/start-claude.sh'                                >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'echo ""'                                                           >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'echo "Done! Edit ~/.claude/start-claude.sh, then run:"'            >> $(OHOS_DEPLOY_DIR)/install.sh
	@echo 'echo "  sh ~/.claude/start-claude.sh"'                             >> $(OHOS_DEPLOY_DIR)/install.sh
	@chmod +x $(OHOS_DEPLOY_DIR)/install.sh
	@echo "  ✓ Deploy bundle ready:"
	@ls -lh $(OHOS_DEPLOY_DIR)/
	@echo ""
	@printf "  \033[1;32m→ %s/\033[0m\n" "$(CURDIR)/$(OHOS_DEPLOY_DIR)"
	@echo ""
	@echo "  Deploy to HarmonyOS PC:"
	@echo "    1. Transfer $(OHOS_DEPLOY_DIR)/ to the device"
	@echo "    2. In HiShell: sh install.sh"
	@echo "    3. Set ANTHROPIC_AUTH_TOKEN and run: sh ~/.claude/start-claude.sh"
	@echo ""

# ---------------------------------------------------------------------------
# Build: standalone binary
# ---------------------------------------------------------------------------

build: deps stubs ## Build standalone binary for current platform
	@echo ""
	@echo "  Building Claude Code v$(VERSION) for $(HOST_TARGET)..."
	@echo ""
	@CLAUDE_CODE_VERSION=$(VERSION) $(BUN) run $(SCRIPT_DIR)/build.ts
	@echo ""
	@if [ -f "$(HOST_OUT)" ]; then \
	  echo "  ✓ Size: $$(du -h "$(HOST_OUT)" | cut -f1)"; \
	  printf "  \033[1;32m→ %s\033[0m\n\n" "$(CURDIR)/$(HOST_OUT)"; \
	fi

build-target: deps stubs ## Build for specific target (T=os-arch, e.g. T=linux-x64)
ifndef T
	$(error T is not set. Usage: make build-target T=linux-x64)
endif
	@echo "  Building for $(T)..."
	@CLAUDE_CODE_VERSION=$(VERSION) $(BUN) run $(SCRIPT_DIR)/build.ts --target $(T)
	@printf "  \033[1;32m→ %s/claude-code-%s/\033[0m\n" "$(CURDIR)/$(DIST_DIR)" "$(T)"

build-all: deps stubs ## Build for all 6 platforms
	@echo ""
	@echo "  Building Claude Code v$(VERSION) for all platforms..."
	@echo ""
	@CLAUDE_CODE_VERSION=$(VERSION) $(BUN) run $(SCRIPT_DIR)/build.ts --all
	@printf "\n  \033[1;32m→ %s/\033[0m\n" "$(CURDIR)/$(DIST_DIR)"

# ---------------------------------------------------------------------------
# Release
# ---------------------------------------------------------------------------

release: deps stubs ## Build + package release for all platforms
	@echo ""
	@echo "  ╔══════════════════════════════════════════╗"
	@echo "  ║  Claude Code Release Build v$(VERSION)         ║"
	@echo "  ╚══════════════════════════════════════════╝"
	@echo ""
	@CLAUDE_CODE_VERSION=$(VERSION) $(BUN) run $(SCRIPT_DIR)/build.ts --all --release
	@echo ""
	@echo "  Release artifacts:"
	@ls -lh $(DIST_DIR)/*.tar.gz $(DIST_DIR)/*.zip $(DIST_DIR)/*.sha256 2>/dev/null || true
	@printf "\n  \033[1;32m→ %s/\033[0m\n\n" "$(CURDIR)/$(DIST_DIR)"

GH_REPO ?= chenjh16/HarmonyOS-Claude-Code

gh-release: release npm-pack ## Build all platforms + npm package, then create GitHub Release
	@echo ""
	@echo "  ╔══════════════════════════════════════════╗"
	@echo "  ║  GitHub Release v$(VERSION)                    ║"
	@echo "  ╚══════════════════════════════════════════╝"
	@echo ""
	@command -v gh >/dev/null 2>&1 || { echo "  ✗ gh CLI not found. Install: https://cli.github.com"; exit 1; }
	@echo "  Repository: $(GH_REPO)"
	@echo "  Creating release v$(VERSION)..."
	@echo ""
	@gh release create "v$(VERSION)" \
	  --repo "$(GH_REPO)" \
	  --title "Claude Code for HarmonyOS v$(VERSION)" \
	  --notes "Claude Code for HarmonyOS PC (npm package, Node.js >= 20). Also includes standalone binaries for macOS / Linux / Windows." \
	  $(NPM_DIST)/claude-code-ohos-$(VERSION).tgz \
	  $(DIST_DIR)/*.tar.gz \
	  $(DIST_DIR)/*.zip \
	  $(DIST_DIR)/*.sha256 \
	  2>&1 || { \
	    echo ""; \
	    echo "  Release v$(VERSION) may already exist. Uploading assets to existing release..."; \
	    gh release upload "v$(VERSION)" \
	      --repo "$(GH_REPO)" \
	      --clobber \
	      $(DIST_DIR)/*.tar.gz \
	      $(DIST_DIR)/*.zip \
	      $(DIST_DIR)/*.sha256 \
	      $(NPM_DIST)/claude-code-ohos-$(VERSION).tgz; \
	  }
	@echo ""
	@echo "  ✓ Release v$(VERSION) published"
	@printf "  \033[1;32m→ https://github.com/%s/releases/tag/v%s\033[0m\n\n" "$(GH_REPO)" "$(VERSION)"

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

run: build ## Build and run the binary (interactive TUI)
	@$(HOST_OUT) $(ARGS)

run-quick: build ## Build and run, skip onboarding
	@IS_DEMO=1 $(HOST_OUT) $(ARGS)

smoke-test: build ## Build and run smoke test
	@echo "  Running smoke test..."
	@$(HOST_OUT) --version
	@printf "  ✓ Smoke test passed: \033[1;32m%s\033[0m\n" "$(CURDIR)/$(HOST_OUT)"

# ---------------------------------------------------------------------------
# Install / Uninstall
# ---------------------------------------------------------------------------

install: build ## Install to PREFIX (default: /usr/local)
	@echo "  Installing to $(PREFIX)/bin/$(BIN_NAME)..."
	@install -d "$(PREFIX)/bin"
	@install -m 755 "$(HOST_OUT)" "$(PREFIX)/bin/$(BIN_NAME)"
	@printf "  ✓ Installed: \033[1;32m%s\033[0m\n" "$(PREFIX)/bin/$(BIN_NAME)"

uninstall: ## Remove from PREFIX
	@echo "  Removing $(PREFIX)/bin/$(BIN_NAME)..."
	@rm -f "$(PREFIX)/bin/$(BIN_NAME)"
	@echo "  ✓ Uninstalled"

# ---------------------------------------------------------------------------
# Clean
# ---------------------------------------------------------------------------

clean: ## Remove build artifacts
	@rm -rf $(DIST_DIR) $(NPM_DIST) $(OHOS_DEPLOY_DIR)
	@echo "  ✓ Clean"

distclean: clean ## Remove build artifacts and node_modules
	@rm -rf node_modules
	@echo "  ✓ Distclean"
