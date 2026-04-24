#!/bin/sh
# Claude Code Startup Script for HarmonyOS PC
#
# This script is automatically installed to ~/.claude/start-claude.sh
# during `npm install`. You can also copy it manually:
#   cp start-claude.sh ~/.claude/start-claude.sh
#
# Configure your API credentials below, then run from ~/Claude:
#   mkdir -p ~/Claude && cd ~/Claude
#   sh ~/.claude/start-claude.sh
#
# This script handles HarmonyOS-specific environment setup:
#   - API configuration (replace placeholders with your own credentials)
#   - TLS certificate workaround (NODE_TLS_REJECT_UNAUTHORIZED=0)
#   - TMPDIR redirect (/tmp is read-only on HarmonyOS PC)
#   - Onboarding skip
#   - PATH setup for npm global binaries

# ── Load .env (if present) ────────────────────────────────────
# Credentials and endpoints are loaded from ~/.claude/.env
# Copy ~/.claude/.env.example to ~/.claude/.env and fill in your values.
if [ -f ~/.claude/.env ]; then
    set -a
    . ~/.claude/.env
    set +a
fi

# ── API Configuration ──────────────────────────────────────────
# Option A: LiteLLM proxy (GLM-5 / Qwen — recommended for HarmonyOS PC)
#   Uses ANTHROPIC_API_KEY for authentication.
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:?Please set ANTHROPIC_API_KEY}"
export ANTHROPIC_AUTH_TOKEN=''
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-http://<your-litellm-host>:<port>}"
#
# Option B: Claude API proxy (anyrouter / gift)
#   Uncomment the block below and comment out Option A above.
# export ANTHROPIC_API_KEY=''
# export ANTHROPIC_AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:?Please set ANTHROPIC_AUTH_TOKEN}"
# export ANTHROPIC_BASE_URL=https://your-api-endpoint-here
#
# Disable billing attribution header (recommended for third-party proxies).
export CLAUDE_CODE_ATTRIBUTION_HEADER=0

# ── Model Configuration ───────────────────────────────────────
# Priority: --model flag > ANTHROPIC_MODEL env > settings.json > built-in default
#
# === LiteLLM provider (GLM-5 / Qwen) ===
# LiteLLM translates Claude API calls to backend models (GLM-5, Qwen3.6-Plus).
# Model names here are LiteLLM route names, not actual Claude model IDs.
export ANTHROPIC_MODEL='GLM-5'
export ANTHROPIC_DEFAULT_OPUS_MODEL='GLM-5'
export ANTHROPIC_DEFAULT_SONNET_MODEL='GLM-5'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='Qwen3.6-Plus'
export ANTHROPIC_SMALL_FAST_MODEL='Qwen3.6-Plus'
#
# === Claude API proxy (anyrouter / gift) ===
# Uncomment the block below and comment out the LiteLLM block above
# to use actual Claude models.
# export ANTHROPIC_MODEL='opus[1m]'
# export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-6[1m]'
# export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-opus-4-6[1m]'
# export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5-20251001[1m]'
# export ANTHROPIC_SMALL_FAST_MODEL='claude-haiku-4-5-20251001[1m]'

# ── Privacy & Network Toggles ──────────────────────────────────
# All four toggles are parallel and independent. Set any combination.
#
# 1) Original Claude Code toggle — suppresses auto-update, release notes,
#    GrowthBook, MCP registry prefetch, analytics, metrics, and more.
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
#
# 2) Anthropic account features — disables OAuth login, settings sync,
#    transcript sharing, metrics opt-out check, Grove notifications,
#    bootstrap API, referral, credit grants, Claude AI limits.
#    Recommended when using a third-party API proxy instead of Anthropic.
export CLAUDE_CODE_SKIP_ANTHROPIC_ACCOUNT=1
#
# 3) WebFetch domain blocklist — skips the remote domain check at
#    api.anthropic.com/api/web/domain_info; allows WebFetch to access
#    any URL without pre-approval. Useful behind proxies that block
#    api.anthropic.com.
export CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK=1
#
# 4) Telemetry only — disables Datadog, first-party event logging,
#    GrowthBook experiments. Less restrictive than (1).
export DISABLE_TELEMETRY=1

# ── TLS Certificate Workaround ────────────────────────────────
# HarmonyOS PC's system CA certificate store is incomplete (missing DigiCert
# and other common CAs). This causes Node.js TLS verification to fail for
# many HTTPS websites (e.g. WebFetch tool). Setting this to 0 disables
# certificate verification in Node.js, allowing WebFetch to work with any
# HTTPS URL. The API proxy itself uses a trusted CA chain and is unaffected.
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Ensure npm global binaries are on PATH
export PATH=$(npm prefix -g)/bin:$PATH

# HarmonyOS PC: /tmp is read-only, redirect temp to writable location
export TMPDIR=$HOME/.claude/tmp
export CLAUDE_CODE_TMPDIR=$HOME/.claude/tmp
mkdir -p "$TMPDIR"

# Skip onboarding wizard
mkdir -p ~/.claude
if [ ! -f ~/.claude/config.json ]; then
    echo '{"hasCompletedOnboarding":true}' > ~/.claude/config.json
fi

# Launch Claude Code
echo "Starting Claude Code..."
claude "$@"
