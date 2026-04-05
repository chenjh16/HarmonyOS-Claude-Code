# Changelog

All notable changes to Claude Code for HarmonyOS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.1.81] - 2026-04-05

### Added
- Initial release based on [Claude Code v2.1.81](https://github.com/anthropics/claude-code)
- HarmonyOS 6.0 PC native support (AArch64, musl libc)
- npm package build path (`make build-npm`, `make npm-pack`)
- HarmonyOS deploy bundle (`make build-ohos`)
- GitHub Release automation (`make gh-release`)
- Startup script auto-install via `npm postinstall` (`~/.claude/start-claude.sh`)
- Privacy & network toggles for third-party API proxies
- ripgrep postinstall with HarmonyOS binary signing (`binary-sign-tool`)
- TMPDIR workaround for read-only `/tmp` on HarmonyOS
- TLS certificate workaround (`NODE_TLS_REJECT_UNAUTHORIZED=0`)
- Pipe capture workaround for HarmonyOS's `child_process` bug
- Comprehensive bilingual documentation (English + Chinese)
- Test report: 17/17 tools verified on HarmonyOS PC

### Changed
- Standalone binary targets: darwin, linux, win32 (6 targets)
- npm package target: all platforms including HarmonyOS PC (pure JavaScript)
- Model configuration: `[1m]` suffix support for 1M context beta header
- `start-claude.sh`: placeholder API endpoint (configure your own)

### Security
- API token must be set via `ANTHROPIC_AUTH_TOKEN` environment variable (no hardcoded tokens)
