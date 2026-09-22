# Compatibility

dsh-goal-plus-plus declares per-release compatibility with `@deepseek-ai/dsh` in its package manifest (`dsh.compatibility.dshReleases`). This page records what is actually verified for each declared release, and how.

Last verified: **2026-09-22** (plugin `dsh-goal-plus-plus@0.54.2` source tree).

## Supported dsh releases

| dsh release | Session log | Declared | Automated seam matrix | Disposable-profile install / uninstall |
| --- | --- | --- | --- | --- |
| `0.1.2-rc.1` | V0 | compatible | ✅ baseline `v0.1.2-rc.1` | ✅ install OK → 1 composed row → uninstall OK → 0 rows (verified 2026-09-05) |
| `0.1.3-alpha.2` | V2 | compatible | ✅ baseline `v0.1.3-alpha.2` | ✅ install OK → 1 composed row → uninstall OK → 0 rows (verified 2026-09-09) |
| `0.1.5-rc.1` | V3 | compatible | ✅ baseline `v0.1.5-rc.1` | ✅ install OK → 1 composed row → uninstall OK → 0 rows (verified 2026-09-10) |
| `0.1.6-alpha.2` | V3 | compatible | ✅ baseline `v0.1.6-alpha.2` | pending disposable-profile verification |

The automated seam matrix runs for every row on every `pnpm test`. The disposable-profile column is a manual, per-release check: each release's CLI was installed from npm into a temporary `DSH_HOME` (the real `~/.dsh` is never touched) — `0.1.2-rc.1` on 2026-09-05, `0.1.3-alpha.2` on 2026-09-09, and `0.1.5-rc.1` on 2026-09-10, against the official npm registry (a stale mirror can 404 the harness's own dependency closure before the plugin is even considered).

Releases older than `0.1.2-rc.1` — the `0.1.1` line and the `0.1.2-alpha.*` previews — were supported and verified through `dsh-goal-plus-plus@0.41.x` and are no longer in the support matrix.

## Goal observation

The **Goal++** conversation tab and optional sidebar panel contain **Goal** and **Context** subpages. Goal is the default; reply context jumps select Context directly, and `/context` still opens the dedicated modal. The existing conversation view ID and sidebar kind are retained so saved navigation remains valid.

The Goal subpage subscribes to the standard `goal` projection without introducing a host service, polling, or a runtime dependency on the goal package. The supported baseline sources all expose the same nested `GoalProjection` shape: `goal` (identity, revision, objective, phase, optional blocker, round cap), `roundsStarted`, `createdAt`, and `updatedAt`. A source probe in the baseline matrix checks these fields against each actual harness tag.

An absent value (`undefined`) means capability unavailable or still synchronizing; `null` means no current goal (before creation or after clearing). Malformed payloads show an unavailable-data notice and recover on a valid pushed update. Unknown numeric metadata is displayed as a dash. The durable projection does not carry process-local activation: **Active** must not be interpreted as proof that automatic continuation is running. Round counts are not completion percentages. Context remains usable in all these cases.

The goal header displays the current lifecycle phase and exposes snapshot metadata through an info popup. It does not infer transition history or completion percentages.

The current-goal card offers **Pause / Start** through the optional native `remote.goals` namespace, passing the displayed goal ID and revision to the harness's compare-and-swap guard. Pause delegates to the native driver; on the newest supported baseline a host-initiated pause also cancels the running turn. Start resumes a paused or blocked goal, or rearms an active goal, while its round budget has capacity. Completed goals have no execution controls.

On `0.1.5-rc.1+`, live `goals.get` reads and activation/reset events select the appropriate button; durable Active alone never proves that continuation is armed. The older supported lines expose mutation verbs but no live activation read, so an active goal offers both Pause and Start without guessing its activation. The host rejects invalid transitions. Missing capabilities or revision metadata disable controls, and failed, malformed, or timed-out requests show a retryable notice. State reads never automatically retry a mutation.

## Baseline gate

The declared floor is enforced at runtime, not only documented. At startup the host resolves the running harness's version — first from the module tree the plugin is bound to, then from the `$DSH_HOME/profiles/node_modules` mirror — and compares it against `0.1.2-rc.1` (channel order: release > rc > beta > alpha):

