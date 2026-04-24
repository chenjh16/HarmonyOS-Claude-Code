#!/usr/bin/env node

/**
 * npm postinstall script — downloads the ripgrep binary for the current
 * platform to ~/.claude/bin/rg.
 *
 * Skips download if:
 *   - rg already exists at ~/.claude/bin/rg with the correct version stamp
 *   - CLAUDE_CODE_SKIP_RG_INSTALL=1 is set
 *
 * On Linux arm64 with musl libc (e.g., HarmonyOS PC), the official ripgrep
 * releases only provide glibc-linked binaries. This script detects musl and
 * downloads a statically-linked musl build from the Cursor ripgrep fork.
 *
 * This is a plain .mjs file (no TypeScript, no Bun APIs) so it can run
 * during `npm install` on any Node.js >= 18.
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs"
import { homedir, platform, arch } from "node:os"
import { join } from "node:path"

const RG_VERSION = "15.1.0"
const RG_MUSL_VERSION = "15.1.0-cursor4"

const RG_BASE_URL = `https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}`
const RG_MUSL_BASE_URL = `https://github.com/anysphere/ripgrep/releases/download/${RG_MUSL_VERSION}`

const PLATFORM_MAP = {
  darwin: {
    arm64: { archive: `ripgrep-${RG_VERSION}-aarch64-apple-darwin.tar.gz`, url: RG_BASE_URL },
    x64:   { archive: `ripgrep-${RG_VERSION}-x86_64-apple-darwin.tar.gz`,  url: RG_BASE_URL },
  },
  linux: {
    arm64_gnu:  { archive: `ripgrep-${RG_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,             url: RG_BASE_URL },
    arm64_musl: { archive: `ripgrep-${RG_MUSL_VERSION}-aarch64-unknown-linux-musl.tar.gz`,       url: RG_MUSL_BASE_URL },
    x64:        { archive: `ripgrep-${RG_VERSION}-x86_64-unknown-linux-musl.tar.gz`,              url: RG_BASE_URL },
  },
  win32: {
    arm64: { archive: `ripgrep-${RG_VERSION}-aarch64-pc-windows-msvc.zip`, url: RG_BASE_URL },
    x64:   { archive: `ripgrep-${RG_VERSION}-x86_64-pc-windows-msvc.zip`,  url: RG_BASE_URL },
  },
}

/**
 * Detect whether the system uses musl libc (e.g., Alpine, HarmonyOS PC).
 * Checks ldd output, /lib/ld-musl-*, and /proc/self/maps.
 */
function isMuslLinux() {
  if (platform() !== "linux") return false
  try {
    const lddOutput = execSync("ldd --version 2>&1 || true", { stdio: "pipe", encoding: "utf-8" })
    if (lddOutput.toLowerCase().includes("musl")) return true
  } catch { /* ignore */ }
  try {
    const ldMusl = execSync("ls /lib/ld-musl-* 2>/dev/null || true", { stdio: "pipe", encoding: "utf-8" })
    if (ldMusl.trim().length > 0) return true
  } catch { /* ignore */ }
  try {
    const maps = readFileSync("/proc/self/maps", "utf-8")
    if (maps.includes("musl")) return true
  } catch { /* ignore */ }
  return false
}

if (process.env.CLAUDE_CODE_SKIP_RG_INSTALL === "1") {
  process.exit(0)
}

const RG_DIR = join(homedir(), ".claude", "bin")
const RG_BIN = join(RG_DIR, platform() === "win32" ? "rg.exe" : "rg")
const VERSION_FILE = join(RG_DIR, ".rg-version")

let claudeVersion = "npm"
try {
  const scriptDir = new URL(".", import.meta.url).pathname
  const pkgPath = join(scriptDir, "package.json")
  if (existsSync(pkgPath)) {
    claudeVersion = JSON.parse(readFileSync(pkgPath, "utf-8")).version || "npm"
  }
} catch {
  // ignore
}

if (existsSync(RG_BIN) && existsSync(VERSION_FILE)) {
  const cached = readFileSync(VERSION_FILE, "utf-8").trim()
  if (cached === claudeVersion || cached.startsWith("npm")) {
    try {
      execSync(`"${RG_BIN}" --version`, { stdio: "pipe" })
      console.log(`  ripgrep ${RG_VERSION} already installed at ${RG_BIN}`)
      process.exit(0)
    } catch {
      // Broken binary, re-download
    }
  }
}

const os = platform()
const cpuArch = arch() === "arm64" ? "arm64" : "x64"

let entry
if (os === "openharmony") {
  // HarmonyOS PC: AArch64 with musl libc — always use musl static build
  entry = PLATFORM_MAP.linux.arm64_musl
  console.log(`  Detected HarmonyOS PC (openharmony) — using statically-linked musl ripgrep build`)
} else if (os === "linux" && cpuArch === "arm64") {
  const musl = isMuslLinux()
  entry = musl ? PLATFORM_MAP.linux.arm64_musl : PLATFORM_MAP.linux.arm64_gnu
  if (musl) {
    console.log(`  Detected musl libc — using statically-linked ripgrep build`)
  }
} else {
  entry = PLATFORM_MAP[os]?.[cpuArch]
}

if (!entry) {
  console.warn(`  ⚠ No ripgrep binary available for ${os}-${cpuArch}`)
  console.warn(`    Install ripgrep manually: https://github.com/BurntSushi/ripgrep#installation`)
  process.exit(0)
}

const { archive: archiveName, url: baseUrl } = entry
const url = `${baseUrl}/${archiveName}`
const tmpDir = join(RG_DIR, ".tmp-rg-install")

