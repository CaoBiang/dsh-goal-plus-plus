![Social preview](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/social-preview.png)

# Goal++

[![npm version](https://img.shields.io/npm/v/dsh-goal-plus-plus)](https://www.npmjs.com/package/dsh-goal-plus-plus)
[![GitHub stars](https://img.shields.io/github/stars/CaoBiang/dsh-goal-plus-plus?style=social)](https://github.com/CaoBiang/dsh-goal-plus-plus)
[![dshfind](https://dshfind.com/api/badge/CaoBiang/dsh-goal-plus-plus)](https://dshfind.com/en/plugins/CaoBiang/dsh-goal-plus-plus?ref=badge)

**Goal++ is a [DeepSeek Harness plugin](https://www.deepseek.com/harness/) for goal-oriented agent insight and management.**

Goal++ brings the current conversation's goal and its supporting context into one workspace. Open **Goal++** in a conversation or the right sidebar, then choose **Goal** (the default) or **Context**. The context tools build on the upstream [`dsh-context`](https://github.com/bowenliang123/dsh-context) project.

[`dsh-goal-plus-plus`](https://www.npmjs.com/package/dsh-goal-plus-plus) provides:
- **Goal subpage** — a live goal dashboard with token usage, current-round context, a per-round context chart, a state map, and round counters. Shows the objective, blocker, and expandable details, and distinguishes an unset goal from unavailable or unreadable data.
- **Context Dashboard** — the cross-session overview above Settings on the sidebar foot: KPI band, activity heatmap, aggregate composition ring, and filterable session cards that jump straight into any session.
- **Context subpage** — the existing dashboard for context stats, composition, trend, events, and messages.
- **Goal++ panel** — both subpages in the right sidebar (dsh 0.1.5-rc.1+; verified through 0.1.6-alpha.2): pick **Goal++** on the sidebar's guide page.
- **`/context` command** — the slash command shows the context model for current context composition and recent context evolution.

## Install / Update

Install [`dsh-goal-plus-plus`](https://www.npmjs.com/package/dsh-goal-plus-plus) plugin from [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh):

```sh
dsh plugin --profile web add dsh-goal-plus-plus
```

Or update the `dsh-goal-plus-plus` plugin:

```sh
dsh plugin --profile web update dsh-goal-plus-plus@latest
```

Then start the web UI with `dsh web`. No build step, no restart.

## Local development helper

From the repository root, run `.\goalpp.ps1` to open an interactive menu. It can build and install the current checkout into the local `web` profile, or build a distributable tarball under `dist/`.

For non-interactive use:

```powershell
.\goalpp.ps1 -Action Install
.\goalpp.ps1 -Action Package
```

## Use it

Track the goal first, then inspect the context supporting it:

| Where | What you get |
| --- | --- |
| **Context Dashboard** | Every session at a glance: usage, cost, cache hit, daily activity, and per-session context profiles — filtered by range, day, group, or search, one click to jump in. |
| **Goal++ → Goal** | The current conversation's objective, recorded status, block reason, rounds, and timestamps; updates with the host. |
| **Goal++ → Context** | The full dashboard: stats, composition, per-request trend, events, file activity, and the agent network — in every session. |
| **`/context` command** | A centered modal with the same composition and context browser, without leaving the chat. |
| **Settings → Plugin configuration** | Per-user defaults: trend granularity & mode, File Activity sort. |

Goal token usage includes provider-reported input, cache read/write, and output for requests explicitly attributed to the current goal, including retries. It excludes unrelated manual turns and previous goals. The context chart shows the estimated context composition at the final request of each retained round; hovering a bar shows its details in a tooltip. Total goal usage remains cumulative when older chart records are trimmed. No step, adaptive-scale, or delta controls are shown on Goal.

**File changes** shows a compact file count and total added/removed lines. Select **View** to open the file list in a dialog, with 10 files per page. Counts cover retained successful goal-owned file operations; partial retention is marked explicitly.

The Goal card provides **Pause / Start** controls. **Active** describes the recorded lifecycle state, not whether automatic continuation is currently running. Missing goal capability leaves Context available. See [compatibility](docs/compatibility.md) for supported harness releases.

### Auto retry

On **Goal++ → Goal → Current conversation goal**, enable **Auto retry** to show its settings and live status below the objective. Set the fixed interval and maximum attempts, then select **Save**. Turning it off collapses this section. Defaults: **off**, **30 seconds**, **3 attempts**. Enable before a goal round starts; a round whose attribution was not observed is never recovered retroactively.

Recovery runs in the host even when the browser closes. It resumes the same live goal only after native request retries exhaust on a confirmed temporary model failure (transport, timeout, server, empty response or temporary rate limit). Authentication, quota, unknown/tool errors, storage failures and exhausted goal rounds do not trigger recovery. The waiting status shows a countdown and **Cancel retry and turn off** action. “Execution resumed” confirms the resume operation, not the success of the next model request.

Attempts count actual plugin resume calls, not native retries, and do not reset after success or toggling the switch. Pause, native Stop, goal edits/replacement/manual resume/completion, new activity, disabling retry or unloading the plugin cancel pending recovery. Settings and counts are process-local; restarting the host never resumes an old retry. A failed recovery is shown explicitly and stops that flow.

Build an installable package with `.\goalpp.ps1 -Action Package`, then install the resulting tarball with `dsh plugin --profile web add ./dist/dsh-goal-plus-plus-0.54.2.tgz`.

The goal header shows its lifecycle state with a status light. Goal metadata is available from the adjacent info icon. Current context and total token usage use responsive rings with hover details; wide panels place them beside the per-round chart in a 1:1:2 layout.

## 🗂️ The Context Dashboard

Click **Context Dashboard / 上下文仪表盘** at the bottom-left of the sidebar, right above **Settings**:

![Context Dashboard](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-dashboard.png)

| Section | The question it answers |
| --- | --- |
| **KPI band** | How much am I using — sessions, billed tokens, estimated cost, and cache-hit rate over the picked range (7d / 30d / all). |
| **Activity heatmap** | When do I actually work — the last 8 weeks of daily billed tokens; click a day to filter the sessions that were active on it. |
| **Context Composition** | Where the context windows went, summed over the range's sessions. |
| **Session cards** | Each session's profile: composition ring, billed tokens, turns, cost, and its workspace-group / project breadcrumb — sorted by recency, tokens, or context size, searchable, grouped by workspace. A card click opens the session. |


## 📊 The Context tab

Open any session, click **Goal++**, then choose **Context / 上下文**:

![Context panel overview](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-overview.png)

| Card | The question it answers |
| --- | --- |
| **Context Stats** | Turns, steps, human inputs, live tool calls, the session's cache-hit rate — plus a cost estimated from the models.dev list prices (hover the `?` for per-1M rates; DeepSeek peak/off-peak aware). |
| **Token Stats** | Where the billed tokens went — the same total as the chat stats line under the composer, split by composition (system, tools, messages…) with the provider-exact output closing the ring. |
| **Timing Stats** | How active time split across model calls, tool runs, and overhead. |
| **Current Context** | What's in the window *right now*. |
| **Context Trend** | Every request's size — and its story. |
| **Context Browser** | What any request was *actually* assembled from. |
| **Context Events** | When and why the window changed. |
| **File Activity** | What the agent *did* to your files. |
| **Agent Network** | The whole agent family, live. |

The headline occupancy and composition read the **same official token-meter projections as the chat composer's context ring** (`contextPressure` / `contextBreakdown`), so the figures always match what the ring tells you.

### Context Stats

#### Token Stats and Timing Stats
![Token_Stats_and_Timing_Stats](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/token-stats-and-timing-stats.png)

#### Context Stats
![Context_Stats](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-stats.png)


### 🧱 Current Context — what's in the context window now

![Current Context card](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/current-context.png)

A six-color stacked bar against the model's full window (hatching = free headroom): system prompt, tool schemas, user messages, injected context, assistant replies, tool results — each with its ≈token figure and share. When a conversation starts degrading, this is where you see *which part* is responsible.

### 📈 Context Trend — how the context grew and evolved by turn or steps

![Context Trend with the step brief](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-trend.png)

One stacked bar per model request — finer than per-message — so you watch the window grow turn by turn:

- **✨ Step brief** — three plain-language rows under the chart: **User** recalls the message that opened the turn, **In** lists what newly entered (usually the previous tool results), **Response** shows the reply and/or tools called. Click a row to open that exact message in the Context browser.
- **✂ marks the events** — compactions and prunes are pinned to the bar where they happened, so the drops explain themselves.
- **Read it your way** — **Step / Turn** granularity, **Total** (cumulative makeup) or **Delta** (each request's signed change), and sideways scrolling through the whole session. In Delta mode, growth piles up above the baseline and a compaction dives below it:

![Context Trend in Delta mode](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/history-delta.png)

- **Hover & pin** — scrub for an instant tooltip; click to pin the full breakdown, with provider-reported **Actual Prompt / Output / Cache** next to the estimates.
- **Live linkage** — hovering a bar previews that step's assembled context in the Context browser beside the chart; leaving the chart returns to your own pick.

### 🧭 Context Browser — open the box of any request

Pick **Live (next request)** or any retained step, and browse what that request was assembled from: seven collapsible categories expand into one row per element with its token price, and every element expands again into its **actual content** — the system prompt, each tool's JSON schema, message text, reasoning, tool arguments, and tool outputs. Skill content (the available-skills catalog, `/skill` invocations, and `skill`-tool loads) has its own **Skill Injections** category, so a stealthy skill's context footprint can't hide inside the injected-context and tool-result buckets.

- **Who provides each tool** — every tool-schema row carries a best-effort source chip: `tool-*` first-party packages, `dsh-*` capability packages, `mcp:<server>` proxies, or the exact plugin watched live from `tools.register()`. Sort by **size / name**, and filter every category by its own searchable fields:

![Tool schemas with source chips, filter, and sort](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-browser-tools.png)

- **Tool results open into the full call** — the tool name and arguments with its **OK/error** status, the result body with line count and a **Raw / Markdown** toggle:

![A tool result expanded with Raw/Markdown toggle](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-browser-tool-result.png)

- **Image payloads render as cards** — thumbnails with name, dimensions, stored size, and the official DeepSeek image-token estimate (the dsh multimodal pipeline, e.g. `read_image` results and image attachments):

![An image payload rendered as a thumbnail card](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-browser-images.png)

- **Diff against the previous turn** — signed delta badges per category (`+N` items, `±Nk` tokens) tell you what a turn added or reclaimed at one glance. Steps older than a compaction are reconstructed from the removed-message archive — and the card says so when a step's makeup is only approximate.

### ⚡ Context Events — when and why the window changed

![Context Events with a compaction](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-events.png)

Every injection, compaction, prune, model switch, and plan-mode toggle — labeled with its producer (instruction file, plugin id, skill name), its net token delta (compactions show what they reclaimed), turn/step, and time. The **Inject / Compact / Prune / Switch / Mode** chips filter the log by kind, each carrying its whole-session event tally.

### 📁 File Activity — what the agent did to your files

![File Activity](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/file-activity.png)

One row per touched file — read, written, or searched — aggregated up to whichever step you pick on the trend chart:

- **Per-purpose counts** with header chips doubling as filters (**Read / Written / Searched / Images**) and a path search box.
- **Line deltas** — every `edit`/`write` contributes its estimated `+added / −removed` footprint, per file and summed.
- **Every mode counts** — native tools, the Minimal preset's `str_replace_editor`, and the nested calls inside PTC `run_code` programs are all folded into per-tool rows.
- **Searches land on real files** — matched files get their own ops rows with hit counts.
- **Click a row** to expand its full operation log — every op jumps straight to the exact tool result in the Context browser.
- **Click a file name** to open its preview in the right Sidebar (dsh 0.1.5-rc.1+), exactly as the built-in Files sidebar does — the same viewer, the same tab-per-file behavior. On a harness without that column the name opens on your system as before.

### 🕸 Agent Network — the family portrait

![Agent Network with two subagents](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/agent-network.png)

The current agent, its parents, and every subagent — one node per agent, colored edges for the lineage, multi-level delegation on one map. Each ring is that session's composition scaled to its window occupancy; hover for tokens, requests, billing, and active time; click to jump into that session's own Context tab. Running agents breathe with a green pulse.

## ⌨️ `/context` command

Type `/context` (or pick it from the `/` menu) and press Enter:

![Slash menu with the context command](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-command-entry.png)

A centered dialog opens with the **Current Composition** card and the **Context browser** — the same composition bar, per-step picker, and `vs previous turn` diff badges as the tab:

![The /context modal](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/context-command.png)

## ⚙️ Settings

In **Settings → Plugins → Plugin configuration**, the **Context** card holds this plugin's per-user preferences — default trend granularity (Step/Turn), default trend mode (Total/Delta), and the File Activity default sort. In-chart and in-card toggles stay per-view and never overwrite the stored preference.

![The Context settings card](https://raw.githubusercontent.com/CaoBiang/dsh-goal-plus-plus/main/docs/settings.png)

## Good to know

- **Estimates vs actuals** — category figures use dsh's own fixed-density heuristic (the same one as its built-in token meter); the pinned trend details show provider-reported actuals next to them, and the Token card pairs its ≈-estimated composition shares with the provider-exact billed total.
- **Compatibility** — works on `@deepseek-ai/dsh` **0.1.2-rc.1+**, with the highest verified baseline `0.1.6-alpha.2`, across the V0 (0.1.2-rc.x), V2 (0.1.3-alpha.x), and V3 (0.1.5-alpha.x+) session-log generations. The per-release matrix and how it is verified: [docs/compatibility.md](docs/compatibility.md).
- **I18n** — UI in English and 简体中文.

## Like it?

If Goal++ helped you understand what your agent is carrying around, a ⭐ on [GitHub](https://github.com/CaoBiang/dsh-goal-plus-plus) is much appreciated — and issues/PRs are welcome!

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