- **Below the floor** — fallback projection units that fold nothing and serve zeroed data: the Context tab keeps its (empty) cards while a modal names both versions and urges the update.
- **At or above the floor** — the real projection units.
- **Undetectable or unparseable** — **fails open** into the real units, so a probe misfire never blanks a working deployment.

The mirror reflects whichever installation last booted a CLI profile, which need not be the running one (a packaged desktop client never refreshes it), so it never outranks the running module tree. Implementation: `src/host/version.ts`, `src/host/fallback.ts`, `src/shared/version.ts`.

### Migrating from `dsh-context`

`dsh-context` and `dsh-goal-plus-plus` are alternative owners of the `contextTimeline` projection. Do not load both in one profile: dsh rejects the duplicate key when their persisted-state versions differ. Remove `dsh-context` from the profile before enabling Goal++.

## Session-log generations

The supported range spans three durable-log generations, and the plugin folds all of them from one shape-driven code path (`src/host/logShapes.ts`):

| Seam | V0 (`0.1.2-rc.x`) | V2 (`0.1.3-alpha.x`) | V3 (`0.1.5-alpha.x+`, verified through `0.1.6-alpha.2`) |
| --- | --- | --- | --- |
| System prompt | `request/header.header.system` | same as V0 | `system/message` surface node |
| First token | `assistant/chunk` events | embedded `assistant/message.data.stream` (also `assistant/attempt.data.stream`) | same as V2 |
| Replacement endpoints | `{ start, end }` | same as V0 | `{ startSeq, endSeq }` |
| Nested PTC dispatch | `tool/code-dispatch` | same as V0 | `tool/ptc-dispatch` |

The fold never branches on a detected harness version: a log carries exactly one generation, and the spellings are mutually exclusive. The version probe is best-effort — it reports the module tree the embedding shell resolves plugin imports to, which a packaged client may redirect — so it decides which units register and nothing more.

## Web client seams

The browser half rides generation-specific seats, each reached through an optional seam so an older line simply goes without the capability. The V3 line moved two of them, and the newest release moved one back:

| Seam | V3 before `0.1.5-alpha.2` | `0.1.5-alpha.2` | `0.1.5-rc.1+` |
| --- | --- | --- | --- |
| Conversation panel root | flat `conversation` slot | keyed `main` panel's `main.conversation` (the plugin's `conversation.view` seat is unchanged and hangs under it) | same as `0.1.5-alpha.2` |
| Right Sidebar guide entry | glyph + title + required description line | glyph + title (the description line was dropped) | glyph + title + optional description line (restored; the plugin contributes it) |

The plugin contributes to whichever face the running line serves: the guide capsule carries `order`, `title`, and `icon` on every generation and adds the `description` thunk, which `0.1.5-alpha.1` required, `0.1.5-alpha.2` ignored, and `0.1.5-rc.1+` renders. The `guideEntry` probe in `tests/baselines.ts` pins the fields of the newest supported generation.

