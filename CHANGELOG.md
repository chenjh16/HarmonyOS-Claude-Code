# Changelog

All notable changes to Claude Code for HarmonyOS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.1.88-ohos.1] - 2026-04-24

### Added
- Initial release based on Claude Code v2.1.88 source map
- HarmonyOS 6.0 PC native support (AArch64, musl libc)
- npm package build path (`make build-npm`, `make npm-pack`)
- HarmonyOS deploy bundle (`make build-ohos`)
- GitHub Release automation (`make gh-release`)
- Startup script auto-install via `npm postinstall` (`~/.claude/start-claude.sh` + `~/.claude/.env.example`)
- Privacy & network toggles for third-party API proxies
- ripgrep postinstall with HarmonyOS binary signing (`binary-sign-tool`)
- TMPDIR workaround for read-only `/tmp` on HarmonyOS
- TLS certificate workaround (`NODE_TLS_REJECT_UNAUTHORIZED=0`)
- Pipe capture workaround for HarmonyOS's `child_process` bug
- Comprehensive bilingual documentation (English + Chinese)
- Test report: 17/17 tools verified on HarmonyOS PC
- `versions/sourcemap/` submodule with complete source map for reverse engineering
- `versions/ohos-patches/` with consolidated HarmonyOS adaptation patches

### Changed
- Standalone binary targets: darwin, linux, win32 (6 targets)
- npm package target: all platforms including HarmonyOS PC (pure JavaScript)
- Model configuration: `[1m]` suffix support for 1M context beta header
- `start-claude.sh`: loads credentials from `~/.claude/.env` (configure via `~/.claude/.env.example`)

### Security
- API credentials managed via `~/.claude/.env` file (not hardcoded in scripts)
- `start-claude.sh` auto-loads `.env` at startup
