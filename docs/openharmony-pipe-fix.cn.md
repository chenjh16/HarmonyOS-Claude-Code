# OpenHarmony 管道捕获 Bug — 根因分析与修复方案

## 根因分析

在 HarmonyOS 6.0 PC（OpenHarmony 内核，AArch64，musl libc）上，Node.js 的
`child_process` 模块存在一个**内核级 bug**，影响从子进程捕获 stdout 管道输出。

### 症状

- `execFile("/path/to/rg", ["pattern", "."], callback)` — `rg` 退出码为 0（成功），
  但 `stdout` 为**零长度缓冲区**
- `execSync("/path/to/rg pattern .")` — 同样结果：空输出，无错误
- `spawnSync` 配合 `stdio: ['pipe', 'pipe', 'pipe']` — 同样结果
- 在终端（PTY）中直接运行相同命令 — **正常工作**，输出结果正确
- 将 `rg` 输出重定向到文件（`> /path/to/file`）— **正常工作**

### 分析

| 调用方式                                  | 输出可捕获？ |
|-------------------------------------------|:----------:|
| Shell（HiShell 终端，PTY）                | ✅ 是      |
| `execFile`（基于管道）                    | ❌ 空      |
| `execSync`（Shell + 管道）                | ❌ 空      |
| `spawnSync`（基于管道）                   | ❌ 空      |
| Shell 重定向到文件（`> out.txt`）         | ✅ 是      |
| `fs.readFileSync` 读取重定向文件          | ✅ 是      |

问题发生在 OpenHarmony 内核中**父进程（Node.js）与子进程（已签名二进制）之间的管道文件描述符**
处理。二进制文件可以正常写入文件和 PTY 设备，但父进程 Node.js 中的管道读缓冲区始终为空。

这很可能是由于 OpenHarmony 的安全沙箱对使用 `binary-sign-tool` 签名的二进制文件的
管道 I/O 处理方式不同。内核可能对已签名二进制连接到匿名管道 vs 文件或 PTY 设备时，
应用了不同的安全上下文或缓冲区处理策略。

### 复现方法

```javascript
// 在 OpenHarmony 上返回空输出，但在 Linux/macOS 上正常工作
const { execFileSync } = require('child_process');
const result = execFileSync('/path/to/signed/rg', ['pattern', '.']);
console.log(result.length);  // → 0

// 文件重定向方式产生正确输出
const { execSync } = require('child_process');
const fs = require('fs');
execSync('/path/to/signed/rg pattern . > /tmp/rg-out.txt 2>&1 || true');
const output = fs.readFileSync('/tmp/rg-out.txt', 'utf8');
console.log(output);  // → 正确的匹配结果
```

## 修复方案

### 策略

对于 OpenHarmony 上（`process.platform === 'openharmony'`）的所有 ripgrep 调用，
将 stdout/stderr 重定向到临时文件，而非依赖管道捕获。进程退出后，读取文件内容并清理。

### 实现细节

修改 `src/utils/ripgrep.ts`，具体变更如下：

1. **平台检测**：在模块作用域添加 `const isOpenHarmony = process.platform === ('openharmony' as NodeJS.Platform)`。

2. **辅助函数**：
   - `getOpenHarmonyTmpDir()` — 创建并返回用于 ripgrep I/O 文件的临时目录，
     使用 `CLAUDE_CODE_TMPDIR` 或 `os.tmpdir()` 作为基础路径。
   - `shellEscapeArg()` — 正确的单引号 Shell 转义，确保命令构建安全。

3. **文件 I/O 包装器**（`ripGrepRawViaFile`）：
   - 构建 Shell 命令，将 rg 的 stdout/stderr 重定向到唯一的临时文件
   - 通过 `/bin/sh -c` 启动，设置 `stdio: 'ignore'`（无需管道）
   - 进程关闭后，使用 `fs.readFileSync` 读取临时文件，清理文件，调用原始回调
   - 包含超时处理，支持 SIGTERM/SIGKILL 升级
   - 成功和错误路径均有正确的清理逻辑

4. **受影响的函数**（在 OpenHarmony 上均分发到文件 I/O）：

   | 函数                    | 使用者                   | 变更                              |
   |------------------------|--------------------------|-----------------------------------|
   | `ripGrepRaw`           | Grep 工具、`ripGrep()`   | 分发到 `ripGrepRawViaFile`        |
   | `ripGrepFileCount`     | 文件计数遥测             | 通过临时文件进行文件计数          |
   | `ripGrepStream`        | 交互式搜索               | 降级为文件方式（非流式）          |
   | `testRipgrepOnFirstUse`| 启动可用性测试           | 通过文件进行 `--version` 检查     |

### 代码流程（OpenHarmony）

```
Grep 工具调用
  → ripGrep(args, target, signal)
    → ripGrepRaw(args, target, signal, callback)
      → if (isOpenHarmony) ripGrepRawViaFile(rgPath, fullArgs, signal, callback)
        → spawn('/bin/sh', ['-c', 'rg ... > tmpfile 2> tmperr'])
        → on close: readFileSync(tmpfile) → callback(null, stdout, stderr)
        → 清理临时文件
```

### 权衡说明

- **流式搜索**：`ripGrepStream` 在 OpenHarmony 上失去流式能力
  （结果在 rg 退出后一次性交付，而非实时到达）。
  这影响交互式搜索的用户体验，但保证了正确性。
- **磁盘 I/O**：每次 ripgrep 调用都会写入和读取临时文件，
  增加少量磁盘开销。文件在读取后立即清理。
- **Shell 转义**：参数通过 Shell 转义传递，增加了一层薄的复杂性。
  `shellEscapeArg` 函数处理了所有边缘情况（单引号、特殊字符）。

### 验证结果

在 HarmonyOS 6.0 PC（HiShell 终端）上完成端到端测试：

- ✅ Grep `files_with_matches` 模式 — 在 3 个文件中找到 `helloWorld`
- ✅ Grep `content` 模式 — 显示匹配行及行号
- ✅ Glob 工具 — 正确列出所有 `.js` 文件
- ✅ `testRipgrepOnFirstUse` — 报告 ripgrep 可用

---

> **English version**: [openharmony-pipe-fix.md](openharmony-pipe-fix.md)
