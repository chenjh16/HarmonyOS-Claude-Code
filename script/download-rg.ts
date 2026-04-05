#!/usr/bin/env bun

/**
 * Downloads a platform-specific ripgrep binary to vendor/rg.
 *
 * Called by build.ts before each target compilation so that the correct
 * binary is embedded via `import ... with { type: "file" }`.
 *
 * Usage:
 *   bun run script/download-rg.ts <os> <arch>
 *   bun run script/download-rg.ts darwin arm64
 *   bun run script/download-rg.ts linux x64
 */

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const RG_VERSION = "15.1.0"

const PLATFORM_MAP: Record<string, Record<string, { archive: string; binary: string }>> = {
  darwin: {
    arm64: {
      archive: `ripgrep-${RG_VERSION}-aarch64-apple-darwin.tar.gz`,
      binary: "rg",
    },
    x64: {
      archive: `ripgrep-${RG_VERSION}-x86_64-apple-darwin.tar.gz`,
      binary: "rg",
    },
  },
  linux: {
    arm64: {
      archive: `ripgrep-${RG_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
      binary: "rg",
    },
    x64: {
      archive: `ripgrep-${RG_VERSION}-x86_64-unknown-linux-musl.tar.gz`,
      binary: "rg",
    },
  },
  win32: {
    arm64: {
      archive: `ripgrep-${RG_VERSION}-aarch64-pc-windows-msvc.zip`,
      binary: "rg.exe",
    },
    x64: {
      archive: `ripgrep-${RG_VERSION}-x86_64-pc-windows-msvc.zip`,
      binary: "rg.exe",
    },
  },
}

export async function downloadRipgrep(
  projectRoot: string,
  os: string,
  arch: string,
): Promise<string> {
  const vendorDir = path.join(projectRoot, "vendor")
  const outputPath = path.join(vendorDir, "rg")
  const versionFile = path.join(vendorDir, ".rg-platform")

  const platformKey = `${os}-${arch}-${RG_VERSION}`

  if (fs.existsSync(outputPath) && fs.existsSync(versionFile)) {
    const cached = fs.readFileSync(versionFile, "utf-8").trim()
    if (cached === platformKey) {
      console.log(`    ripgrep ${RG_VERSION} (${os}-${arch}) already cached`)
      return outputPath
    }
  }

  const platformInfo = PLATFORM_MAP[os]?.[arch]
  if (!platformInfo) {
    throw new Error(`No ripgrep binary available for ${os}-${arch}`)
  }

  const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/${platformInfo.archive}`
  const tmpDir = path.join(vendorDir, ".tmp-rg")

  fs.mkdirSync(vendorDir, { recursive: true })
  fs.mkdirSync(tmpDir, { recursive: true })

  console.log(`    Downloading ripgrep ${RG_VERSION} for ${os}-${arch}...`)

  const archivePath = path.join(tmpDir, platformInfo.archive)

  await $`curl -fsSL -o ${archivePath} ${url}`

  if (platformInfo.archive.endsWith(".tar.gz")) {
    await $`tar -xzf ${archivePath} -C ${tmpDir}`
  } else {
    await $`unzip -qo ${archivePath} -d ${tmpDir}`
  }

  const archiveDir = platformInfo.archive.replace(/\.(tar\.gz|zip)$/, "")
  const extractedBinary = path.join(tmpDir, archiveDir, platformInfo.binary)

  if (!fs.existsSync(extractedBinary)) {
    const files = fs.readdirSync(path.join(tmpDir, archiveDir))
    throw new Error(
      `Expected binary at ${extractedBinary}, found: ${files.join(", ")}`,
    )
  }

  fs.copyFileSync(extractedBinary, outputPath)
  fs.chmodSync(outputPath, 0o755)
  fs.writeFileSync(versionFile, platformKey)

  fs.rmSync(tmpDir, { recursive: true, force: true })

  const size = fs.statSync(outputPath).size
  console.log(
    `    ✓ ripgrep ${RG_VERSION} (${(size / 1024 / 1024).toFixed(1)} MB)`,
  )

  return outputPath
}

export { RG_VERSION }

if (import.meta.main) {
  const [os, arch] = process.argv.slice(2)
  if (!os || !arch) {
    console.error("Usage: bun run script/download-rg.ts <os> <arch>")
    process.exit(1)
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  await downloadRipgrep(root, os, arch)
}
