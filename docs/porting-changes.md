# Claude Code for HarmonyOS — Porting Changes

This document catalogs all modifications made to the upstream
[Claude Code](https://github.com/anthropics/claude-code) source for
HarmonyOS PC compatibility and standalone npm packaging.

## Change Categories

| # | Category | Problem | Solution | Key Files |
|---|----------|---------|----------|-----------|
| 1 | [Build System & Packaging](#1-build-system--packaging) | Bun-specific build features | npm package build path | `build-npm.ts`, `Makefile`, `package.json` |
| 2 | [N-API Module Replacements](#2-n-api-module-replacements) | Native C++ modules missing for HarmonyOS | Pure TS ports | `colorDiff.ts`, `modifiers.ts` |
| 3 | [Missing npm Packages](#3-missing-npm-packages) | Internal/external packages incorrectly handled | Install public + stub internal | `package.json`, `create-stubs.ts` |
| 4 | [Stub Source Files](#4-stub-source-files) | Internal source files not in open-source | Export stubs | 15+ stub files |
| 5 | [Ripgrep Integration](#5-ripgrep-integration) | Embedded rg won't work in npm mode | Postinstall download + signing | `postinstall-rg.mjs`, `rg-embedded.ts`, `ripgrep.ts` |
| 6 | [API Compatibility](#6-api-compatibility) | Tool Search restricted to first-party endpoints | Removed restriction | `toolSearch.ts` |
| 7 | [CLI Compatibility](#7-cli-compatibility) | `-d2e` short flag parsing issues | Long-form only | `main.tsx` |
| 8 | [OpenHarmony Platform Support](#8-openharmony-platform-support) | Multiple platform-specific issues | Platform detection + workarounds | `ripgrep.ts`, `postinstall-rg.mjs` |

---

## 1. Build System & Packaging

### Problem

The original Claude Code build system is tightly coupled to Bun:
- `bun build --compile` produces a standalone binary with the Bun runtime embedded
- Feature flags use Bun's `define` compile-time replacement (`MACRO.VERSION`, etc.)
- Ripgrep is embedded via `import ... with { type: "file" }` (Bun-specific)

The standalone binary requires glibc, but HarmonyOS PC uses musl libc,
making the Bun binary incompatible.

### Solution

Created a parallel npm package build path:

- **`script/build-npm.ts`** — Bundles all source into a single `cli.js` using
  Bun's bundler, but outputs standard ESM JavaScript (no Bun runtime needed).
  Replaces compile-time feature flags with environment variable lookups.

- **`Makefile`** — Added `npm-pack`, `npm-install` targets alongside the
  existing `build` (standalone binary) targets.

- **`package.json`** — Configured `bin`, `files`, and npm scripts for global
  installation via `npm install -g`.

### Trade-offs

- Bun is still required for building (the bundler uses Bun-specific features
  for tree-shaking ~30 feature-gated modules)
- The npm package output is standard ESM and runs on any Node.js >= 20

---

## 2. N-API Module Replacements

### Problem

Claude Code uses two N-API (native C++ addon) packages:

| Package | Purpose | Issue |
|---------|---------|-------|
| `color-diff-napi` | Syntax highlighting for diffs | No pre-built binary for `openharmony-arm64` |
| `modifiers-napi` | Keyboard modifier key detection (macOS only) | No pre-built binary; macOS-specific |

### Solution

**`color-diff-napi` → TypeScript port** (`src/native-ts/color-diff/`)
- Ported the color diff algorithm to pure TypeScript
- Import path changed: `from 'color-diff-napi'` → `from '../../native-ts/color-diff/index.js'`
- File: `src/components/StructuredDiff/colorDiff.ts`

**`modifiers-napi` → `keyspy`** (cross-platform keyboard listener)
- Replaced the macOS-only N-API module with `keyspy`, a cross-platform
  keyboard event listener
- Changed from synchronous polling (`nativeIsModifierPressed`) to event-driven
  state tracking with a `GlobalKeyboardListener`
- File: `src/utils/modifiers.ts`

---

## 3. Missing npm Packages

### Problem

The Claude Code source references npm packages from the `@anthropic-ai/`
namespace. Some are publicly available on npm but were initially treated as
internal-only (replaced with stubs). Others are genuinely internal to
Anthropic and not publicly available.

### Solution

**Phase 1: Discovery** — Scanned all imports, identified which packages exist
on npm via registry queries.

**Phase 2: Install public packages** — 7 packages found to be publicly available
on npm were installed as real dependencies:

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/claude-agent-sdk` | ^0.2.87 | Agent SDK type definitions |
| `@anthropic-ai/sandbox-runtime` | ^0.0.44 | Bash command sandbox (bubblewrap/seccomp) |
| `@anthropic-ai/mcpb` | ^2.1.2 | MCP Bundle manifest parsing |
| `@anthropic-ai/bedrock-sdk` | ^0.26.4 | AWS Bedrock access |
| `@anthropic-ai/vertex-sdk` | ^1.1.4 | Google Vertex AI access |
| `@anthropic-ai/foundry-sdk` | ^0.1.0 | Azure Foundry access |
| `@azure/identity` | ^4.8.0 | Azure authentication |

**Phase 3: Stub internal packages** — 4 packages from the `@ant/*` namespace
are genuinely internal to Anthropic and not published on npm. These remain
as stubs:

| Package | Purpose | Impact |
|---------|---------|--------|
| `@ant/computer-use-mcp` | Desktop automation MCP server (12 imports) | Computer Use feature unavailable |
| `@ant/claude-for-chrome-mcp` | Chrome extension MCP integration (3 imports) | Chrome integration unavailable |
| `@ant/computer-use-swift` | macOS native Computer Use via Swift (1 import) | macOS desktop control unavailable |
| `@ant/computer-use-input` | Input device abstraction for Computer Use (1 import) | Computer Use input unavailable |

All stubs are auto-generated by `script/create-stubs.ts` at build time.

---

## 4. Stub Source Files

### Problem

The Claude Code source references ~51 internal source files not included in
the open-source release. Key categories:

| Category | Examples | Impact |
|----------|----------|--------|
| Feature-gated UI components | `AssistantSessionChooser.ts`, `SnapshotUpdateDialog.ts` | Low — behind feature flags |
| Internal tools | `TungstenTool/`, `REPLTool/`, `SuggestBackgroundPRTool/` | Medium — tools unavailable |
| SDK types | `entrypoints/sdk/coreTypes.generated.ts` (3 files) | Low — type-only exports |
| Internal utilities | `protectedNamespace.ts`, `contextCollapse/` | Low — return false/null |
| Skill content | `skills/bundled/verify/**/*.md`, `claude-api/**/*.md` (28 files) | Medium — placeholder content |
| Dev tools | `ink/devtools.ts`, `global.d.ts` | Low — dev-only |

### Solution

Created minimal stub files that export null/empty values:

```typescript
export const AssistantSessionChooser = () => null
export default null
export {}
export function isInProtectedNamespaceInternal(): boolean { return false }
```

Generated by `script/create-stubs.ts`, which scans for missing imports
and creates appropriate stubs. Total: ~51 stub files.

---

## 5. Ripgrep Integration

### Problem

Multiple issues with ripgrep on HarmonyOS PC:

1. **Embedded binary**: The standalone build embeds `rg` via Bun's
   `embeddedFiles`, but the npm package doesn't have this mechanism.
2. **Vendored binary**: The npm package vendors platform-specific `rg`
   binaries, but no `arm64-openharmony` binary exists.
3. **musl libc**: HarmonyOS uses musl, not glibc. Standard Linux `rg` binaries
   crash with `SIGABRT`.
4. **Security sandbox**: HarmonyOS blocks execution of downloaded binaries
   unless signed with `binary-sign-tool`.
5. **Pipe capture bug**: Node.js stdout pipe capture returns empty buffers
   on OpenHarmony. See [openharmony-pipe-fix.md](openharmony-pipe-fix.md).

### Solution

**`src/utils/rg-embedded.ts`** (new) — Extraction logic for embedded ripgrep.
Checks `~/.claude/bin/rg` version cache, extracts from Bun `embeddedFiles`
when needed.

**`src/utils/rg-data.ts`** (new) — Static import of vendor/rg using Bun's
file embedding attribute.

**`src/utils/ripgrep.ts`** — Three major changes:
1. Modified `getRipgrepConfig()` to add step 2b: check `~/.claude/bin/rg`
   (postinstall-downloaded binary) before falling back to vendored binary.
2. Added `isOpenHarmony` platform detection and file-based I/O workaround
   for the pipe capture bug.
3. Added `ripGrepRawViaFile()` function that redirects rg output to temp
   files instead of relying on pipe capture.

**`script/postinstall-rg.mjs`** — npm postinstall script:
- Detects `openharmony` platform and downloads musl-compatible `rg` binary
- Signs the binary with `binary-sign-tool` if available
- Falls back gracefully if signing fails (user must enable system setting)

---

## 6. API Compatibility

### Problem

The `isToolSearchEnabledOptimistic()` function in `toolSearch.ts` disabled
Tool Search (defer_loading + tool_reference) when `ANTHROPIC_BASE_URL` pointed
to a non-Anthropic host. This blocked third-party API proxies from using
tool_reference features, even though many proxies (LiteLLM, Cloudflare AI
Gateway, etc.) support them.

### Solution

Removed the first-party URL restriction. Tool Search is now enabled for all
API endpoints. Users can disable via `ENABLE_TOOL_SEARCH=false` if their
proxy doesn't support `tool_reference` blocks.

```diff
-  if (
-    !process.env.ENABLE_TOOL_SEARCH &&
-    getAPIProvider() === 'firstParty' &&
-    !isFirstPartyAnthropicBaseUrl()
-  ) { ... return false }
+  // Tool Search enabled for all API endpoints.
+  // Disable via ENABLE_TOOL_SEARCH=false if needed.
```

Also removed the import of `getAPIProvider` and `isFirstPartyAnthropicBaseUrl`
since they're no longer used.

---

## 7. CLI Compatibility

### Problem

The `-d2e` short flag alias for `--debug-to-stderr` caused parsing issues
with Commander.js on some platforms.

### Solution

Changed to long-form only: `--debug-to-stderr` (removed the `-d2e` alias).

```diff
-  .addOption(new Option('-d2e, --debug-to-stderr', ...))
+  .addOption(new Option('--debug-to-stderr', ...))
```

---

## 8. OpenHarmony Platform Support

### Problem

HarmonyOS 6.0 PC reports `process.platform === 'openharmony'`, which is
unrecognized by standard Node.js code. Several platform-specific issues:

| Issue | Root Cause |
|-------|-----------|
| `process.platform` unknown | OpenHarmony reports as `'openharmony'`, not `'linux'` |
| `/tmp` read-only | HarmonyOS sandbox restricts temp directory |
| Pipe capture broken | Kernel bug: stdout pipes return empty from signed binaries |
| No pre-built `rg` | No `arm64-openharmony` ripgrep binary exists |
| Binary execution blocked | Security sandbox requires `binary-sign-tool` signing |

### Solution

| Fix | Implementation |
|-----|---------------|
| Platform detection | `isOpenHarmony = process.platform === 'openharmony'` in `ripgrep.ts` |
| Platform mapping in postinstall | Map `openharmony` → `linux.arm64_musl` in `postinstall-rg.mjs` |
| TMPDIR workaround | `CLAUDE_CODE_TMPDIR` env var (set in `start-claude.sh`) |
| Pipe workaround | File-based I/O in `ripGrepRawViaFile()` — see [openharmony-pipe-fix.md](openharmony-pipe-fix.md) |
| Binary signing | Auto-sign with `binary-sign-tool` in `postinstall-rg.mjs` |
| System setting | Document one-time "Run extensions not from the app store" in README |

---

## 9. Non-Essential Network Traffic Toggle

### Problem

Claude Code makes numerous network requests beyond core LLM API calls:
analytics/telemetry (Datadog, 1P events), OAuth authentication, auto-update
version checks, settings sync, transcript sharing, feature flags (GrowthBook),
MCP registry prefetch, WebFetch domain blocklist checks, and BigQuery metrics.
On third-party deployments these requests are unnecessary and potentially
privacy-concerning.

### Solution

Leveraged the existing `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` environment
variable and `isEssentialTrafficOnly()` guard function from `privacyLevel.ts`.
Added two new parallel toggles: `CLAUDE_CODE_SKIP_ANTHROPIC_ACCOUNT` (disables
9 account-related access points) and `CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK`
(bypasses WebFetch domain blocklist). Several network access points were
already gated; added guards to additional files:

| File | Function | Effect |
|------|----------|--------|
| `utils/auth.ts` | `isAnthropicAuthEnabled()` | OAuth disabled, API key only |
| `utils/autoUpdater.ts` | `assertMinVersion()` | Version check skipped |
| `components/FeedbackSurvey/submitTranscriptShare.ts` | `submitTranscriptShare()` | Transcript sharing blocked |
| `services/settingsSync/index.ts` | upload/download/redownload | Settings sync disabled |
| `tools/WebFetchTool/utils.ts` | `checkDomainBlocklist()` | All domains allowed locally |
| `utils/telemetry/bigqueryExporter.ts` | `export()` | Metrics export no-op |
| `services/api/metricsOptOut.ts` | `checkMetricsEnabled()` | Returns disabled immediately |

Remaining active: LLM API calls, Tool Search, WebFetch tool, MCP client, Bash commands.

### Key File

- `src/utils/privacyLevel.ts` — centralized privacy level system

See [nonessential-traffic-toggle.md](nonessential-traffic-toggle.md) for full details.

---

## 10. TLS Certificate Store Workaround

### Problem

HarmonyOS PC's system CA certificate store is incomplete — it lacks DigiCert and
other widely-used Certificate Authorities. This causes Node.js TLS verification
to fail when tools like WebFetch fetch content from HTTPS websites (e.g.
`example.com`), producing `unable to get local issuer certificate` errors. The
API mirror endpoint uses a trusted CA chain and is unaffected.

### Solution

Set `NODE_TLS_REJECT_UNAUTHORIZED=0` in the startup environment to disable
Node.js certificate verification for outbound HTTPS requests. This has been
added to `start-claude.sh`.

| Scope | Impact |
|-------|--------|
| WebFetch tool | Can now fetch any HTTPS URL without TLS errors |
| API calls | Unaffected — mirror endpoint's CA chain is already trusted |
| Security trade-off | Acceptable for local development; no sensitive credentials transmitted over untrusted connections |

### Key File

`start-claude.sh` — added `export NODE_TLS_REJECT_UNAUTHORIZED=0`

---

## File Change Summary

### Modified Source Files

| File | Changes |
|------|---------|
| `src/components/StructuredDiff/colorDiff.ts` | Import path: `color-diff-napi` → `native-ts/color-diff` |
| `src/utils/modifiers.ts` | `modifiers-napi` → `keyspy` event-driven tracking |
| `src/utils/ripgrep.ts` | +260 lines: postinstall path, OpenHarmony pipe workaround |
| `src/utils/toolSearch.ts` | Removed first-party URL restriction |
| `src/main.tsx` | `-d2e` flag removed |
| `src/utils/auth.ts` | +`isEssentialTrafficOnly()` guard on OAuth |
| `src/utils/autoUpdater.ts` | +`isEssentialTrafficOnly()` guard on version check |
| `src/components/FeedbackSurvey/submitTranscriptShare.ts` | +`isEssentialTrafficOnly()` guard |
| `src/services/settingsSync/index.ts` | +`isEssentialTrafficOnly()` guard on sync |
| `src/tools/WebFetchTool/utils.ts` | +`isEssentialTrafficOnly()` guard on domain check |
| `src/utils/telemetry/bigqueryExporter.ts` | +`isEssentialTrafficOnly()` guard on export |
| `src/services/api/metricsOptOut.ts` | +`isEssentialTrafficOnly()` guard on metrics check |

### New Source Files

| File | Purpose |
|------|---------|
| `src/utils/rg-embedded.ts` | Embedded ripgrep extraction logic |
| `src/utils/rg-data.ts` | Bun file embedding import |
| `src/native-ts/color-diff/` | Pure TS port of color-diff-napi |
| 15+ stub files | Missing internal package stubs |

### New Build/Config Files

| File | Purpose |
|------|---------|
| `script/build-npm.ts` | npm package build script |
| `script/postinstall-rg.mjs` | Postinstall ripgrep installer |
| `script/create-stubs.ts` | Stub file generator |
| `start-claude.sh` | HarmonyOS one-click startup |
| `Makefile` | Build system with npm targets |

---

> **Chinese version**: [porting-changes.cn.md](porting-changes.cn.md)
