# Non-Essential Network Traffic Toggle

Claude Code makes various network requests beyond the core LLM API calls.
For privacy-sensitive deployments (e.g. HarmonyOS PC, air-gapped networks, or
enterprise environments), all non-essential traffic can be disabled with a
single environment variable.

## Quick Start

```bash
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export CLAUDE_CODE_SKIP_ANTHROPIC_ACCOUNT=1
export CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK=1
export DISABLE_TELEMETRY=1
export CLAUDE_CODE_ATTRIBUTION_HEADER=0
```

All five are already configured in the provided `~/.claude/start-claude.sh` startup script (auto-installed by `npm postinstall`).

## What Gets Disabled

When `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is set, the following
network access points are suppressed:

| Category | Source File(s) | Mechanism |
|----------|---------------|-----------|
| **Analytics / Datadog** | `services/analytics/config.ts` | `isTelemetryDisabled()` → `isAnalyticsDisabled()` returns true |
| **1P Event Logging** | `services/analytics/firstPartyEventLogger.ts` | Gated by `isAnalyticsDisabled()` |
| **GrowthBook Feature Flags** | `services/analytics/growthbook.ts` | Gated by `isTelemetryDisabled()` |
| **Feedback Survey** | `services/analytics/config.ts` | `isFeedbackSurveyDisabled()` returns true |
| **OAuth Authentication** | `utils/auth.ts` | `isAnthropicAuthEnabled()` returns false; API key only (via `isAnthropicAccountDisabled()`) |
| **Auto-Update Version Check** | `utils/autoUpdater.ts` | `assertMinVersion()` returns early |
| **Release Notes Fetch** | `utils/releaseNotes.ts` | `fetchAndStoreChangelog()` returns early |
| **Settings Sync (Upload)** | `services/settingsSync/index.ts` | `uploadUserSettingsInBackground()` returns early (via `isAnthropicAccountDisabled()`) |
| **Settings Sync (Download)** | `services/settingsSync/index.ts` | `downloadUserSettings()` returns false (via `isAnthropicAccountDisabled()`) |
| **Transcript Sharing** | `components/FeedbackSurvey/submitTranscriptShare.ts` | `submitTranscriptShare()` returns `{ success: false }` (via `isAnthropicAccountDisabled()`) |
| **MCP Official Registry** | `services/mcp/officialRegistry.ts` | `prefetchOfficialMcpUrls()` returns early |
| **WebFetch Domain Check** | `tools/WebFetchTool/utils.ts` | `checkDomainBlocklist()` allows all domains locally (also has independent toggle `CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK`) |
| **Metrics Opt-Out Check** | `services/api/metricsOptOut.ts` | `checkMetricsEnabled()` returns `{ enabled: false }` (via `isAnthropicAccountDisabled()`) |
| **BigQuery Metrics Export** | `utils/telemetry/bigqueryExporter.ts` | `export()` returns success immediately |
| **Grove Notifications** | `services/api/grove.ts` | `fetchGroveNotification()` / `fetchGrovePaywall()` return early (via `isAnthropicAccountDisabled()`) |
| **Bootstrap API** | `services/api/bootstrap.ts` | `fetchBootstrapAPI()` returns null (via `isAnthropicAccountDisabled()`) |
| **Model Capabilities** | `utils/model/modelCapabilities.ts` | Remote capability fetch skipped |
| **Claude AI Limits** | `services/claudeAiLimits.ts` | Rate limit query skipped (via `isAnthropicAccountDisabled()`) |
| **Referral API** | `services/api/referral.ts` | Referral link query skipped (via `isAnthropicAccountDisabled()`) |
| **Overage Credit Grant** | `services/api/overageCreditGrant.ts` | Credit grant cache refresh skipped (via `isAnthropicAccountDisabled()`) |
| **Policy Limits** | `services/policyLimits/index.ts` | Enforces deny-on-miss for managed policies |
| **Trusted Device** | `bridge/trustedDevice.ts` | Device registration skipped |
| **Error Reporting** | `utils/log.ts` | Remote error reporting disabled |
| **Fast Mode** | `utils/fastMode.ts` | Network requests skipped |
| **Feedback UI** | `components/Feedback.tsx` | Feedback collection disabled |
| **Feedback Command** | `commands/feedback/index.ts` | Bug report command disabled |

## What Remains Active

Even with the toggle enabled, the following network access is preserved
because it is essential to Agent functionality:

| Category | Description |
|----------|-------------|
| **LLM API calls** | Core model inference via `ANTHROPIC_BASE_URL` |
| **Tool Search** | Embedded in LLM API requests, no separate network call |
| **WebFetch tool** | User-specified URLs (domain check bypassed, all domains allowed) |
| **MCP client** | User-configured MCP servers |
| **Bash/shell commands** | User-initiated network operations (curl, git clone, etc.) |

## Architecture

The toggle is implemented via a centralized privacy level system in
`src/utils/privacyLevel.ts`:

```text
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
        │
        ▼
