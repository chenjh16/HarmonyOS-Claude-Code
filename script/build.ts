#!/usr/bin/env bun

/**
 * Build script for Claude Code standalone executables.
 *
 * Uses Bun's compile feature to produce self-contained binaries that
 * embed the Bun runtime, all dependencies, and the TypeScript source.
 *
 * Reference: opencode build pipeline (packages/opencode/script/build.ts)
 *
 * Usage:
 *   bun run script/build.ts                    # build for current platform
 *   bun run script/build.ts --all              # build for all platforms
 *   bun run script/build.ts --release          # build + package for release
 *   bun run script/build.ts --target linux-x64 # build for specific target
 */

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { downloadRipgrep } from "./download-rg.js"

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

// ---------------------------------------------------------------------------
// Feature flags — mirrors the bun:bundle feature() calls in source.
// Set any flag to "true" to include the guarded code; unset flags are stripped
// as dead code by Bun's bundler.
// ---------------------------------------------------------------------------
const FEATURE_FLAGS: Record<string, string> = {
  PROACTIVE: process.env.FEATURE_PROACTIVE || "false",
  KAIROS: process.env.FEATURE_KAIROS || "false",
  KAIROS_BRIEF: process.env.FEATURE_KAIROS_BRIEF || "false",
  BRIDGE_MODE: process.env.FEATURE_BRIDGE_MODE || "false",
  DAEMON: process.env.FEATURE_DAEMON || "false",
  VOICE_MODE: process.env.FEATURE_VOICE_MODE || "false",
  AGENT_TRIGGERS: process.env.FEATURE_AGENT_TRIGGERS || "false",
  AGENT_TRIGGERS_REMOTE: process.env.FEATURE_AGENT_TRIGGERS_REMOTE || "false",
  MONITOR_TOOL: process.env.FEATURE_MONITOR_TOOL || "false",
  COORDINATOR_MODE: process.env.FEATURE_COORDINATOR_MODE || "false",
  HISTORY_SNIP: process.env.FEATURE_HISTORY_SNIP || "false",
  WORKFLOW_SCRIPTS: process.env.FEATURE_WORKFLOW_SCRIPTS || "false",
  WEB_BROWSER_TOOL: process.env.FEATURE_WEB_BROWSER_TOOL || "false",
  CONTEXT_COLLAPSE: process.env.FEATURE_CONTEXT_COLLAPSE || "false",
  OVERFLOW_TEST_TOOL: process.env.FEATURE_OVERFLOW_TEST_TOOL || "false",
  TERMINAL_PANEL: process.env.FEATURE_TERMINAL_PANEL || "false",
  BUDDY: process.env.FEATURE_BUDDY || "false",
  FORK_SUBAGENT: process.env.FEATURE_FORK_SUBAGENT || "false",
  UDS_INBOX: process.env.FEATURE_UDS_INBOX || "false",
  REACTIVE_COMPACT: process.env.FEATURE_REACTIVE_COMPACT || "false",
  TEMPLATES: process.env.FEATURE_TEMPLATES || "false",
  EXPERIMENTAL_SKILL_SEARCH:
    process.env.FEATURE_EXPERIMENTAL_SKILL_SEARCH || "false",
  KAIROS_GITHUB_WEBHOOKS:
    process.env.FEATURE_KAIROS_GITHUB_WEBHOOKS || "false",
  ULTRAPLAN: process.env.FEATURE_ULTRAPLAN || "false",
  TORCH: process.env.FEATURE_TORCH || "false",
  CACHED_MICROCOMPACT: process.env.FEATURE_CACHED_MICROCOMPACT || "false",
  BREAK_CACHE_COMMAND: process.env.FEATURE_BREAK_CACHE_COMMAND || "false",
  TRANSCRIPT_CLASSIFIER:
    process.env.FEATURE_TRANSCRIPT_CLASSIFIER || "false",
  ABLATION_BASELINE: process.env.FEATURE_ABLATION_BASELINE || "false",
  DUMP_SYSTEM_PROMPT: process.env.FEATURE_DUMP_SYSTEM_PROMPT || "false",
  CHICAGO_MCP: process.env.FEATURE_CHICAGO_MCP || "false",
  BG_SESSIONS: process.env.FEATURE_BG_SESSIONS || "false",
  KAIROS_PUSH_NOTIFICATION:
    process.env.FEATURE_KAIROS_PUSH_NOTIFICATION || "false",
}

// ---------------------------------------------------------------------------
// Target definitions
//
// Note: HarmonyOS PC (ohos) is NOT listed here because Bun's compiler does
// not support an ohos compile target.  HarmonyOS uses the npm-package build
// path instead (`make build-ohos` / `make build-npm`), which produces
// platform-agnostic JavaScript that runs on Node.js >= 20.
// ---------------------------------------------------------------------------
type Target = {
  os: string
  arch: "arm64" | "x64"
  bunTarget: string
  ext: string
}

