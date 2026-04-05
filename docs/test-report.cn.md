# Claude Code 测试报告 — HarmonyOS PC

| 项目 | 值 |
|---|---|
| **日期** | 2026-04-03 ~ 2026-04-04 |
| **平台** | HarmonyOS 6.0 PC（HongMeng Kernel 1.12.0 aarch64）|
| **Node 版本** | v24.13.0 |
| **Claude Code 版本** | 2.1.81 |
| **模型** | claude-opus-4-6[1m]（Opus 4.6 1M 上下文）|
| **API 代理** | https://a-ocnfniawgw.cn-shanghai.fcapp.run |
| **工作目录** | /storage/Users/currentUser |
| **测试方法** | TUI 交互式会话 + 非交互式 CLI |
| **NODE_TLS_REJECT_UNAUTHORIZED** | 0（为 WebFetch 禁用 TLS 验证）|

---

## 最终结果汇总

**17 个工具测试，17 个通过，0 个失败 — 通过率 100%**

| # | 工具 | 状态 | 备注 |
|---|------|------|------|
| 1 | Read | **通过** | 读取 hello.js、data.txt、src/utils.js |
| 2 | Write | **通过** | 创建 notebook-test.ipynb、grep-target.txt、write-test.txt |
| 3 | Edit | **通过** | 字符串替换通过重新读取验证 |
| 4 | Bash | **通过** | mkdir、echo、date、cat、git init/add/commit |
| 5 | Grep | **通过** | 跨文件模式匹配（ripgrep via postinstall）|
| 6 | Glob | **通过** | 在目录树中找到 *.js、*.txt 文件 |
| 7 | WebFetch | **通过** | 528 字节（200 OK），Haiku 处理内容 |
| 8 | WebSearch | **通过** | 搜索查询返回结果 |
| 9 | Agent | **通过** | 子代理：2 次工具使用、8.2k tokens、13 秒 |
| 10 | TodoWrite | **通过** | 任务列表在整个会话中可见并更新 |
| 11 | NotebookEdit | **通过** | 创建 notebook-test.ipynb |
| 12 | TaskCreate | **通过** | 任务创建成功 |
| 13 | TaskList | **通过** | 列出任务及状态 |
| 14 | TaskGet | **通过** | 获取任务信息 |
| 15 | TaskUpdate | **通过** | 更新任务进度 |
| 16 | Skill | **通过** | 通过 git 上下文调用 |
| 17 | ToolSearch | **通过** | 会话启动时加载工具模式 |

---

## 阶段一：初始工具测试（2026-04-03）

第一轮测试——基本工具功能，使用 `/storage/Users/currentUser/tp/` 目录中的已有文件。

### Read 工具 — 通过

**测试 1.1：读取 hello.js**

```js
function greet(name) {
    return "Hello, " + name + "!";
}
console.log(greet("HarmonyOS"));
```

**测试 1.2：读取 data.txt** — 7 行水果名称（apple 到 grape）。

**测试 1.3：读取 src/utils.js** — add/multiply 函数和 `module.exports`。

### Bash 工具 — 通过

```text
$ node hello.js
Hello, HarmonyOS!

$ uname -a
HarmonyOS localhost HongMeng Kernel 1.12.0 #1 SMP Mon Mar 16 23:34:38 UTC 2026 aarch64 Toybox

$ node --version
v24.13.0
```

### Write 工具 — 通过

创建 `result.txt`，内容为 `E2E test passed`。通过回读验证——内容匹配。

### Edit 工具 — 通过

向 hello.js 添加 `farewell()` 函数。通过 `node hello.js` 验证：

```text
Hello, HarmonyOS!
Goodbye, HarmonyOS!
```

### Grep 工具 — 通过

- 在 *.js 中搜索 `function` → 2 个文件中找到 3 个匹配
- 在 data.txt 中搜索 `banana` → 第 2 行匹配
- 在 src/ 中搜索 `module` → utils.js 中的 `module.exports`

### Glob 工具 — 通过

- `*.js` → hello.js、src/utils.js
- `*.txt` → data.txt

### WebFetch 工具 — 失败（初始）

```text
API Error: 400 {"error":"1m context configuration issue","type":"error"}
```

根因：`ANTHROPIC_SMALL_FAST_MODEL` 缺少 `[1m]` 后缀，导致二次模型调用（内容处理）缺少 `context-1m-2025-08-07` beta 请求头。在阶段二修复。

---

## 阶段二：WebFetch 调试与修复（2026-04-04）

### TUI 直连 HTTPS 测试 — 通过

通过 `start-claude.sh` 启动，直连 HTTPS 到 API 代理（无 Mac 侧代理）。显示 **Opus 4.6 (1M context) · API Usage Billing**。提示 "What is 2+2?" → **4**。

### 修复一：模型 `[1m]` 后缀

`src/utils/context.ts` 中的 `has1mContext()` 函数检查 `[1m]` 后缀来决定是否包含 beta 请求头：

```typescript
export function has1mContext(model: string): boolean {
  if (is1mContextDisabled()) return false
  return /\[1m\]/i.test(model)
}
```

**解决方案**：在 `start-claude.sh` 中为所有模型环境变量添加 `[1m]`：

```shell
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-6[1m]'
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-opus-4-6[1m]'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5-20251001[1m]'
export ANTHROPIC_SMALL_FAST_MODEL='claude-haiku-4-5-20251001[1m]'
```

