# Claude Code for HarmonyOS — 移植变更文档

本文档记录了对上游 [Claude Code](https://github.com/anthropics/claude-code) 源码所做的
所有修改，以实现 HarmonyOS PC 兼容性和独立 npm 打包。

## 变更分类

| # | 类别 | 问题 | 解决方案 | 关键文件 |
|---|------|------|----------|----------|
| 1 | [构建系统与打包](#1-构建系统与打包) | Bun 特定的构建特性 | npm 包构建路径 | `build-npm.ts`, `Makefile`, `package.json` |
| 2 | [N-API 模块替换](#2-n-api-模块替换) | 原生 C++ 模块缺少 HarmonyOS 预编译 | 纯 TS 移植 | `colorDiff.ts`, `modifiers.ts` |
| 3 | [缺失的 npm 包](#3-缺失的-npm-包) | 内部/外部包处理不当 | 安装公开包 + 存根内部包 | `package.json`, `create-stubs.ts` |
| 4 | [存根源文件](#4-存根源文件) | 内部源文件未开源 | 导出存根 | 15+ 存根文件 |
| 5 | [Ripgrep 集成](#5-ripgrep-集成) | 嵌入式 rg 在 npm 模式下不可用 | 安装后下载 + 签名 | `postinstall-rg.mjs`, `rg-embedded.ts`, `ripgrep.ts` |
| 6 | [API 兼容性](#6-api-兼容性) | Tool Search 限制为第一方端点 | 移除限制 | `toolSearch.ts` |
| 7 | [CLI 兼容性](#7-cli-兼容性) | `-d2e` 短标志解析问题 | 仅保留长格式 | `main.tsx` |
| 8 | [OpenHarmony 平台支持](#8-openharmony-平台支持) | 多个平台特有问题 | 平台检测 + 绕过方案 | `ripgrep.ts`, `postinstall-rg.mjs` |

---

## 1. 构建系统与打包

### 问题

原始 Claude Code 构建系统与 Bun 紧密耦合：
- `bun build --compile` 生成嵌入 Bun 运行时的独立二进制文件
- 特性标志使用 Bun 的 `define` 编译时替换（`MACRO.VERSION` 等）
- Ripgrep 通过 `import ... with { type: "file" }` 嵌入（Bun 特有）

独立二进制需要 glibc，但 HarmonyOS PC 使用 musl libc，导致 Bun 二进制文件不兼容。

### 解决方案

创建了并行的 npm 包构建路径：

- **`script/build-npm.ts`** — 使用 Bun 打包器将所有源码打包为单个 `cli.js`，
  但输出标准 ESM JavaScript（无需 Bun 运行时）。将编译时特性标志替换为环境变量查询。

- **`Makefile`** — 在现有的 `build`（独立二进制）目标旁添加了 `npm-pack`、`npm-install` 目标。

- **`package.json`** — 配置了 `bin`、`files` 和 npm 脚本，支持通过 `npm install -g` 全局安装。

### 权衡

- 构建仍需要 Bun（打包器使用 Bun 特有的 tree-shaking 特性来消除约 30 个功能门控模块）
- npm 包输出为标准 ESM，可在任何 Node.js >= 20 上运行

---

## 2. N-API 模块替换

### 问题

Claude Code 使用两个 N-API（原生 C++ 插件）包：

| 包名 | 用途 | 问题 |
|------|------|------|
| `color-diff-napi` | diff 语法高亮 | 无 `openharmony-arm64` 预编译二进制 |
| `modifiers-napi` | 键盘修饰键检测（仅 macOS） | 无预编译二进制；仅 macOS |

### 解决方案

**`color-diff-napi` → TypeScript 移植**（`src/native-ts/color-diff/`）
- 将颜色 diff 算法移植为纯 TypeScript
- 导入路径变更：`from 'color-diff-napi'` → `from '../../native-ts/color-diff/index.js'`
- 文件：`src/components/StructuredDiff/colorDiff.ts`

**`modifiers-napi` → `keyspy`**（跨平台键盘监听器）
- 将仅 macOS 的 N-API 模块替换为跨平台键盘事件监听器 `keyspy`
- 从同步轮询（`nativeIsModifierPressed`）改为事件驱动的状态跟踪（`GlobalKeyboardListener`）
- 文件：`src/utils/modifiers.ts`

---

## 3. 缺失的 npm 包

### 问题

Claude Code 源码引用了 `@anthropic-ai/` 命名空间下的 npm 包。其中一些在 npm 上公开可用，
但最初被错误地当作内部包处理（用存根替代）。另一些确实是 Anthropic 内部包，无法公开获取。

### 解决方案

**第一阶段：发现** — 扫描所有导入，通过 npm registry 查询确认哪些包公开可用。

**第二阶段：安装公开包** — 7 个被确认为公开可用的包已安装为真实依赖：

| 包名 | 版本 | 用途 |
|------|------|------|
| `@anthropic-ai/claude-agent-sdk` | ^0.2.87 | Agent SDK 类型定义 |
| `@anthropic-ai/sandbox-runtime` | ^0.0.44 | Bash 命令沙箱（bubblewrap/seccomp） |
| `@anthropic-ai/mcpb` | ^2.1.2 | MCP Bundle 清单解析 |
| `@anthropic-ai/bedrock-sdk` | ^0.26.4 | AWS Bedrock 接入 |
| `@anthropic-ai/vertex-sdk` | ^1.1.4 | Google Vertex AI 接入 |
| `@anthropic-ai/foundry-sdk` | ^0.1.0 | Azure Foundry 接入 |
| `@azure/identity` | ^4.8.0 | Azure 认证 |

**第三阶段：存根内部包** — `@ant/*` 命名空间下的 4 个包确实是 Anthropic 内部包，
未在 npm 上发布。这些仍使用存根：

| 包名 | 用途 | 影响 |
|------|------|------|
| `@ant/computer-use-mcp` | 桌面自动化 MCP 服务端（12 处导入） | Computer Use 功能不可用 |
| `@ant/claude-for-chrome-mcp` | Chrome 扩展 MCP 集成（3 处导入） | Chrome 集成不可用 |
| `@ant/computer-use-swift` | macOS 原生 Computer Use（Swift 桥接，1 处导入） | macOS 桌面操控不可用 |
| `@ant/computer-use-input` | Computer Use 输入设备抽象（1 处导入） | Computer Use 输入不可用 |

所有存根由 `script/create-stubs.ts` 在构建时自动生成。

---

## 4. 存根源文件

### 问题

Claude Code 源码引用了约 51 个未包含在开源版本中的内部源文件。主要类别：

| 类别 | 示例 | 影响 |
|------|------|------|
| 功能门控 UI 组件 | `AssistantSessionChooser.ts`, `SnapshotUpdateDialog.ts` | 低 — 在功能标志后 |
| 内部工具 | `TungstenTool/`, `REPLTool/`, `SuggestBackgroundPRTool/` | 中 — 工具不可用 |
| SDK 类型 | `entrypoints/sdk/coreTypes.generated.ts`（3 个文件） | 低 — 仅类型导出 |
| 内部工具函数 | `protectedNamespace.ts`, `contextCollapse/` | 低 — 返回 false/null |
| 技能内容 | `skills/bundled/verify/**/*.md`, `claude-api/**/*.md`（28 个文件） | 中 — 占位符内容 |
| 开发工具 | `ink/devtools.ts`, `global.d.ts` | 低 — 仅开发时使用 |

### 解决方案

创建导出 null/空值的最小存根文件：

```typescript
export const AssistantSessionChooser = () => null
export default null
export {}
export function isInProtectedNamespaceInternal(): boolean { return false }
```

由 `script/create-stubs.ts` 生成，扫描缺失的导入并创建相应存根。共约 51 个存根文件。

---

## 5. Ripgrep 集成

### 问题

HarmonyOS PC 上的 ripgrep 存在多个问题：

1. **嵌入式二进制**：独立构建通过 Bun 的 `embeddedFiles` 嵌入 `rg`，但 npm 包没有此机制。
2. **供应商二进制**：npm 包附带平台特定的 `rg` 二进制，但不存在 `arm64-openharmony` 版本。
3. **musl libc**：HarmonyOS 使用 musl 而非 glibc。标准 Linux `rg` 二进制会以 `SIGABRT` 崩溃。
4. **安全沙箱**：HarmonyOS 阻止执行下载的二进制文件，除非使用 `binary-sign-tool` 签名。
5. **管道捕获 bug**：Node.js 的 stdout 管道捕获在 OpenHarmony 上返回空缓冲区。
   详见 [openharmony-pipe-fix.cn.md](openharmony-pipe-fix.cn.md)。

### 解决方案

**`src/utils/rg-embedded.ts`**（新增）— 嵌入式 ripgrep 提取逻辑。
检查 `~/.claude/bin/rg` 版本缓存，按需从 Bun `embeddedFiles` 提取。

**`src/utils/rg-data.ts`**（新增）— 使用 Bun 文件嵌入属性的静态导入。

**`src/utils/ripgrep.ts`** — 三处主要变更：
1. 修改 `getRipgrepConfig()` 添加步骤 2b：在回退到供应商二进制之前，
   检查 `~/.claude/bin/rg`（安装后下载的二进制）。
2. 添加 `isOpenHarmony` 平台检测和管道捕获 bug 的文件 I/O 绕过。
3. 添加 `ripGrepRawViaFile()` 函数，将 rg 输出重定向到临时文件而非依赖管道捕获。

**`script/postinstall-rg.mjs`** — npm 安装后脚本：
- 检测 `openharmony` 平台并下载 musl 兼容的 `rg` 二进制
- 如可用，使用 `binary-sign-tool` 签名二进制
- 签名失败时优雅降级（用户需启用系统设置）

---

## 6. API 兼容性

### 问题

`toolSearch.ts` 中的 `isToolSearchEnabledOptimistic()` 函数在 `ANTHROPIC_BASE_URL`
指向非 Anthropic 主机时禁用了 Tool Search（defer_loading + tool_reference）。
这阻止了第三方 API 代理使用 tool_reference 功能，即使许多代理（LiteLLM、Cloudflare AI
Gateway 等）支持这些功能。

### 解决方案

移除第一方 URL 限制。Tool Search 现对所有 API 端点启用。
用户可通过 `ENABLE_TOOL_SEARCH=false` 禁用（如果代理不支持 `tool_reference` 块）。

同时移除了不再使用的 `getAPIProvider` 和 `isFirstPartyAnthropicBaseUrl` 导入。

---

## 7. CLI 兼容性

### 问题

`-d2e` 作为 `--debug-to-stderr` 的短标志别名，在某些平台上导致 Commander.js 解析问题。

### 解决方案

改为仅使用长格式：`--debug-to-stderr`（移除 `-d2e` 别名）。

---

## 8. OpenHarmony 平台支持

### 问题

HarmonyOS 6.0 PC 报告 `process.platform === 'openharmony'`，标准 Node.js 代码无法识别。
多个平台特有问题：

| 问题 | 根因 |
|------|------|
| `process.platform` 未知 | OpenHarmony 报告为 `'openharmony'` 而非 `'linux'` |
| `/tmp` 只读 | HarmonyOS 沙箱限制临时目录 |
| 管道捕获失效 | 内核 bug：已签名二进制的 stdout 管道返回空 |
| 无预编译 `rg` | 不存在 `arm64-openharmony` ripgrep 二进制 |
| 二进制执行被阻止 | 安全沙箱要求 `binary-sign-tool` 签名 |

### 解决方案

| 修复 | 实现 |
|------|------|
| 平台检测 | `ripgrep.ts` 中 `isOpenHarmony = process.platform === 'openharmony'` |
| 安装后脚本平台映射 | `postinstall-rg.mjs` 中 `openharmony` → `linux.arm64_musl` |
| TMPDIR 绕过 | `CLAUDE_CODE_TMPDIR` 环境变量（在 `start-claude.sh` 中设置） |
| 管道绕过 | `ripGrepRawViaFile()` 文件 I/O — 详见 [openharmony-pipe-fix.cn.md](openharmony-pipe-fix.cn.md) |
| 二进制签名 | `postinstall-rg.mjs` 中自动使用 `binary-sign-tool` 签名 |
| 系统设置 | README 中记录一次性"运行来自非应用市场的扩展程序"设置 |

---

## 9. 非必要网络流量开关

### 问题

Claude Code 除核心 LLM API 调用外，还发起大量网络请求：
分析/遥测（Datadog、第一方事件）、OAuth 认证、自动更新版本检查、
设置同步、会话记录分享、功能标志（GrowthBook）、MCP 注册表预取、
WebFetch 域名黑名单检查、BigQuery 指标导出等。
在第三方部署中，这些请求不必要且可能涉及隐私问题。

### 解决方案

利用 `privacyLevel.ts` 中已有的 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
环境变量和 `isEssentialTrafficOnly()` 守卫函数。新增两个并列开关：
`CLAUDE_CODE_SKIP_ANTHROPIC_ACCOUNT`（禁用 9 个账号相关访问点）和
`CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK`（跳过 WebFetch 域名黑名单检查）。
部分网络访问点已有门控；为其他文件添加了守卫：

| 文件 | 函数 | 效果 |
|------|------|------|
| `utils/auth.ts` | `isAnthropicAuthEnabled()` | OAuth 禁用，仅 API Key |
| `utils/autoUpdater.ts` | `assertMinVersion()` | 版本检查跳过 |
| `components/FeedbackSurvey/submitTranscriptShare.ts` | `submitTranscriptShare()` | 会话记录分享阻止 |
| `services/settingsSync/index.ts` | upload/download/redownload | 设置同步禁用 |
| `tools/WebFetchTool/utils.ts` | `checkDomainBlocklist()` | 所有域名本地允许 |
| `utils/telemetry/bigqueryExporter.ts` | `export()` | 指标导出空操作 |
| `services/api/metricsOptOut.ts` | `checkMetricsEnabled()` | 立即返回禁用 |

保持活跃：LLM API 调用、工具搜索、WebFetch 工具、MCP 客户端、Bash 命令。

### 关键文件

- `src/utils/privacyLevel.ts` — 集中式隐私级别系统

详见 [nonessential-traffic-toggle.cn.md](nonessential-traffic-toggle.cn.md)。

---

## 10. TLS 证书存储修复

### 问题

HarmonyOS PC 的系统 CA 证书存储不完整——缺少 DigiCert 等常用证书颁发机构。
这导致 WebFetch 等工具获取 HTTPS 网站内容时（如 `example.com`），Node.js TLS
验证失败，报错 `unable to get local issuer certificate`。API 镜像端点使用受
信任的 CA 链，不受影响。

### 解决方案

在启动环境中设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`，禁用 Node.js 出站 HTTPS
请求的证书验证。已添加到 `start-claude.sh`。

| 范围 | 影响 |
|------|------|
| WebFetch 工具 | 可获取任意 HTTPS URL，无 TLS 错误 |
| API 调用 | 不受影响——镜像端点的 CA 链已受信任 |
| 安全权衡 | 本地开发可接受；不通过不受信任的连接传输敏感凭据 |

### 关键文件

`start-claude.sh` — 添加 `export NODE_TLS_REJECT_UNAUTHORIZED=0`

---

## 文件变更汇总

### 修改的源文件

| 文件 | 变更 |
|------|------|
| `src/components/StructuredDiff/colorDiff.ts` | 导入路径：`color-diff-napi` → `native-ts/color-diff` |
| `src/utils/modifiers.ts` | `modifiers-napi` → `keyspy` 事件驱动跟踪 |
| `src/utils/ripgrep.ts` | +260 行：安装后路径、OpenHarmony 管道绕过 |
| `src/utils/toolSearch.ts` | 移除第一方 URL 限制 |
| `src/main.tsx` | 移除 `-d2e` 标志 |
| `src/utils/auth.ts` | +`isEssentialTrafficOnly()` OAuth 守卫 |
| `src/utils/autoUpdater.ts` | +`isEssentialTrafficOnly()` 版本检查守卫 |
| `src/components/FeedbackSurvey/submitTranscriptShare.ts` | +`isEssentialTrafficOnly()` 守卫 |
| `src/services/settingsSync/index.ts` | +`isEssentialTrafficOnly()` 同步守卫 |
| `src/tools/WebFetchTool/utils.ts` | +`isEssentialTrafficOnly()` 域名检查守卫 |
| `src/utils/telemetry/bigqueryExporter.ts` | +`isEssentialTrafficOnly()` 导出守卫 |
| `src/services/api/metricsOptOut.ts` | +`isEssentialTrafficOnly()` 指标检查守卫 |

### 新增源文件

| 文件 | 用途 |
|------|------|
| `src/utils/rg-embedded.ts` | 嵌入式 ripgrep 提取逻辑 |
| `src/utils/rg-data.ts` | Bun 文件嵌入导入 |
| `src/native-ts/color-diff/` | color-diff-napi 的纯 TS 移植 |
| 15+ 存根文件 | 缺失的内部包存根 |

### 新增构建/配置文件

| 文件 | 用途 |
|------|------|
| `script/build-npm.ts` | npm 包构建脚本 |
| `script/postinstall-rg.mjs` | 安装后 ripgrep 安装器 |
| `script/create-stubs.ts` | 存根文件生成器 |
| `start-claude.sh` | HarmonyOS 一键启动脚本 |
| `Makefile` | 含 npm 目标的构建系统 |

---

> **English version**: [porting-changes.md](porting-changes.md)