┌─────────────────────┐
│  getPrivacyLevel()  │ → returns 'essential-traffic'
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

CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK=1  (independent)
    │
    ▼
 webfetch domain check only
```

### Parallel Toggles

Four parallel toggles provide selective control without enabling the
global `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`:

| Env Var | Scope | Effect |
|---------|-------|--------|
| `CLAUDE_CODE_SKIP_ANTHROPIC_ACCOUNT=1` | Claude account/auth | Disable OAuth, settings sync, transcript sharing, metrics opt-out, Grove, bootstrap, referral, credit grants, AI limits (9 access points) |
| `CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK=1` | WebFetch domain check | Skip `api.anthropic.com/api/web/domain_info` lookup; allow all domains locally |
| `DISABLE_TELEMETRY=1` | Telemetry only | Disable analytics/Datadog/1P events but keep other traffic active |
| `CLAUDE_CODE_ATTRIBUTION_HEADER=0` | Billing header | Disable `x-anthropic-billing-header` in API requests (recommended for third-party proxies) |

**Toggle design — all five are parallel and independent:**

```text
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC   (original Claude Code toggle)
CLAUDE_CODE_SKIP_ANTHROPIC_ACCOUNT         (new — account features, 9 access points)
CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK     (new — domain blocklist check)
DISABLE_TELEMETRY                          (original Claude Code toggle)
CLAUDE_CODE_ATTRIBUTION_HEADER             (billing header toggle)
```

Each can be set alone. In code, account-related files check
`isEssentialTrafficOnly() || isAnthropicAccountDisabled()` so either the
original global toggle or the new account toggle will suppress them.

## Files Modified

| File | Change |
|------|--------|
| `src/utils/privacyLevel.ts` | Added `isAnthropicAccountDisabled()` helper function |
| `src/utils/auth.ts` | `isAnthropicAccountDisabled()` guard on `isAnthropicAuthEnabled()` |
| `src/utils/autoUpdater.ts` | `isEssentialTrafficOnly()` guard on `assertMinVersion()` |
| `src/components/FeedbackSurvey/submitTranscriptShare.ts` | `isAnthropicAccountDisabled()` guard |
| `src/services/settingsSync/index.ts` | `isAnthropicAccountDisabled()` guard on upload/download/redownload |
| `src/tools/WebFetchTool/utils.ts` | `isEssentialTrafficOnly()` + `CLAUDE_CODE_SKIP_WEBFETCH_DOMAIN_CHECK` guard |
| `src/utils/telemetry/bigqueryExporter.ts` | `isEssentialTrafficOnly()` guard on `export()` |
| `src/services/api/metricsOptOut.ts` | `isAnthropicAccountDisabled()` guard on `checkMetricsEnabled()` |
| `src/services/api/grove.ts` | `isAnthropicAccountDisabled()` (replaced `isEssentialTrafficOnly()`) |
| `src/services/api/bootstrap.ts` | `isAnthropicAccountDisabled()` (replaced `isEssentialTrafficOnly()`) |
| `src/services/api/referral.ts` | `isAnthropicAccountDisabled()` (replaced `isEssentialTrafficOnly()`) |
| `src/services/api/overageCreditGrant.ts` | `isAnthropicAccountDisabled()` (replaced `isEssentialTrafficOnly()`) |
| `src/services/claudeAiLimits.ts` | `isAnthropicAccountDisabled()` (replaced `isEssentialTrafficOnly()`) |
| `src/services/mcp/officialRegistry.ts` | Already gated by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` |

Files unchanged (already had adequate guards):
- `src/utils/releaseNotes.ts`
- `src/utils/model/modelCapabilities.ts`
- `src/services/policyLimits/index.ts`
- `src/bridge/trustedDevice.ts`
- `src/utils/log.ts`
- `src/utils/fastMode.ts`
- `src/components/Feedback.tsx`
- `src/commands/feedback/index.ts`
- `src/services/analytics/config.ts` (via `isTelemetryDisabled()`)

## Reference

- Full network access analysis: [`docs/net/network-access-analysis.md`](../../docs/net/network-access-analysis.md) (project root)
- Privacy-safe branch: `privacy-safe` — contains the hardcoded approach (functions return early unconditionally)
- This implementation: runtime toggle via environment variable

---

*See also: [中文版](nonessential-traffic-toggle.cn.md)*