`[1m]` 后缀在 API 调用前被 `normalizeModelStringForAPI()` 移除。`SMALL_FAST_MODEL` 使用 Haiku——后台任务更快更省。

**验证（百度）**：

| 步骤 | 结果 |
|------|------|
| Fetch(https://www.baidu.com) | **通过** — 绿色圆点，227 字节（200 OK）|
| 二次模型调用（Haiku）| **通过** |
| Claude 最终回复 | **百度一下，你就知道** |

### 修复二：TLS 证书存储

获取 `example.com` 时报错 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` — HarmonyOS PC 的 CA 存储不完整（缺少 DigiCert 等常见 CA）。Node.js `axios` 依赖系统 CA 存储。

**解决方案**：在启动环境中设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。

**验证（example.com）**：

| 步骤 | 结果 |
|------|------|
| Fetch(https://example.com) | **通过** — 528 字节（200 OK）|
| 二次模型调用（Haiku）| **通过** |
| 最终结果 | **Page Title: Example Domain** |

未使用 curl 降级。WebFetch 端到端原生工作。

---

## 阶段三：全工具套件（2026-04-04）

应用两项修复后，在单次 TUI 会话（约 15 分钟）中测试了全部 17 个工具。

### 核心文件工具（Read / Write / Edit）— 通过

- **Read**：读取 tp/ 中的已有文件（hello.js、data.txt、src/utils.js）
- **Write**：创建 notebook-test.ipynb、grep-target.txt、write-test.txt — 通过 Read 验证
- **Edit**：字符串替换已应用，通过回读验证

### Shell 工具（Bash）— 通过

```text
mkdir -p /storage/Users/currentUser/tp && ls
→ data.txt  hello.js  result.txt  src

echo "Bash tool works: $(date)" > tp/bash-test.txt && cat tp/bash-test.txt
→ Bash tool works: Fri Apr  4 03:37:46 UTC 2026

git init && git add write-test.txt && git commit -m "initial"
→ [master (root-commit) 6606c5d] initial
```

注意：由于 HarmonyOS 文件系统所有权问题，`git init` 需要 `safe.directory` 配置。

### 搜索工具（Grep / Glob）— 通过

使用 ripgrep（通过 postinstall 安装的 musl 二进制文件，经 binary-sign-tool 签名）进行模式匹配。

### WebFetch — 通过

```text
Fetch(https://example.com)
└ Received 528 bytes (200 OK)
```

两个阶段均成功：HTTP 获取（axios）→ 内容由 Haiku（`getSmallFastModel()`）处理。

### WebSearch — 通过

```text
Web Search("Claude Code CLI tool Anthropic 2026")
```

### Agent — 通过

```text
Agent(Agent tool smoke test)
└ Done (2 tool uses · 8.2k tokens · 13s)
```

### TodoWrite — 通过

```text
2 tasks (1 done, 1 in progress, 0 open)
✅ Test all available tools
■ Write test report
```

### NotebookEdit — 通过

创建 `tp/notebook-test.ipynb`（Jupyter 笔记本），通过 Read 验证。

### Task 工具（Create / List / Get / Update）— 通过

四个任务管理工具均测试通过。

### Skill — 通过（通过调用）

调用了 `simplify` 技能。需要带暂存更改的 git 上下文——在 tp/ 中初始化了 git 仓库。

### ToolSearch — 通过

会话启动时加载了所有工具模式，确认延迟工具发现正常工作。

---

## 模型可用性

通过非交互式 CLI 在 macOS 上对 API 代理测试：

| 模型 | 状态 | 备注 |
|------|------|------|
| `claude-opus-4-6[1m]` | **通过** | 主模型——已确认可用 |
| `claude-haiku-4-5-20251001[1m]` | **通过** | 后台任务——快速且经济 |
| `claude-sonnet-4-5-20250929[1m]` | **失败** | 超时（>45秒），代理上不可用 |
| `claude-3-5-haiku-20241022[1m]` | **失败** | 超时（>45秒），代理上不可用 |

**推荐配置**：

```shell
export ANTHROPIC_MODEL='opus[1m]'
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-6[1m]'
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-opus-4-6[1m]'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5-20251001[1m]'
export ANTHROPIC_SMALL_FAST_MODEL='claude-haiku-4-5-20251001[1m]'
```

---

## 环境说明

- **`NODE_TLS_REJECT_UNAUTHORIZED=0`** — WebFetch 在 HarmonyOS PC 上需要此设置（系统 CA 证书不完整）
- **所有模型环境变量必须包含 `[1m]` 后缀** — 代理要求 `context-1m-2025-08-07` beta 请求头
- **`ANTHROPIC_SMALL_FAST_MODEL='claude-haiku-4-5-20251001[1m]'`** — 用于 WebFetch 内容处理
- **ripgrep** — 通过 postinstall 可用（musl 二进制文件，经 binary-sign-tool 签名）
- **git** — 由于文件系统所有权问题，需要 `safe.directory` 和用户配置

## 已知问题

- **API 520 错误**：代理偶尔对长时间运行的 API 调用返回 520 错误。重试通常可解决。
- **HiShell 输入法**：输入命令前必须切换到英文输入法（Shift 键切换）。
- **git 所有权**：HarmonyOS 文件系统所有权与典型 Linux 不同，需要 `git config --global --add safe.directory`。

---

*报告基于 HarmonyOS 6.0 PC 上的多次 TUI 测试会话编制*
*Claude Code 2.1.81（Claude Opus 4.6 1M context）*

---

[English version](test-report.md)