const ALL_TARGETS: Target[] = [
  {
    os: "darwin",
    arch: "arm64",
    bunTarget: "bun-darwin-arm64",
    ext: "",
  },
  {
    os: "darwin",
    arch: "x64",
    bunTarget: "bun-darwin-x64",
    ext: "",
  },
  {
    os: "linux",
    arch: "x64",
    bunTarget: "bun-linux-x64",
    ext: "",
  },
  {
    os: "linux",
    arch: "arm64",
    bunTarget: "bun-linux-arm64",
    ext: "",
  },
  {
    os: "win32",
    arch: "x64",
    bunTarget: "bun-windows-x64",
    ext: ".exe",
  },
  {
    os: "win32",
    arch: "arm64",
    bunTarget: "bun-windows-arm64",
    ext: ".exe",
  },
]

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const buildAll = args.includes("--all")
const isRelease = args.includes("--release")
const targetArg = args.find((a) => a.startsWith("--target="))?.split("=")[1]
const targetFlag = args.includes("--target")
  ? args[args.indexOf("--target") + 1]
  : targetArg

function selectTargets(): Target[] {
  if (targetFlag) {
    const [os, arch] = targetFlag.split("-")
    const normalized = os === "windows" ? "win32" : os
    const match = ALL_TARGETS.find(
      (t) => t.os === normalized && t.arch === arch,
    )
    if (!match) {
      console.error(
        `Unknown target: ${targetFlag}. Available: ${ALL_TARGETS.map((t) => `${t.os === "win32" ? "windows" : t.os}-${t.arch}`).join(", ")}`,
      )
      process.exit(1)
    }
    return [match]
  }
  if (buildAll) return ALL_TARGETS
  return ALL_TARGETS.filter(
    (t) => t.os === process.platform && t.arch === process.arch,
  )
}

const targets = selectTargets()

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
console.log(`\n  Claude Code Build`)
console.log(`  Version: ${VERSION}`)
console.log(`  Targets: ${targets.map((t) => `${t.os}-${t.arch}`).join(", ")}`)
console.log(`  Release: ${isRelease}\n`)

const distDir = path.join(repoRoot, "dist")
await $`rm -rf ${distDir}`
await $`mkdir -p ${distDir}`

// Ensure react/compiler-runtime shim exists (React 18 doesn't include it,
// but the source was compiled with React Compiler which emits imports for it)
const compilerRuntimePath = path.join(projectRoot, "node_modules", "react", "compiler-runtime.js")
if (!fs.existsSync(compilerRuntimePath)) {
  fs.writeFileSync(compilerRuntimePath, `"use strict";
const $empty = Symbol.for("react.memo_cache_sentinel");
function c(size) {
  const $ = new Array(size);
  for (let i = 0; i < size; i++) $[i] = $empty;
  return $;
}
exports.c = c;
`)
}
// Patch React's package.json exports to include compiler-runtime subpath
const reactPkgPath = path.join(projectRoot, "node_modules", "react", "package.json")
const reactPkg = JSON.parse(fs.readFileSync(reactPkgPath, "utf-8"))
if (!reactPkg.exports?.["./compiler-runtime"]) {
  reactPkg.exports = reactPkg.exports || {}
  reactPkg.exports["./compiler-runtime"] = "./compiler-runtime.js"
  fs.writeFileSync(reactPkgPath, JSON.stringify(reactPkg, null, 2))
}

// Patch react-reconciler constants to add NoEventPriority (added in React 19,
// but the custom Ink fork imports it). NoEventPriority = 0 in React internals.
for (const suffix of [
  "cjs/react-reconciler-constants.production.min.js",
  "cjs/react-reconciler-constants.development.js",
]) {
  const constPath = path.join(projectRoot, "node_modules", "react-reconciler", suffix)
  if (fs.existsSync(constPath)) {
    let src = fs.readFileSync(constPath, "utf-8")
    if (!src.includes("NoEventPriority")) {
      src = src.replace("exports.LegacyRoot", "exports.NoEventPriority=0;exports.LegacyRoot")
      fs.writeFileSync(constPath, src)
    }
  }
}

// Build the bun:bundle feature() shim — Bun's bundler uses define to inline
// feature flag results at compile time.
const featureDefines: Record<string, string> = {}
for (const [flag, value] of Object.entries(FEATURE_FLAGS)) {
  // feature('FLAG') calls are replaced by the bundler with the define value
  featureDefines[`__FEATURE_${flag}__`] = value
}

