#!/usr/bin/env bun

/**
 * Build script for npm package distribution.
 *
 * Unlike build.ts (which produces standalone binaries via --compile),
 * this bundles the TypeScript source into a single JS file that can be
 * run with Node.js or Bun. External npm dependencies are kept external.
 *
 * Usage:
 *   bun run script/build-npm.ts
 */

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..")
const repoRoot = process.env.REPO_ROOT
  ? path.resolve(process.env.REPO_ROOT)
  : projectRoot

process.chdir(projectRoot)

const pkg = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"),
)
const VERSION = process.env.CLAUDE_CODE_VERSION || pkg.version || "0.0.0-dev"

const FEATURE_FLAGS: Record<string, string> = {
  PROACTIVE: "false",
  KAIROS: "false",
  KAIROS_BRIEF: "false",
  BRIDGE_MODE: "false",
  DAEMON: "false",
  VOICE_MODE: "false",
  AGENT_TRIGGERS: "false",
  AGENT_TRIGGERS_REMOTE: "false",
  MONITOR_TOOL: "false",
  COORDINATOR_MODE: "false",
  HISTORY_SNIP: "false",
  WORKFLOW_SCRIPTS: "false",
  WEB_BROWSER_TOOL: "false",
  CONTEXT_COLLAPSE: "false",
  OVERFLOW_TEST_TOOL: "false",
  TERMINAL_PANEL: "false",
  BUDDY: "false",
  FORK_SUBAGENT: "false",
  UDS_INBOX: "false",
  REACTIVE_COMPACT: "false",
  TEMPLATES: "false",
  EXPERIMENTAL_SKILL_SEARCH: "false",
  KAIROS_GITHUB_WEBHOOKS: "false",
  ULTRAPLAN: "false",
  TORCH: "false",
  CACHED_MICROCOMPACT: "false",
  BREAK_CACHE_COMMAND: "false",
  TRANSCRIPT_CLASSIFIER: "false",
  ABLATION_BASELINE: "false",
  DUMP_SYSTEM_PROMPT: "false",
  CHICAGO_MCP: "false",
  BG_SESSIONS: "false",
  KAIROS_PUSH_NOTIFICATION: "false",
}

console.log(`\n  Claude Code npm Build`)
console.log(`  Version: ${VERSION}\n`)

const outDir = path.join(repoRoot, "npm-dist")
await $`rm -rf ${outDir}`
await $`mkdir -p ${outDir}`

// Ensure react/compiler-runtime shim exists
const compilerRuntimePath = path.join(
  projectRoot,
  "node_modules",
  "react",
  "compiler-runtime.js",
)
if (!fs.existsSync(compilerRuntimePath)) {
  fs.writeFileSync(
    compilerRuntimePath,
    `"use strict";
const $empty = Symbol.for("react.memo_cache_sentinel");
function c(size) {
  const $ = new Array(size);
  for (let i = 0; i < size; i++) $[i] = $empty;
  return $;
}
exports.c = c;
`,
  )
}
const reactPkgPath = path.join(
  projectRoot,
  "node_modules",
  "react",
  "package.json",
)
const reactPkg = JSON.parse(fs.readFileSync(reactPkgPath, "utf-8"))
if (!reactPkg.exports?.["./compiler-runtime"]) {
  reactPkg.exports = reactPkg.exports || {}
  reactPkg.exports["./compiler-runtime"] = "./compiler-runtime.js"
  fs.writeFileSync(reactPkgPath, JSON.stringify(reactPkg, null, 2))
}

// Patch react-reconciler constants
for (const suffix of [
  "cjs/react-reconciler-constants.production.min.js",
  "cjs/react-reconciler-constants.development.js",
]) {
  const constPath = path.join(
    projectRoot,
    "node_modules",
    "react-reconciler",
    suffix,
  )
  if (fs.existsSync(constPath)) {
    let src = fs.readFileSync(constPath, "utf-8")
    if (!src.includes("NoEventPriority")) {
      src = src.replace(
        "exports.LegacyRoot",
        "exports.NoEventPriority=0;exports.LegacyRoot",
      )
      fs.writeFileSync(constPath, src)
    }
  }
}