try {
  mkdirSync(RG_DIR, { recursive: true })
  mkdirSync(tmpDir, { recursive: true })

  console.log(`  Downloading ripgrep for ${os}-${cpuArch}...`)
  console.log(`  URL: ${url}`)

  const archivePath = join(tmpDir, archiveName)
  execSync(`curl -fsSL -o "${archivePath}" "${url}"`, { stdio: "pipe", timeout: 60000 })

  const dirName = archiveName.replace(/\.(tar\.gz|zip)$/, "")
  const rgName = os === "win32" ? "rg.exe" : "rg"

  if (archiveName.endsWith(".tar.gz")) {
    execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`, { stdio: "pipe" })
  } else {
    execSync(`unzip -qo "${archivePath}" -d "${tmpDir}"`, { stdio: "pipe" })
  }

  const extracted = join(tmpDir, dirName, rgName)
  if (!existsSync(extracted)) {
    throw new Error(`Expected binary at ${extracted}`)
  }

  const data = readFileSync(extracted)
  writeFileSync(RG_BIN, data)
  chmodSync(RG_BIN, 0o755)

  // Verify the binary actually runs on this platform
  let works = false
  try {
    execSync(`"${RG_BIN}" --version`, { stdio: "pipe" })
    works = true
  } catch {
    // On HarmonyOS PC, unsigned binaries get "Permission denied" (exit code 126).
    // Try auto-signing with binary-sign-tool if available.
  }

  if (!works) {
    let signTool = null
    try {
      signTool = execSync("which binary-sign-tool 2>/dev/null", { stdio: "pipe", encoding: "utf-8" }).trim()
    } catch { /* not found */ }

    if (signTool) {
      console.log(`  Signing ripgrep with binary-sign-tool (HarmonyOS PC)...`)
      const signedBin = RG_BIN + "-signed"
      try {
        execSync(`binary-sign-tool sign -inFile "${RG_BIN}" -outFile "${signedBin}" -selfSign 1`, { stdio: "pipe" })
        const signedData = readFileSync(signedBin)
        writeFileSync(RG_BIN, signedData)
        chmodSync(RG_BIN, 0o755)
        rmSync(signedBin, { force: true })
        console.log(`  ✓ Binary signed successfully`)
      } catch (signErr) {
        console.warn(`  ⚠ Signing failed: ${signErr.message}`)
      }

      try {
        execSync(`"${RG_BIN}" --version`, { stdio: "pipe" })
        works = true
      } catch {
        console.warn(`  ⚠ Signed binary still cannot execute.`)
        console.warn(`    Enable "Run extensions not from the app store" in:`)
        console.warn(`    Settings > Privacy and Security > Advanced`)
        console.warn(`    Then re-run: npm install -g <package>`)
      }
    } else {
      throw new Error(`Downloaded binary is not compatible with this platform (${os}-${cpuArch})`)
    }
  }

  if (works) {
    writeFileSync(VERSION_FILE, claudeVersion)
    console.log(`  ✓ ripgrep installed to ${RG_BIN}`)
  }
} catch (err) {
  console.warn(`  ⚠ Failed to install ripgrep: ${err.message}`)
  console.warn(`    Grep/Glob tools will require system-installed rg`)
  console.warn(`    Install manually: https://github.com/BurntSushi/ripgrep#installation`)
} finally {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Install start-claude.sh template to ~/.claude/
// ---------------------------------------------------------------------------
// Copies the startup script template so users can configure API credentials.
// Only installs if the file doesn't already exist (preserves user edits).

try {
  const scriptDir = new URL(".", import.meta.url).pathname
  const templateSrc = join(scriptDir, "start-claude.sh")
  const claudeDir = join(homedir(), ".claude")
  const templateDest = join(claudeDir, "start-claude.sh")

  if (existsSync(templateSrc)) {
    mkdirSync(claudeDir, { recursive: true })

    if (!existsSync(templateDest)) {
      const content = readFileSync(templateSrc)
      writeFileSync(templateDest, content)
      chmodSync(templateDest, 0o755)
      console.log(``)
      console.log(`  ✓ Startup script installed to ${templateDest}`)
      console.log(``)
      console.log(`  ┌─────────────────────────────────────────────────────────┐`)
      console.log(`  │  Next: configure your API credentials:                 │`)
      console.log(`  │                                                        │`)
      console.log(`  │    cp ~/.claude/.env.example ~/.claude/.env             │`)
      console.log(`  │    vi ~/.claude/.env   # fill in your values           │`)
      console.log(`  │                                                        │`)
      console.log(`  │  Then run:                                             │`)
      console.log(`  │    sh ~/.claude/start-claude.sh                         │`)
      console.log(`  │                                                        │`)
      console.log(`  └─────────────────────────────────────────────────────────┘`)
      console.log(``)
    } else {
      console.log(`  ✓ Startup script already exists at ${templateDest} (preserved)`)
    }

    // Install .env.example alongside start-claude.sh
    const envExampleSrc = join(scriptDir, ".env.example")
    const envExampleDest = join(claudeDir, ".env.example")
    if (existsSync(envExampleSrc) && !existsSync(envExampleDest)) {
      const envContent = readFileSync(envExampleSrc)
      writeFileSync(envExampleDest, envContent)
      console.log(`  ✓ .env.example installed to ${envExampleDest}`)
      console.log(`    To configure: cp ~/.claude/.env.example ~/.claude/.env`)
    }
  }
} catch (err) {
  // Non-fatal — user can manually copy the script
  console.warn(`  ⚠ Could not install start-claude.sh: ${err.message}`)
}
