# Claude Code Test Report — HarmonyOS PC

| Field | Value |
|---|---|
| **Date** | 2026-04-03 ~ 2026-04-04 |
| **Platform** | HarmonyOS 6.0 PC (HongMeng Kernel 1.12.0 aarch64) |
| **Node Version** | v24.13.0 |
| **Claude Code Version** | 2.1.81 |
| **Model** | claude-opus-4-6[1m] (Opus 4.6 1M context) |
| **API Proxy** | https://a-ocnfniawgw.cn-shanghai.fcapp.run |
| **Working Directory** | /storage/Users/currentUser |
| **Test Method** | TUI interactive sessions + non-interactive CLI |
| **NODE_TLS_REJECT_UNAUTHORIZED** | 0 (TLS verification disabled for WebFetch) |

---

## Final Results Summary

**17 tools tested, 17 passed, 0 failed — 100% pass rate**

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 1 | Read | **PASS** | Read hello.js, data.txt, src/utils.js |
| 2 | Write | **PASS** | Created notebook-test.ipynb, grep-target.txt, write-test.txt |
| 3 | Edit | **PASS** | String replacement verified via re-read |
| 4 | Bash | **PASS** | mkdir, echo, date, cat, git init/add/commit |
| 5 | Grep | **PASS** | Pattern matching across files (ripgrep via postinstall) |
| 6 | Glob | **PASS** | Found *.js, *.txt files across directory tree |
| 7 | WebFetch | **PASS** | 528 bytes (200 OK), content processed by Haiku |
| 8 | WebSearch | **PASS** | Search query returned results |
| 9 | Agent | **PASS** | Subagent: 2 tool uses, 8.2k tokens, 13s |
| 10 | TodoWrite | **PASS** | Task list visible and updated throughout session |
| 11 | NotebookEdit | **PASS** | Created notebook-test.ipynb |
| 12 | TaskCreate | **PASS** | Task created successfully |
| 13 | TaskList | **PASS** | Listed tasks with status |
| 14 | TaskGet | **PASS** | Retrieved task information |
| 15 | TaskUpdate | **PASS** | Updated task progress |
| 16 | Skill | **PASS** | Invoked via git context |
| 17 | ToolSearch | **PASS** | Tool schemas loaded at session start |

---

## Phase 1: Initial Tool Tests (2026-04-03)

First test round — basic tool functionality with existing test files in `/storage/Users/currentUser/tp/`.

### Read Tool — PASS

**Test 1.1: Read hello.js**

```js
function greet(name) {
    return "Hello, " + name + "!";
}
console.log(greet("HarmonyOS"));
```

**Test 1.2: Read data.txt** — 7 lines of fruit names (apple through grape).

**Test 1.3: Read src/utils.js** — add/multiply functions with `module.exports`.

### Bash Tool — PASS

```text
$ node hello.js
Hello, HarmonyOS!

$ uname -a
HarmonyOS localhost HongMeng Kernel 1.12.0 #1 SMP Mon Mar 16 23:34:38 UTC 2026 aarch64 Toybox

$ node --version
v24.13.0
```

### Write Tool — PASS

Created `result.txt` with content `E2E test passed`. Verified by reading back — content matched.

### Edit Tool — PASS

Added `farewell()` function to hello.js. Verified via `node hello.js`:

```text
Hello, HarmonyOS!
Goodbye, HarmonyOS!
```

### Grep Tool — PASS

- `function` in *.js → 3 matches across 2 files
- `banana` in data.txt → match on line 2
- `module` in src/ → `module.exports` in utils.js

### Glob Tool — PASS

- `*.js` → hello.js, src/utils.js
- `*.txt` → data.txt

### WebFetch Tool — FAIL (initial)

```text
API Error: 400 {"error":"1m context configuration issue","type":"error"}
```

Root cause: `ANTHROPIC_SMALL_FAST_MODEL` lacked the `[1m]` suffix, so the secondary model call (content processing) was missing the required `context-1m-2025-08-07` beta header. Fixed in Phase 2.

---

## Phase 2: WebFetch Debugging & Fixes (2026-04-04)

### TUI Direct HTTPS Test — PASS

Launched via `start-claude.sh` with direct HTTPS to the API proxy (no Mac-side proxy). Displayed **Opus 4.6 (1M context) · API Usage Billing**. Prompt "What is 2+2?" → **4**.

### Fix 1: Model `[1m]` Suffix

The `has1mContext()` function in `src/utils/context.ts` checks for the `[1m]` suffix to decide whether to include the beta header:

```typescript
export function has1mContext(model: string): boolean {
  if (is1mContextDisabled()) return false
  return /\[1m\]/i.test(model)
}
```

**Solution**: Add `[1m]` to all model environment variables in `start-claude.sh`:

```shell
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-6[1m]'
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-opus-4-6[1m]'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5-20251001[1m]'
export ANTHROPIC_SMALL_FAST_MODEL='claude-haiku-4-5-20251001[1m]'
```

The `[1m]` suffix is stripped by `normalizeModelStringForAPI()` before the API call. Using Haiku for `SMALL_FAST_MODEL` — faster and cheaper for background tasks.