for (const target of targets) {
  const label =
    `${target.os === "win32" ? "windows" : target.os}-${target.arch}`
  const outDir = path.join(distDir, `claude-code-${label}`)
  const outFile = path.join(outDir, `claude${target.ext}`)

  console.log(`  Building ${label}...`)
  await $`mkdir -p ${outDir}`

  // Download platform-specific ripgrep binary for embedding
  try {
    await downloadRipgrep(projectRoot, target.os, target.arch)
  } catch (err) {
    console.warn(`  ⚠ Failed to download ripgrep for ${label}: ${err}`)
    console.warn(`    Glob/Grep tools will require system-installed rg`)
  }

  try {
    const result = await Bun.build({
      entrypoints: ["./src/entrypoints/cli.tsx"],
      outdir: outDir,
      compile: true,
      target: target.bunTarget as any,
      define: {
        "MACRO.VERSION": JSON.stringify(VERSION),
        "MACRO.ISSUES_EXPLAINER": JSON.stringify(
          "report issues at https://github.com/chenjh16/HarmonyOS-Claude-Code/issues",
        ),
        ...Object.fromEntries(
          Object.entries(FEATURE_FLAGS).map(([k, v]) => [
            `__FEATURE_${k}__`,
            v,
          ]),
        ),
      },
      // All packages are bundled into the standalone binary.
      // Internal/unavailable packages have stub modules in node_modules
      // (created by script/create-stubs.ts) so the bundler can resolve them.
      packages: "bundle",
    })

    if (!result.success) {
      console.error(`  Build warnings/errors:`)
      for (const log of result.logs) {
        console.error(`    ${log}`)
      }
    }

    // Bun.build with compile:true outputs into outDir based on entrypoint name
    const compiledName = path.join(outDir, "cli" + target.ext)
    if (fs.existsSync(compiledName) && compiledName !== outFile) {
      fs.renameSync(compiledName, outFile)
    }
    // Also check project root (some Bun versions output there)
    const rootOut = "./cli" + target.ext
    if (fs.existsSync(rootOut)) {
      fs.renameSync(rootOut, outFile)
    }

    // Smoke test for current platform
    if (target.os === process.platform && target.arch === process.arch) {
      try {
        const ver = await $`${outFile} --version`.text()
        console.log(`  ✓ Smoke test: ${ver.trim()}`)
      } catch (e) {
        console.warn(`  ⚠ Smoke test failed (non-fatal)`)
      }
    } else {
      console.log(`  ✓ Built ${outFile}`)
    }
  } catch (err) {
    console.error(`  ✗ Build failed for ${label}:`, err)
    if (isRelease) process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Release packaging
// ---------------------------------------------------------------------------
if (isRelease) {
  console.log(`\n  Packaging release artifacts...\n`)

  for (const target of targets) {
    const label =
      `${target.os === "win32" ? "windows" : target.os}-${target.arch}`
    const dirName = `claude-code-${label}`
    const dirPath = path.join(distDir, dirName)

    if (!fs.existsSync(dirPath)) continue

    if (target.os === "linux") {
      const archive = path.join(distDir, `claude-code-${label}-v${VERSION}.tar.gz`)
      await $`tar -czf ${archive} -C ${distDir} ${dirName}`
      console.log(`  ✓ ${archive}`)
    } else {
      const archive = path.join(distDir, `claude-code-${label}-v${VERSION}.zip`)
      await $`cd ${distDir} && zip -r ${archive} ${dirName}`
      console.log(`  ✓ ${archive}`)
    }
  }

  const archives = fs
    .readdirSync(distDir)
    .filter((f) => f.endsWith(".tar.gz") || f.endsWith(".zip"))
    .map((f) => path.join(distDir, f))

  if (archives.length > 0) {
    const checksumFile = path.join(distDir, `checksums-v${VERSION}.sha256`)
    let checksums = ""
    for (const archive of archives) {
      const hash = await $`shasum -a 256 ${archive}`.text()
      checksums += hash
    }
    fs.writeFileSync(checksumFile, checksums)
    console.log(`  ✓ ${checksumFile}`)
  }

  console.log(`\n  Release v${VERSION} ready.\n`)

  if (process.env.GH_REPO) {
    const releaseFiles = fs
      .readdirSync(distDir)
      .filter(
        (f) =>
          f.endsWith(".tar.gz") ||
          f.endsWith(".zip") ||
          f.endsWith(".sha256"),
      )
      .map((f) => path.join(distDir, f))
      .join(" ")

    if (releaseFiles) {
      console.log(`  Uploading to GitHub Release v${VERSION}...`)
      await $`gh release upload v${VERSION} ${releaseFiles} --clobber --repo ${process.env.GH_REPO}`
      console.log(`  ✓ Uploaded to ${process.env.GH_REPO}`)
    }
  }
}
