/**
 * Embedded ripgrep binary — only meaningful in Bun-compiled standalone builds.
 *
 * The vendor/rg binary is embedded into the compiled executable via Bun's
 * `import ... with { type: "file" }` in rg-data.ts. At runtime, the import
 * resolves to an internal `$bunfs/` path readable via `fs.readFileSync()`.
 *
 * At first launch (or version change), the binary is extracted to
 * `~/.claude/bin/rg` and reused from there.
 */

import fs from "fs"
import path from "path"
import { homedir } from "os"
import embeddedRgPath from "./rg-data.js"

const RG_DIR = path.join(homedir(), ".claude", "bin")
const RG_VERSION_FILE = path.join(RG_DIR, ".rg-version")

/**
 * Ensure the embedded ripgrep binary is extracted to ~/.claude/bin/rg.
 * Returns the path to the extracted rg binary, or null if no embedded
 * binary is available or extraction failed.
 *
 * Only re-extracts when the claude version changes (stored in .rg-version).
 */
export function ensureEmbeddedRipgrep(appVersion: string): string | null {
  const isWindows = process.platform === "win32"
  const rgBinPath = path.join(RG_DIR, isWindows ? "rg.exe" : "rg")

  try {
    if (fs.existsSync(rgBinPath) && fs.existsSync(RG_VERSION_FILE)) {
      const cachedVersion = fs.readFileSync(RG_VERSION_FILE, "utf-8").trim()
      if (cachedVersion === appVersion) {
        return rgBinPath
      }
    }

    // Read the embedded binary from $bunfs/ (compiled) or vendor/rg (dev)
    const data = fs.readFileSync(embeddedRgPath)
    if (data.length < 1024) {
      // Placeholder file (dev mode) — too small to be a real rg binary
      return null
    }

    fs.mkdirSync(RG_DIR, { recursive: true })

    fs.writeFileSync(rgBinPath, data)
    fs.chmodSync(rgBinPath, 0o755)
    fs.writeFileSync(RG_VERSION_FILE, appVersion)

    return rgBinPath
  } catch {
    return null
  }
}