The File Activity card's file-name affordance is the same optional-column story: on a line with the right Sidebar it opens the file's preview tab through `ctx.sidebarRight.openResource` (the built-in Files sidebar's own path), building the `dsh-resource://file/…` address with the harness's browser-safe `fileAddressFor` (inlined by the client bundle, exactly as the Sidebar's own file types inline it). On an older line the preview face is absent (or refuses the address), and the name keeps its original system-open behavior; the `sidebar.nav` probe pins the navigation face's spelling.

The Context Dashboard's DeepSeek balance capsule is an all-optional stack, so it arms nowhere it cannot: the host reaches the `settings` and `credentials` services only inside a deferred `ctx.inject` (and re-reads them per request, so a key added while the host runs is picked up on the next open), mounts `/api/dsh-goal-plus-plus/balance` through the same Connection exact-route registry as the detail and backfill routes, and the outbound `/user/balance` read carries the key only inside the host process. The capsule appears only on a live, well-formed answer; a deployment whose llm-deepseek provider is not composed (no `llm-deepseek` settings section), whose credentials service cannot resolve the key, whose connection service lacks the exact-route registry, or whose platform read fails (network, non-2xx, malformed payload, a third-party endpoint that does not serve the balance path) answers a typed `null` and the browser renders nothing — no pill, no spinner, no error state.

## What each check means

Goal auto retry uses a deferred `agents` / `goals` / `sessions` / `connection` injection. All four supported baselines expose the observed final-request-error waterfall, goal CAS resume, scoped durability checkpoint and anchored popup positioning. Incompatible or absent services leave retry unavailable while Context remains usable. Recovery requires an explicitly attributed goal round, a normalized temporary request error confirmed by both `agent/error` and durable `turn/end`, and an idle, empty, disarmed agent. Native request retry always runs first. A reversible per-agent `cancel` wrapper observes idle native Stop calls, which otherwise emit no cancellation event; if that wrapper cannot be installed, enabling retry fails closed. Cancellation during either `whenIdle()` or `sessions.flush()` invalidates recovery before the final synchronous CAS resume. Browser polling only reads host state and never drives recovery.

The retry tests cover native-retry priority, terminal errors, duplicate notifications, attempt limits, timer cancellation, stale identity/revision, queue activity and failures during durability/resume. The real-source matrix additionally checks these seams and Modal on each supported tag. These checks do not replace a live provider/network outage exercise.

- **Automated seam matrix** — part of this repository's `pnpm test` (the `compat` vitest project). For every baseline tag it stages the harness's REAL sources at that tag, boots the plugin's built host entry into that tag's actual `SessionProjectionRegistry` on the cordis release the line vendors, and probes the tag's client seams (slots, finalized-nodes seat, image loader, history face/envelope, markdown chrome, platform module table, that generation's durable-event vocabulary, the right Sidebar tab seam, its guide-entry contract and its resource-navigation face where the line ships one, settings namespace). Definitions live in `tests/baselines.ts`; the release workflow fetches the pinned baseline tags before testing. Optional seams are asserted BOTH ways: the right Sidebar tab registers only on the generation that serves it, and every older line is proven to have no such service, so the plugin's deferred registration stays inert instead of pending.
- **Statistics against the harness's own folds** — the plugin's figures are differentially checked against the harness's OWN projection values (`sessionStats`, `contextBreakdown`, `contextPressure`, `tokenUsage`) over real V0 and V3 session logs: system/tools/message tokens, per-request counts, turns/steps, TTFT, generation, tool time, and every billed cost bucket match exactly, and a migrated V0→V3 log reproduces the same figures as its V0 original.
- **Disposable-profile install / uninstall** — for each release, that exact `dsh` CLI version was installed from npm into a temporary `DSH_HOME` (the real `~/.dsh` is never touched), then:
  1. `dsh plugin --profile <disposable> add dsh-goal-plus-plus` — install OK;
  2. `dsh --profile <disposable> --dump-config` — the bundle's `- id: dsh-goal-plus-plus` row composes into the effective configuration (exactly 1 row);
  3. `dsh plugin --profile <disposable> remove dsh-goal-plus-plus` — uninstall OK, dump-config back to 0 rows.

## Scope

These checks prove source-level seam compatibility, statistical parity with the harness's own folds, and disposable-profile install/start-composition/uninstall per release. They are not a claim of full web-app runtime acceptance on a real Profile — visible UI behavior depends on the harness generation and the browser half, which the seam matrix approximates from the tag's sources.

## Upgrading from an older plugin build

The skill-injection category (issue #66) bumps the timeline projection's `stateVersion` (18 → 19): skill content — the `<available_skills>` catalog digest, a user-explicit `/name` invocation's instructions message, and the content a `skill`-tool load returns — now folds into its own `skill` composition bucket instead of `inject`/`tool`. The re-bucketing changes the fold's per-category sums, so on upgrade every cached per-session row is invalidated and re-folded from the durable log, which rebuilds them under the new categories. The bump orphans the `contextTimeline` key for idle sessions, which have no refresh channel until they go live again — such a session re-folds when its log receives its next event. New sessions are exact from their first event.

The Agent network card covers the orphaned relatives without waiting for a visit: a session listed without a `contextTimeline` row (composition absent, occupancy only) fetches its slim head from the plugin's `/api/dsh-goal-plus-plus/detail` fetch route (mounted through Connection's exact-route registry, behind the same authenticated `/api` fence), which folds the durable log on demand — the node's ring renders the full composition the first time the card opens. The same backfill serves sessions whose cache predates the plugin's installation entirely. Where the route is unavailable (the baseline gate, a connection service without the exact-route registry), the card degrades to the pressure-only occupancy ring as before.

The session cards' last-user-message preview (`lastUser` on the `contextTimeline` head) bumps the timeline projection's `stateVersion` (19 → 20): a stale row can never gain the field while its session is idle (it only lands when a user message folds), so on upgrade every cached timeline row is invalidated and refolded from the durable log. To keep the bump from orphaning idle sessions' rows, the warm-up (`src/host/backfill.ts`) probes BOTH dashboard rows — `contextActivity` AND `contextTimeline` — and cold-refolds every session whose either row is missing or version-stale, so previews (and every other head figure) are exact for the whole session list the first time the dashboard opens after the upgrade. A deployment without the cold-path services — or whose client cannot mount the warm-up's trigger route — degrades to the per-session refold on the session's next activity, the same as pre-warm-up upgrades.

The Context Dashboard (the sidebar-foot panel) reads its `contextActivity` projection — a per-day ledger of billed tokens and completed requests, `stateVersion` 1 — off every session-list row's projection column. A new key is purely additive: no existing cached row is invalidated, but sessions folded before the unit existed (and sessions that predate the plugin entirely, whose `contextTimeline`/`contextHeaders` rows are missing too) have nothing to serve until they next go live. The plugin therefore runs a one-pass warm-up on demand (`src/host/backfill.ts`): the dashboard is the rows' only reader, so its panel POSTs the plugin's `/api/dsh-goal-plus-plus/backfill` fetch route (the same authenticated `/api` fence as the detail route) the first time it opens, and only then does the host walk the corpus — for every stored session missing the row it cold-reads the durable log once through the projection cache's own cold-read ladder (`coldSnapshot`), which seeds each unit from its cached rows, folds the remainder, and writes the refreshed checkpoint back. The pass runs once per host process (later opens and later POSTs are no-ops); live sessions are skipped (they fold for themselves); a legacy log the running harness refuses to migrate (e.g. a v0 artifact carrying events outside the released migration surface) is permanent — its per-session detail logs at debug and the pass ends with one summary info line, so an unmigratable corpus costs one line per dashboard-open process, not one warn per session per boot; and a deployment whose client never opens the dashboard never cold-reads a thing. A deployment without the sessionQuery/sessionProjectionCache/sessionPersistence/sessions services — or whose connection service lacks the exact-route registry — simply never arms the pass (such a client could not open the dashboard to read the rows anyway).

To force a full refold of an existing session sooner, delete its cached projection row — it is a derived cache and is rebuilt from the durable log:

```bash
rm ~/.dsh/storages/session_projcache/sessions/<session-id>.json
```

Goal token accounting follows durable `goal/change` identity and admitted `user/message.source` goal IDs and round numbers. It uses the same last-sample replacement and retry boundary semantics as the harness token meter. Ordinary untagged turns are excluded. Projection state version 21 refolds existing logs to reconstruct goal usage; bounded per-round records use the existing detail channel, while cumulative totals remain in the head. Missing goal attribution produces an explicit unavailable state rather than session-wide usage.

The Goal page's **File changes** card lists successful file writes attributed to explicitly admitted rounds of the current goal, grouped by path with estimated cumulative added/removed lines. Read/search operations, failed writes, untagged manual turns, and other goals are excluded. Shell commands are not parsed as file edits. Counts reuse File Activity's argument-based estimates, so repeated edits accumulate and overwrites do not reconstruct the previous file body; they are not a net Git diff. The operation retention limit still applies and the card marks partial coverage when older records have been dropped. Projection state version 22 refolds existing logs to stamp goal ownership at tool-call time, preserving that owner through delayed results and nested Code Mode operations.
