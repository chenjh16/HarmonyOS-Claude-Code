# OpenHarmony Pipe Capture Bug — Root Cause & Fix

## Root Cause

On HarmonyOS 6.0 PC (OpenHarmony kernel, AArch64, musl libc), Node.js's
`child_process` module has a **kernel-level bug** affecting stdout pipe capture
from spawned binary processes.

### Symptoms

- `execFile("/path/to/rg", ["pattern", "."], callback)` — `rg` exits with
  code 0 (success) but `stdout` is a **zero-length buffer**
- `execSync("/path/to/rg pattern .")` — same result: empty output, no error
- `spawnSync` with `stdio: ['pipe', 'pipe', 'pipe']` — same result
- Running the exact same command directly in a shell (PTY) — **works correctly**
  and produces expected output
- Redirecting `rg` output to a file (`> /path/to/file`) — **works correctly**

### Analysis

| Invocation Method                         | Output Captured? |
|-------------------------------------------|:----------------:|
| Shell (HiShell terminal, PTY)             | ✅ Yes           |
| `execFile` (pipe-based)                   | ❌ Empty         |
| `execSync` (shell + pipe)                 | ❌ Empty         |
| `spawnSync` (pipe-based)                  | ❌ Empty         |
| Shell redirection to file (`> out.txt`)   | ✅ Yes           |
| `fs.readFileSync` of the redirected file  | ✅ Yes           |

The issue is specific to **pipe file descriptors between parent (Node.js) and
child (signed binary) processes** on the OpenHarmony kernel. The binary writes
output correctly to files and PTY devices, but the pipe read buffer in the
parent Node.js process is never filled.

This is likely caused by how OpenHarmony's security sandbox handles pipe I/O
for binaries signed with `binary-sign-tool`. The kernel may apply different
security contexts or buffer handling for signed binaries' stdout when connected
to anonymous pipes vs. files or PTY devices.

### Reproduction

```javascript
// This returns EMPTY output on OpenHarmony, but works on Linux/macOS
const { execFileSync } = require('child_process');
const result = execFileSync('/path/to/signed/rg', ['pattern', '.']);
console.log(result.length);  // → 0

// File redirect workaround produces correct output
const { execSync } = require('child_process');
const fs = require('fs');
execSync('/path/to/signed/rg pattern . > /tmp/rg-out.txt 2>&1 || true');
const output = fs.readFileSync('/tmp/rg-out.txt', 'utf8');
console.log(output);  // → correct matches
```

## Fix

### Strategy

For all ripgrep invocations on OpenHarmony (`process.platform === 'openharmony'`),
redirect stdout/stderr to temporary files instead of relying on pipe capture.
After the process exits, read the files and clean them up.

### Implementation

Modified `src/utils/ripgrep.ts` with the following changes:

1. **Platform detection**: Added `const isOpenHarmony = process.platform === ('openharmony' as NodeJS.Platform)` at module scope.

2. **Helper functions**:
   - `getOpenHarmonyTmpDir()` — creates and returns a temp directory for ripgrep I/O files, using `CLAUDE_CODE_TMPDIR` or `os.tmpdir()` as base.
   - `shellEscapeArg()` — proper single-quote shell escaping for safe command construction.

3. **File-based I/O wrapper** (`ripGrepRawViaFile`):
   - Constructs a shell command that redirects rg stdout/stderr to unique temp files
   - Spawns via `/bin/sh -c` with `stdio: 'ignore'` (no pipes needed)
   - On process close, reads temp files with `fs.readFileSync`, cleans up, and calls the original callback
   - Includes timeout handling with SIGTERM/SIGKILL escalation
   - Proper cleanup on both success and error paths

4. **Affected functions** (all dispatch to file-based I/O on OpenHarmony):

   | Function               | Used By                  | Change                            |
   |------------------------|--------------------------|-----------------------------------|
   | `ripGrepRaw`           | Grep tool, `ripGrep()`   | Dispatch to `ripGrepRawViaFile`   |
   | `ripGrepFileCount`     | File counting telemetry  | File-based count via temp file    |
   | `ripGrepStream`        | Interactive search       | Non-streaming fallback via file   |
   | `testRipgrepOnFirstUse`| Startup availability test| File-based `--version` check      |

### Code Flow (OpenHarmony)

```
Grep tool call
  → ripGrep(args, target, signal)
    → ripGrepRaw(args, target, signal, callback)
      → if (isOpenHarmony) ripGrepRawViaFile(rgPath, fullArgs, signal, callback)
        → spawn('/bin/sh', ['-c', 'rg ... > tmpfile 2> tmperr'])
        → on close: readFileSync(tmpfile) → callback(null, stdout, stderr)
        → cleanup temp files
```

### Trade-offs

- **Streaming**: `ripGrepStream` loses its streaming capability on OpenHarmony
  (results are delivered in one batch after rg exits, not as they arrive).
  This affects interactive search UX but preserves correctness.
- **Disk I/O**: Each ripgrep invocation writes to and reads from temp files,
  adding minor disk overhead. Files are cleaned up immediately after reading.
- **Shell escaping**: Arguments are passed through shell escaping, adding a
  thin layer of complexity. The `shellEscapeArg` function handles all edge
  cases (single quotes, special characters).

### Verification

Tested end-to-end on HarmonyOS 6.0 PC (HiShell terminal):

- ✅ Grep `files_with_matches` mode — found `helloWorld` in 3 files
- ✅ Grep `content` mode — displayed matching lines with line numbers
- ✅ Glob tool — listed all `.js` files correctly
- ✅ `testRipgrepOnFirstUse` — reports ripgrep as working

---

> **中文版**: [openharmony-pipe-fix.cn.md](openharmony-pipe-fix.cn.md)
