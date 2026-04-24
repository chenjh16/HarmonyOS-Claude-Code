#!/usr/bin/env bun

/**
 * Creates stub modules for files that exist in the original build but are
 * missing from the source snapshot. These are typically:
 * - Internal/generated files (protectedNamespace, connectorText, etc.)
 * - Feature-gated modules behind @ant/* packages
 * - Generated type re-exports
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const srcDir = path.join(projectRoot, "src")

const STUBS: Record<string, string> = {
  // Missing internal modules
  "src/utils/protectedNamespace.ts":
    "export function isInProtectedNamespaceInternal(): boolean { return false }\n",

  "src/types/connectorText.ts":
    "export type ConnectorTextBlock = { type: 'connector_text'; text: string }\nexport function isConnectorTextBlock(b: unknown): b is ConnectorTextBlock { return false }\n",

  // Missing tools (ant-internal or feature-gated with missing source)
  "src/tools/TungstenTool/TungstenTool.ts":
    "export const TungstenTool = null\n",
  "src/tools/TungstenTool/TungstenLiveMonitor.tsx":
    "export const TungstenLiveMonitor = () => null\n",
  "src/tools/REPLTool/REPLTool.ts": "export const REPLTool = null\n",
  "src/tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.ts":
    "export const SuggestBackgroundPRTool = null\n",
  "src/tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.ts":
    "export const VerifyPlanExecutionTool = null\n",
  "src/tools/WorkflowTool/constants.ts":
    "export const WORKFLOW_TOOL_NAME = 'Workflow'\n",

  // Missing commands (ant-internal)
  "src/commands/agents-platform/index.ts": "export default null\n",

  // Missing SDK generated types
  "src/entrypoints/sdk/runtimeTypes.ts": "export {}\n",
  "src/entrypoints/sdk/toolTypes.ts": "export {}\n",
  "src/entrypoints/sdk/coreTypes.generated.ts": "export {}\n",

  // Missing compact modules
  "src/services/compact/snipCompact.ts":
    "export function shouldSnipCompact() { return false }\n",
  "src/services/compact/cachedMicrocompact.ts":
    "export function cachedMicrocompact() { return null }\n",

  // Missing agent snapshot dialog
  "src/components/agents/SnapshotUpdateDialog.ts":
    "export const SnapshotUpdateDialog = () => null\n",

  // Missing global type declaration
  "src/global.d.ts": "// global type stub\ndeclare namespace JSX { interface IntrinsicElements { [tag: string]: any } }\n",

  // Missing assistant modules (KAIROS feature-gated)
  "src/assistant/AssistantSessionChooser.ts":
    "export const AssistantSessionChooser = () => null\n",
  "src/commands/assistant/assistant.ts":
    "export default null\n",

  // Missing file persistence types
  "src/utils/filePersistence/types.ts":
    "export type FilePersistenceConfig = Record<string, unknown>\nexport type PersistenceEntry = { key: string; value: unknown }\n",

  // Missing ink devtools
  "src/ink/devtools.ts": "export {}\n",

  // Missing skills bundled verify content (must be non-empty for frontmatter parser)
  "src/skills/bundled/verify/examples/cli.md": "# CLI Example\n\nPlaceholder for verify CLI example.\n",
  "src/skills/bundled/verify/examples/server.md": "# Server Example\n\nPlaceholder for verify server example.\n",
  "src/skills/bundled/verify/SKILL.md": "---\ntitle: Verify\ndescription: Verification skill\n---\n\n# Verify\n\nPlaceholder for verify skill.\n",

  // Missing skills bundled claude-api content
  "src/skills/bundled/claude-api/SKILL.md": "---\ntitle: Claude API\ndescription: Claude API reference\n---\n\n# Claude API\n\nPlaceholder for Claude API skill.\n",
  "src/skills/bundled/claude-api/csharp/claude-api.md": "# C# Claude API\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/curl/examples.md": "# cURL Examples\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/go/claude-api.md": "# Go Claude API\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/java/claude-api.md": "# Java Claude API\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/php/claude-api.md": "# PHP Claude API\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/python/agent-sdk/patterns.md": "# Python Agent SDK Patterns\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/python/agent-sdk/README.md": "# Python Agent SDK\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/python/claude-api/batches.md": "# Python Batches\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/python/claude-api/files-api.md": "# Python Files API\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/python/claude-api/README.md": "# Python Claude API\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/python/claude-api/streaming.md": "# Python Streaming\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/python/claude-api/tool-use.md": "# Python Tool Use\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/ruby/claude-api.md": "# Ruby Claude API\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/shared/error-codes.md": "# Error Codes\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/shared/live-sources.md": "# Live Sources\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/shared/models.md": "# Models\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/shared/prompt-caching.md": "# Prompt Caching\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/shared/tool-use-concepts.md": "# Tool Use Concepts\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/typescript/agent-sdk/patterns.md": "# TypeScript Agent SDK Patterns\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/typescript/agent-sdk/README.md": "# TypeScript Agent SDK\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/typescript/claude-api/batches.md": "# TypeScript Batches\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/typescript/claude-api/files-api.md": "# TypeScript Files API\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/typescript/claude-api/README.md": "# TypeScript Claude API\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/typescript/claude-api/streaming.md": "# TypeScript Streaming\n\nPlaceholder.\n",
  "src/skills/bundled/claude-api/typescript/claude-api/tool-use.md": "# TypeScript Tool Use\n\nPlaceholder.\n",

  // Missing ultraplan prompt
  "src/utils/ultraplan/prompt.txt": "Placeholder for ultraplan prompt.\n",

  // Missing context collapse
  "src/services/contextCollapse/index.ts":
    "export function contextCollapse() { return null }\n",
}

let created = 0
for (const [relativePath, content] of Object.entries(STUBS)) {
  const fullPath = path.join(projectRoot, relativePath)
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
    created++
    console.log(`  Created stub: ${relativePath}`)
  }
}

// ---------------------------------------------------------------------------
// Stub node_modules for internal/unavailable packages.
// These packages are only available in Anthropic's internal build environment.
// For standalone builds we provide no-op stubs so the bundler can resolve them.
// ---------------------------------------------------------------------------
const NODE_MODULE_STUBS: Record<string, Record<string, string>> = {
  // These packages are NOT publicly available — Anthropic internal only.
  // Publicly available packages are installed from npm.
  // color-diff-napi: replaced by TypeScript port at src/native-ts/color-diff/index.ts
  // modifiers-napi: replaced by keyspy package
  "@ant/computer-use-mcp": {
    "index.js": `"use strict";
module.exports = {
  buildComputerUseTools: () => [],
  bindSessionContext: () => ({}),
  DEFAULT_GRANT_FLAGS: {},
  API_RESIZE_PARAMS: {},
  targetImageSize: () => ({ width: 0, height: 0 }),
};`,
    "sentinelApps.js": `"use strict"; module.exports = { getSentinelCategory: () => null };`,
    "types.js": `"use strict"; module.exports = { DEFAULT_GRANT_FLAGS: {} };`,
    "package.json": JSON.stringify({
      name: "@ant/computer-use-mcp",
      version: "0.0.0-stub",
      main: "index.js",
      exports: { ".": "./index.js", "./sentinelApps": "./sentinelApps.js", "./types": "./types.js" },
    }),
  },
  "@ant/computer-use-swift": {
    "index.js": `"use strict"; module.exports = {};`,
    "package.json": JSON.stringify({ name: "@ant/computer-use-swift", version: "0.0.0-stub", main: "index.js" }),
  },
  "@ant/computer-use-input": {
    "index.js": `"use strict"; module.exports = {};`,
    "package.json": JSON.stringify({ name: "@ant/computer-use-input", version: "0.0.0-stub", main: "index.js" }),
  },
  "@ant/claude-for-chrome-mcp": {
    "index.js": `"use strict"; module.exports = { BROWSER_TOOLS: [] };`,
    "package.json": JSON.stringify({ name: "@ant/claude-for-chrome-mcp", version: "0.0.0-stub", main: "index.js" }),
  },
}

let nmCreated = 0
for (const [pkgName, files] of Object.entries(NODE_MODULE_STUBS)) {
  const pkgDir = path.join(projectRoot, "node_modules", pkgName)
  const pkgJson = path.join(pkgDir, "package.json")
  if (!fs.existsSync(pkgJson)) {
    fs.mkdirSync(pkgDir, { recursive: true })
    for (const [fileName, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(pkgDir, fileName), content)
    }
    nmCreated++
    console.log(`  Created node_module stub: ${pkgName}`)
  }
}

console.log(`  ✓ ${created} stubs created (${Object.keys(STUBS).length - created} already existed)`)
if (nmCreated > 0) {
  console.log(`  ✓ ${nmCreated} node_module stubs created`)
}

// Ensure vendor/rg placeholder exists (real binary is downloaded by build.ts)
const vendorDir = path.join(projectRoot, "vendor")
const rgPlaceholder = path.join(vendorDir, "rg")
if (!fs.existsSync(rgPlaceholder)) {
  fs.mkdirSync(vendorDir, { recursive: true })
  fs.writeFileSync(rgPlaceholder, "placeholder")
  console.log(`  Created vendor/rg placeholder for embedding`)
}