try {
  const result = await Bun.build({
    entrypoints: ["./src/entrypoints/cli.tsx"],
    outdir: outDir,
    target: "node",
    format: "esm",
    splitting: false,
    sourcemap: "linked",
    packages: "bundle",
    define: {
      "MACRO.VERSION": JSON.stringify(VERSION),
      "MACRO.ISSUES_EXPLAINER": JSON.stringify(
        "report issues at https://github.com/chenjh16/HarmonyOS-Claude-Code/issues",
      ),
      "MACRO.FEEDBACK_CHANNEL": JSON.stringify(
        "https://github.com/chenjh16/HarmonyOS-Claude-Code/issues",
      ),
      "MACRO.PACKAGE_URL": JSON.stringify("claude-code-ohos"),
      "MACRO.NATIVE_PACKAGE_URL": JSON.stringify(""),
      "MACRO.BUILD_TIME": JSON.stringify(new Date().toISOString()),
      "MACRO.VERSION_CHANGELOG": JSON.stringify(""),
      ...Object.fromEntries(
        Object.entries(FEATURE_FLAGS).map(([k, v]) => [
          `__FEATURE_${k}__`,
          v,
        ]),
      ),
    },
  })

  if (!result.success) {
    console.error("  Build errors:")
    for (const log of result.logs) {
      console.error(`    ${log}`)
    }
    process.exit(1)
  }

  console.log(`  ✓ Bundled to ${outDir}/cli.js`)
} catch (err) {
  console.error("  ✗ Build failed:", err)
  process.exit(1)
}

// Create the bin wrapper script
const binDir = path.join(outDir, "bin")
fs.mkdirSync(binDir, { recursive: true })
fs.writeFileSync(
  path.join(binDir, "claude.js"),
  `#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
await import(join(__dirname, '..', 'cli.js'));
`,
)
fs.chmodSync(path.join(binDir, "claude.js"), 0o755)

// Copy postinstall script for ripgrep download
const postinstallSrc = path.join(projectRoot, "script", "postinstall-rg.mjs")
const postinstallDest = path.join(outDir, "postinstall-rg.mjs")
fs.copyFileSync(postinstallSrc, postinstallDest)

// Copy start-claude.sh template (installed to ~/.claude/ by postinstall)
const startClaudeSrc = path.join(projectRoot, "start-claude.sh")
if (fs.existsSync(startClaudeSrc)) {
  fs.copyFileSync(startClaudeSrc, path.join(outDir, "start-claude.sh"))
}

// Create npm package.json (all deps are bundled, no runtime dependencies)
const npmPkg = {
  name: "claude-code-ohos",
  version: VERSION,
  description:
    "Claude Code for HarmonyOS — AI-powered coding assistant CLI",
  type: "module",
  bin: {
    claude: "./bin/claude.js",
  },
  main: "./cli.js",
  files: ["cli.js", "bin/", "postinstall-rg.mjs", "start-claude.sh"],
  scripts: {
    postinstall: "node postinstall-rg.mjs",
  },
  engines: {
    node: ">=20.0.0",
  },
  license: "MIT",
  repository: {
    type: "git",
    url: "https://github.com/chenjh16/HarmonyOS-Claude-Code.git",
  },
}

fs.writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify(npmPkg, null, 2) + "\n",
)

// Copy README
const readmeSrc = path.join(projectRoot, "README.md")
if (fs.existsSync(readmeSrc)) {
  fs.copyFileSync(readmeSrc, path.join(outDir, "README.md"))
}

const bundleSize = fs.statSync(path.join(outDir, "cli.js")).size
console.log(
  `  ✓ Bundle size: ${(bundleSize / 1024 / 1024).toFixed(1)} MB`,
)
console.log(`  ✓ npm package ready in ${outDir}/`)
console.log(`\n  To pack:  cd ${outDir} && npm pack`)
console.log(`  To install globally:  npm install -g ${outDir}/`)
console.log(`  To test:  node ${outDir}/bin/claude.js --version\n`)