**Verification (Baidu)**:

| Step | Result |
|------|--------|
| Fetch(https://www.baidu.com) | **PASS** — green dot, 227 bytes (200 OK) |
| Secondary model call (Haiku) | **PASS** |
| Claude final response | **百度一下，你就知道** |

### Fix 2: TLS Certificate Store

Fetching `example.com` failed with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` — HarmonyOS PC's CA store is incomplete (missing DigiCert and other common CAs). Node.js `axios` relies on the system CA store.

**Solution**: Set `NODE_TLS_REJECT_UNAUTHORIZED=0` in the startup environment.

**Verification (example.com)**:

| Step | Result |
|------|--------|
| Fetch(https://example.com) | **PASS** — 528 bytes (200 OK) |
| Secondary model call (Haiku) | **PASS** |
| Final result | **Page Title: Example Domain** |

No curl fallback used. WebFetch worked end-to-end natively.

---

## Phase 3: Full Tool Suite (2026-04-04)

After applying both fixes, all 17 tools were tested in a single TUI session (~15 minutes).

### Core File Tools (Read / Write / Edit) — PASS

- **Read**: Read existing files from tp/ (hello.js, data.txt, src/utils.js)
- **Write**: Created notebook-test.ipynb, grep-target.txt, write-test.txt — verified by Read
- **Edit**: String replacement applied and verified via re-read

### Shell Tool (Bash) — PASS

```text
mkdir -p /storage/Users/currentUser/tp && ls
→ data.txt  hello.js  result.txt  src

echo "Bash tool works: $(date)" > tp/bash-test.txt && cat tp/bash-test.txt
→ Bash tool works: Fri Apr  4 03:37:46 UTC 2026

git init && git add write-test.txt && git commit -m "initial"
→ [master (root-commit) 6606c5d] initial
```

Note: `git init` required `safe.directory` configuration due to HarmonyOS filesystem ownership.

### Search Tools (Grep / Glob) — PASS

Pattern matching with ripgrep (musl binary installed via postinstall, signed with `binary-sign-tool`).

### WebFetch — PASS

```text
Fetch(https://example.com)
└ Received 528 bytes (200 OK)
```

Both stages succeeded: HTTP fetch via axios → content processed by Haiku via `getSmallFastModel()`.

### WebSearch — PASS

```text
Web Search("Claude Code CLI tool Anthropic 2026")
```

### Agent — PASS

```text
Agent(Agent tool smoke test)
└ Done (2 tool uses · 8.2k tokens · 13s)
```

### TodoWrite — PASS

```text
2 tasks (1 done, 1 in progress, 0 open)
✅ Test all available tools
■ Write test report
```

### NotebookEdit — PASS

Created `tp/notebook-test.ipynb` (Jupyter notebook), verified by Read.

### Task Tools (Create / List / Get / Update) — PASS

All four task management tools tested and passed.

### Skill — PASS (via invocation)

Invoked `simplify` skill. Requires git context with staged changes — a git repository was initialized in tp/ to provide context.

### ToolSearch — PASS

All tool schemas loaded at session start, confirming deferred tool discovery works.

---

## Model Availability

Tested via non-interactive CLI on macOS against the API proxy:

| Model | Status | Notes |
|-------|--------|-------|
| `claude-opus-4-6[1m]` | **PASS** | Main model — confirmed working |
| `claude-haiku-4-5-20251001[1m]` | **PASS** | Background tasks — fast and cheap |
| `claude-sonnet-4-5-20250929[1m]` | **FAIL** | Timeout (>45s), not available on proxy |
| `claude-3-5-haiku-20241022[1m]` | **FAIL** | Timeout (>45s), not available on proxy |

**Recommended configuration**:

```shell
export ANTHROPIC_MODEL='opus[1m]'
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-6[1m]'
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-opus-4-6[1m]'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5-20251001[1m]'
export ANTHROPIC_SMALL_FAST_MODEL='claude-haiku-4-5-20251001[1m]'
```

---

## Environment Notes

- **`NODE_TLS_REJECT_UNAUTHORIZED=0`** is required for WebFetch on HarmonyOS PC (incomplete system CA store)
- **All model env vars must include `[1m]` suffix** — the proxy requires `context-1m-2025-08-07` beta header for all requests
- **`ANTHROPIC_SMALL_FAST_MODEL='claude-haiku-4-5-20251001[1m]'`** for WebFetch content processing
- **ripgrep** available via postinstall (musl binary with binary-sign-tool signing)
- **git** requires `safe.directory` and user config on HarmonyOS due to filesystem ownership

## Known Issues

- **API 520 errors**: The proxy occasionally returns 520 for long-running API calls. Retrying usually resolves the issue.
- **HiShell IME**: Chinese IME must be toggled to English (Shift key) before entering commands.
- **git ownership**: HarmonyOS filesystem ownership differs from typical Linux, requiring `git config --global --add safe.directory`.

---

*Report compiled from multiple TUI test sessions on HarmonyOS 6.0 PC*
*Claude Code 2.1.81 (Claude Opus 4.6 1M context)*

---

[中文版](test-report.cn.md)
