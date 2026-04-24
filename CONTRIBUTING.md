# Contributing to Claude Code for HarmonyOS

Thank you for your interest in contributing! This document covers the development workflow and project conventions.

## Getting Started

```bash
# Clone and install
git clone https://github.com/chenjh16/HarmonyOS-Claude-Code.git
cd HarmonyOS-Claude-Code
make deps

# Run from source
make dev

# Run type checking
make typecheck

# Run tests
make test
```

## Development Workflow

### Building

```bash
make build          # Standalone binary for current platform
make build-npm      # npm package
make npm-pack       # Create distributable .tgz
make build-ohos     # HarmonyOS PC deploy bundle
make gh-release     # Build all + create GitHub Release
```

### Testing Changes

```bash
# Quick smoke test
make smoke-test

# Run with skip-onboarding for fast iteration
make run-quick ARGS="-p 'hello world' --bare"

# Full test suite
make test
```

### Project Layout

| Directory | Purpose |
|-----------|---------|
| `src/entrypoints/` | CLI entry point (`cli.tsx`) |
| `src/tools/` | Agent tool implementations (Bash, FileEdit, Grep, etc.) |
| `src/commands/` | Slash command implementations |
| `src/components/` | React (Ink) TUI components |
| `src/ink/` | Custom Ink renderer fork for React 19 |
| `src/constants/` | System prompts, API constants |
| `src/services/` | Analytics, MCP, telemetry, OAuth |
| `src/utils/` | Shared utilities |
| `script/` | Build and packaging scripts |

### Stub Modules

Some internal Anthropic packages are not publicly available. The build system uses `script/create-stubs.ts` to generate no-op stubs for these packages so the bundler can resolve imports. If you encounter missing module errors during build, check if a stub needs to be added there.

### Feature Flags

Feature flags are compile-time constants defined in the build scripts (`script/build.ts`, `script/build-npm.ts`). They are injected as `__FEATURE_<NAME>__` defines and default to `false`. To enable a feature:

```bash
make FEATURE_VOICE_MODE=true build
```

## Code Style

- TypeScript with strict mode
- ESM modules (`"type": "module"`)
- React JSX for TUI components (`.tsx` files)
- No CommonJS `require()` — use `import`

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b my-feature`)
3. Make your changes
4. Run `make typecheck && make test`
5. Commit with a descriptive message
6. Open a pull request

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
