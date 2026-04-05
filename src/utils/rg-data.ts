/**
 * Static import of the vendor/rg binary using Bun's file embedding.
 *
 * During `bun build --compile`, this embeds the binary into the executable
 * and returns an internal `$bunfs/` path at runtime. In dev mode, it returns
 * the regular filesystem path to vendor/rg.
 */

// @ts-ignore — Bun-specific import attribute for file embedding
import rgPath from "../../vendor/rg" with { type: "file" }

export default rgPath as string
