# 非必要网络流量开关

Claude Code 除核心 LLM API 调用外，还会发起各类网络请求。
对于隐私敏感的部署场景（如 HarmonyOS PC、隔离网络或企业环境），
可通过单个环境变量禁用所有非必要流量。

## 快速开始

```bash
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export CLAUDE_CODE_SKIP_ANTHROPIC_ACCOUNT=1
export CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK=1
export DISABLE_TELEMETRY=1
export CLAUDE_CODE_ATTRIBUTION_HEADER=0
```

五个开关均已在 `~/.claude/start-claude.sh` 启动脚本（由 `npm postinstall` 自动安装）中默认配置。

## 被禁用的内容

设置 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 后，以下网络访问点将被抑制：

| 类别 | 源文件 | 机制 |
|------|--------|------|
| **分析 / Datadog** | `services/analytics/config.ts` | `isTelemetryDisabled()` → `isAnalyticsDisabled()` 返回 true |
| **第一方事件日志** | `services/analytics/firstPartyEventLogger.ts` | 由 `isAnalyticsDisabled()` 门控 |
| **GrowthBook 功能标志** | `services/analytics/growthbook.ts` | 由 `isTelemetryDisabled()` 门控 |
| **反馈调查** | `services/analytics/config.ts` | `isFeedbackSurveyDisabled()` 返回 true |
| **OAuth 认证** | `utils/auth.ts` | `isAnthropicAuthEnabled()` 返回 false；仅使用 API Key |
| **自动更新版本检查** | `utils/autoUpdater.ts` | `assertMinVersion()` 提前返回 |
| **更新日志获取** | `utils/releaseNotes.ts` | `fetchAndStoreChangelog()` 提前返回 |
| **设置同步（上传）** | `services/settingsSync/index.ts` | `uploadUserSettingsInBackground()` 提前返回 |
| **设置同步（下载）** | `services/settingsSync/index.ts` | `downloadUserSettings()` 返回 false |
| **会话记录分享** | `components/FeedbackSurvey/submitTranscriptShare.ts` | `submitTranscriptShare()` 返回 `{ success: false }` |
| **MCP 官方注册表** | `services/mcp/officialRegistry.ts` | `prefetchOfficialMcpUrls()` 提前返回 |
| **WebFetch 域名检查** | `tools/WebFetchTool/utils.ts` | `checkDomainBlocklist()` 本地允许所有域名（也有独立开关 `CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK`） |
| **指标 Opt-Out 检查** | `services/api/metricsOptOut.ts` | `checkMetricsEnabled()` 返回 `{ enabled: false }` |
| **BigQuery 指标导出** | `utils/telemetry/bigqueryExporter.ts` | `export()` 立即返回成功 |
| **Grove 通知** | `services/api/grove.ts` | `fetchGroveNotification()` / `fetchGrovePaywall()` 提前返回 |
| **Bootstrap API** | `services/api/bootstrap.ts` | `fetchBootstrapAPI()` 返回 null |
| **模型能力查询** | `utils/model/modelCapabilities.ts` | 远程能力获取跳过 |
| **Claude AI 限制** | `services/claudeAiLimits.ts` | 速率限制查询跳过 |
| **推荐链接 API** | `services/api/referral.ts` | 推荐链接查询跳过 |
| **超额信用授权** | `services/api/overageCreditGrant.ts` | 信用授权缓存刷新跳过 |
| **策略限制** | `services/policyLimits/index.ts` | 托管策略执行 deny-on-miss |
| **可信设备** | `bridge/trustedDevice.ts` | 设备注册跳过 |
| **错误上报** | `utils/log.ts` | 远程错误上报禁用 |
| **快速模式** | `utils/fastMode.ts` | 网络请求跳过 |
| **反馈 UI** | `components/Feedback.tsx` | 反馈收集禁用 |
| **反馈命令** | `commands/feedback/index.ts` | Bug 报告命令禁用 |

## 保持活跃的内容

即使开启该开关，以下网络访问仍被保留，因为它们是 Agent 功能所必需的：

| 类别 | 描述 |
|------|------|
| **LLM API 调用** | 通过 `ANTHROPIC_BASE_URL` 的核心模型推理 |
| **工具搜索** | 嵌入在 LLM API 请求中，无独立网络调用 |
| **WebFetch 工具** | 用户指定的 URL（域名检查被跳过，所有域名均允许） |
| **MCP 客户端** | 用户配置的 MCP 服务器 |
| **Bash/Shell 命令** | 用户发起的网络操作（curl、git clone 等） |

## 架构

该开关通过 `src/utils/privacyLevel.ts` 中的集中式隐私级别系统实现：

```text
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
        │
        ▼
┌─────────────────────┐
│  getPrivacyLevel()  │ → 返回 'essential-traffic'
└─────────┬───────────┘
          │
    ┌─────┴──────────┐
    ▼                ▼
isEssentialTraffic  isTelemetryDisabled
Only = true          = true
    │                │
    ▼                ▼
 auth.ts           analytics/config.ts
 autoUpdater.ts    datadog.ts
 settingsSync      firstPartyEventLogger.ts
 transcript        growthbook.ts
 webfetch
 bigquery
 metricsOptOut
 grove
 bootstrap
 modelCapabilities
 claudeAiLimits
 referral
 overageCreditGrant
 policyLimits
 trustedDevice
 log.ts
 fastMode
 Feedback.tsx

CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK=1  (独立)
    │
    ▼
 仅 webfetch 域名检查
```

### 并列开关

四个并列开关提供选择性控制，无需启用全局 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`：

| 环境变量 | 作用范围 | 效果 |
|----------|----------|------|
| `CLAUDE_CODE_SKIP_ANTHROPIC_ACCOUNT=1` | Claude 账号/认证 | 禁用 OAuth、设置同步、会话记录分享、指标检查、Grove、Bootstrap、推荐、信用授权、AI 限制（9 个访问点） |
| `CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK=1` | WebFetch 域名检查 | 跳过 `api.anthropic.com/api/web/domain_info` 查询；本地允许所有域名 |
| `DISABLE_TELEMETRY=1` | 仅遥测 | 禁用分析/Datadog/第一方事件，但保留其他流量 |
| `CLAUDE_CODE_ATTRIBUTION_HEADER=0` | 计费标头 | 禁用 API 请求中的 `x-anthropic-billing-header`（推荐用于第三方代理） |

**开关设计——五个开关并列且独立：**

```text
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC   （原始 Claude Code 开关）
CLAUDE_CODE_SKIP_ANTHROPIC_ACCOUNT         （新增——账号功能，9 个访问点）
CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK     （新增——域名黑名单检查）
DISABLE_TELEMETRY                          （原始 Claude Code 开关）
CLAUDE_CODE_ATTRIBUTION_HEADER             （计费标头开关）
```

每个均可单独设置。在代码中，账号相关文件检查
`isEssentialTrafficOnly() || isAnthropicAccountDisabled()`，因此原始全局开关或新增账号开关均可抑制它们。

## 修改的文件

| 文件 | 变更 |
|------|------|
| `src/utils/privacyLevel.ts` | 新增 `isAnthropicAccountDisabled()` 辅助函数 |
| `src/utils/auth.ts` | `isAnthropicAccountDisabled()` 守卫 `isAnthropicAuthEnabled()` |
| `src/utils/autoUpdater.ts` | `isEssentialTrafficOnly()` 守卫 `assertMinVersion()` |
| `src/components/FeedbackSurvey/submitTranscriptShare.ts` | `isAnthropicAccountDisabled()` 守卫 |
| `src/services/settingsSync/index.ts` | `isAnthropicAccountDisabled()` 守卫 upload/download/redownload |
| `src/tools/WebFetchTool/utils.ts` | `isEssentialTrafficOnly()` + `CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK` 守卫 |
| `src/utils/telemetry/bigqueryExporter.ts` | `isEssentialTrafficOnly()` 守卫 `export()` |
| `src/services/api/metricsOptOut.ts` | `isAnthropicAccountDisabled()` 守卫 `checkMetricsEnabled()` |
| `src/services/api/grove.ts` | `isAnthropicAccountDisabled()`（替换 `isEssentialTrafficOnly()`） |
| `src/services/api/bootstrap.ts` | `isAnthropicAccountDisabled()`（替换 `isEssentialTrafficOnly()`） |
| `src/services/api/referral.ts` | `isAnthropicAccountDisabled()`（替换 `isEssentialTrafficOnly()`） |
| `src/services/api/overageCreditGrant.ts` | `isAnthropicAccountDisabled()`（替换 `isEssentialTrafficOnly()`） |
| `src/services/claudeAiLimits.ts` | `isAnthropicAccountDisabled()`（替换 `isEssentialTrafficOnly()`） |
| `src/services/mcp/officialRegistry.ts` | 已由 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 门控 |

未修改的文件（已有足够的守卫）：
- `src/utils/releaseNotes.ts`
- `src/utils/model/modelCapabilities.ts`
- `src/services/policyLimits/index.ts`
- `src/bridge/trustedDevice.ts`
- `src/utils/log.ts`
- `src/utils/fastMode.ts`
- `src/components/Feedback.tsx`
- `src/commands/feedback/index.ts`
- `src/services/analytics/config.ts`（通过 `isTelemetryDisabled()`）

## 参考

- 完整网络访问分析：[`docs/net/network-access-analysis.md`](../../docs/net/network-access-analysis.md)（项目根目录）
- privacy-safe 分支：`privacy-safe` — 包含硬编码方案（函数无条件提前返回）
- 本实现：通过环境变量的运行时开关

---

*See also: [English version](nonessential-traffic-toggle.md)*
