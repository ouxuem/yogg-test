# Implementation Steps Spec (MVP)

Scope: implement the MVP described in `AI_EVALUATION_SYSTEM_DESIGN.md`.

Out of scope (MVP): login, history, share link (hide), rewrite (hide), one-click rewrite.

## 0) Preconditions / Conventions

- [ ] Decide/confirm runtime split:
  - [ ] L1 runs client-side (recommended: Web Worker)
  - [ ] L2 runs server API route
- [ ] Freeze units and windows:
  - [ ] Units per rule: `chars` vs `words/tokens` (must follow `AI_EVALUATION_SYSTEM_DESIGN.md` section 12.2)
  - [ ] Window sizes (e.g. head_500w, tail_350w, paywall_context +/- 350w)
- [ ] Freeze language mode and tokenizer (must follow `AI_EVALUATION_SYSTEM_DESIGN.md` section 12.2.1):
  - [ ] `meta.language`: `en|zh` (avoid `auto` for MVP)
  - [ ] `meta.tokenizer`: `whitespace|intl-segmenter|char-fallback`
- [ ] Freeze vocab/threshold config format and versioning (e.g. `config/v2/*.json`).

Deliverable:
- [ ] A single config entry point that defines: keywords, thresholds, windows, and rule weights/max.

## 1) Input Contract + Preflight Validation

- [ ] Implement parser for:
  - [ ] `TITLE:` (optional)
  - [ ] `TOTAL_EPISODES:` (required)
  - [ ] `IS_COMPLETED:` (required; MVP requires `true`)
  - [ ] Episode headers: `EPISODE <n>` (case-insensitive; optional `EP <n>` compatibility)
  - [ ] Paywall marker: `[PAYWALL]`
- [ ] Implement integrity checks (fail fast, no scoring on invalid input):
  - [ ] `TOTAL_EPISODES` exists, integer, and meets minimum (design suggests `>= 15`)
  - [ ] `IS_COMPLETED` exists and is `true` (MVP rejects incomplete/ongoing inputs)
  - [ ] Episodes cover `1..TOTAL_EPISODES` with no missing and no duplicates
  - [ ] Paywall markers count is 0/1/2
  - [ ] No episode contains multiple paywall markers
  - [ ] Paywall episode index satisfies `2 <= ep <= TOTAL_EPISODES - 1`

- [ ] Error codes (match design doc):
  - [ ] `ERR_INCOMPLETE`
  - [ ] `ERR_TOO_SHORT`
  - [ ] `ERR_MISSING_EPISODE`
  - [ ] `ERR_DUPLICATE_EPISODE`
  - [ ] `ERR_TOO_MANY_PAYWALLS`
  - [ ] `ERR_MULTI_PAYWALL_IN_EPISODE`
  - [ ] `ERR_PAYWALL_OUT_OF_RANGE`

Deliverables:
- [ ] `ParseResult` that includes: `meta`, `episodes[]`, `paywalls[]`, and `errors[]`
- [ ] A single error payload used by UI when preflight fails

## 2) Window Builder (per-episode slices)

- [ ] For each episode, compute:
  - [ ] `head_*` window for opening rules
  - [ ] `tail_*` window for hook/cliffhanger rules
  - [ ] `paywall_context` for episodes that contain `[PAYWALL]`
  - [ ] Paywall asymmetric windows (if `[PAYWALL]` present):
    - [ ] `paywall_pre_context_1000t`
    - [ ] `paywall_post_context_400t`
  - [ ] Cross-episode hook windows:
    - [ ] `next_head_100t`
    - [ ] `hook_context = tail_350w + next_head_100t`

- [ ] Windowing rules must use `tokens` for `head_500w/tail_350w/paywall_context` (see design doc 12.3)
- [ ] The Ep2 opening rule window uses `chars` (Ep2 start `1000 chars`) per design doc 12.2

Deliverable:
- [ ] `EpisodeWindows[]` aligned to episode numbers and stable across reruns

## 3) L1 Stats (Deterministic)

Implement only what Track A + Track B require for the UI fields and the defined rules.

- [ ] Tokenization strategy for bilingual text (EN/ZH) that is deterministic and documented:
  - [ ] `en`: whitespace tokenizer
  - [ ] `zh`: `Intl.Segmenter` word tokenizer, with `char-fallback` when unavailable

- [ ] Web Worker execution (recommended):
  - [ ] Run Episode parse + preflight + window builder + L1Stats inside a Worker
  - [ ] Worker posts `progress` events (step + optional batch counters) for loading UI
  - [ ] Main thread handles user interactions, L2 API calls, and navigation
- [ ] Per-episode metrics:
  - [ ] `wordCount`
  - [ ] `vulgarCount` + `vulgarPenalty`
  - [ ] `redFlagHit` (Level 2 taboo list)
  - [ ] `emotionDensity`
  - [ ] `conflictKeywordCount`
  - [ ] `twistSignalCount` (with identity-neighborhood rule)
  - [ ] `visualHammerCount`
  - [ ] `visualHammerCount_Ep1to3`
  - [ ] `foreshadowCount`
  - [ ] `dialogueRatio` (pacing proxy)
  - [ ] `plotEventCount` (pacing proxy)

Deliverables:
- [ ] `L1StatsResult` with per-episode and global aggregates
- [ ] All keyword lists live in config, not inline code

## 4) L2 Batch Analyzer (Structure Recognition)

Goal: produce structured per-episode JSON for Track B and any Track A rules that depend on hook type.

- [ ] Define strict JSON schema and enums:
  - [ ] `hook.type`: `Decision | Crisis | Information | Emotion | None`
  - [ ] `hook.score`: number 0-10
  - [ ] `emotionLevel`: `Low | Medium | High`
  - [ ] `conflict.ext/int`: number 0-10
  - [ ] `primaryHookType`: string (taxonomy list if you want stability)
  - [ ] `aiHighlight`: string
  - [ ] `opening` (role attribution for Ep1-Ep3 scoring):
    - [ ] `opening.maleLead.present`: boolean
    - [ ] `opening.maleLead.visualTags`: number
    - [ ] `opening.maleLead.personaTags`: number
    - [ ] `opening.femaleLead.present`: boolean
    - [ ] `opening.femaleLead.hasConflict`: boolean
    - [ ] `opening.femaleLead.hasMotivation`: boolean
  - [ ] `genre` (for 2.1 correction):
    - [ ] `genre.label`: string
    - [ ] `genre.isOfficeRomance`: boolean
  - [ ] `confidence`: number 0-1
- [ ] Batch strategy:
  - [ ] `batch_size = 10` (or configurable)
  - [ ] `temperature = 0`
  - [ ] Robust JSON extraction (strip fenced blocks; reject invalid)
- [ ] Failure/timeout handling per batch:
  - [ ] Mark batch episodes as `confidence=0`
  - [ ] Track B marks as neutral
  - [ ] Track A uses documented fallback behavior per rule (either L1 fallback or 0 with warn)

- [ ] Confidence threshold (match design doc):
  - [ ] `CONFIDENCE_MIN = 0.7`
  - [ ] If `confidence < CONFIDENCE_MIN`, treat as L2 unavailable and trigger downgrade

Deliverables:
- [ ] Server API route for L2 calls
- [ ] `L2Result` aligned by episode number

## 5) Track A: V2 Scoring Engine (0-110) + Audit Trail

Implement scoring as a list of audit items, then aggregate.

- [ ] Define canonical audit item IDs and mapping:
  - [ ] Each item: `{id, dimension, score, max, status, reason, evidence[]}`
- [ ] Implement scoring for:
  - [ ] Monetization (50)
  - [ ] Story (30)
  - [ ] Market (20)
  - [ ] Potential (10)
- [ ] Implement grade conversion:
  - [ ] `overall_100 = round(total_110 / 110 * 100)`
  - [ ] Grade thresholds exactly as specified
- [ ] Warnings:
  - [ ] Missing paywall marker => warn + force paywall-related items to 0 as per rules
  - [ ] L2 missing => warn + fallback behavior
  - [ ] Redline hit => apply veto policy consistently (design doc mentions verdict; decide UI behavior)

- [ ] Apply L2-driven corrections where specified by design doc:
  - [ ] 1.1 opening scoring uses L2 `opening.*` to attribute tags to Male/Female lead (avoid villain/side-character leakage)
  - [ ] 2.1 core driver applies `genre.isOfficeRomance` correction to subplot keyword weighting

Deliverables:
- [ ] `ScoreResult` + `audit.items[]` + `warnings[]`

## 6) Track B: UI Diagnostics (Matrix + Issue Cards)

- [ ] Episode Matrix classification rules (minimal, explainable):
  - [ ] `hookWeak`
  - [ ] `conflictLow`
  - [ ] `pacingDrag`
  - [ ] Neutral when data missing / low confidence
- [ ] Issue card generation:
  - [ ] Map issue types to severity + template suggestions
  - [ ] Provide fields used by Diagnosis UI

Deliverables:
- [ ] `diagnosis` payload containing `selectedEpisode`, `issues[]`, and any filters
- [ ] `episodeMatrix[]` payload containing status + issue tags

## 7) Result Assembly (Single Source of Truth)

- [ ] Assemble final `Result JSON` exactly once per analysis run:
  - [ ] `meta`
  - [ ] `score`
  - [ ] `dashboard`
  - [ ] `diagnosis`
  - [ ] `audit`
- [ ] Ensure `meta` includes render-critical fields used by UI:
  - [ ] `meta.evaluationVersion`
  - [ ] `meta.rulesetVersion`
  - [ ] `meta.language` and `meta.tokenizer`
- [ ] Ensure `/result`, `/diagnosis`, `/print` render from the same JSON (no recompute)

Deliverable:
- [ ] A stable result schema used across pages and PDF

## 7.1) Result Transport (MVP, No DB)

Goal: analysis completes, then navigate to results pages without re-compute.

- [ ] Define a one-run identifier `rid`
- [ ] Persist the final `Result JSON` keyed by `rid` (recommended: `sessionStorage`)
- [ ] Navigation rule:
  - [ ] On success: `router.push('/result?rid=...')`
  - [ ] `/diagnosis` and `/print` read the same `rid` (from URL) and load the same stored JSON
- [ ] Expiration behavior:
  - [ ] If `rid` missing or result not found, show a clear “result expired / please analyze again” message and link back to `/`

## 8) UI Pages (Match Screenshots)

- [ ] `/` input page:
  - [ ] Paste/upload
  - [ ] Analyze
  - [ ] Show preflight errors
  - [ ] Loading UX during analysis (client-side):
    - [ ] Disable inputs and show current step text (e.g. “Validating format… / Parsing episodes… / Computing base metrics… / Analyzing structure (batch i/n)… / Finalizing report…”)
    - [ ] Show a progress indicator (use `Progress` component) driven by deterministic step/batch counts (from Worker progress + L2 batches)
    - [ ] On success, immediately redirect to `/result?rid=...`
- [ ] `/result` dashboard:
  - [ ] Overall score and grade
  - [ ] Header text uses `meta.title` + `dashboard.header.*`
  - [ ] Grade card uses `dashboard.gradeCard.*`
  - [ ] Three dimension bars + explanation text
  - [ ] Emotional intensity chart
  - [ ] Conflict frequency chart
  - [ ] Episode breakdown table
  - [ ] `Episodes 1–N Summary →` link navigates to `/diagnosis?rid=...` (no in-page component swap)
  - [ ] Export PDF button
  - [ ] Hide Share button
- [ ] `/diagnosis`:
  - [ ] Episode matrix + legend
  - [ ] Episodes 1–N Summary section (full episode table; same columns as dashboard)
  - [ ] Issue cards and filtering
  - [ ] Structural Integrity Check section uses `diagnosis.integrityChecks[]` (if present)
  - [ ] Export PDF button
  - [ ] Hide Share button
  - [ ] Hide View Rewrite button
- [ ] `/print`:
  - [ ] Print layout from same result JSON
  - [ ] `window.print()`

- [ ] Route-level loading:
  - [ ] Keep `src/app/loading.tsx` as the global fallback for route transitions (uses `GlobalLoading`)
  - [ ] Do not rely on route-level loading for “analysis step” visibility; step-by-step progress belongs to the `/` analysis flow

Deliverables:
- [ ] Pixel-close layout and fields driven by result schema

## 9) PDF Export

- [ ] Implement print view and CSS:
  - [ ] Hide interactive controls
  - [ ] Pagination layout
- [ ] Export flow: go to `/print` => trigger `window.print()`

Deliverable:
- [ ] PDF export works via browser print

## 10) Test Matrix (MVP)

- [ ] Parser tests:
  - [ ] Missing `TOTAL_EPISODES`
  - [ ] Missing episode numbers
  - [ ] Duplicate episode numbers
  - [ ] Paywall count > 2
  - [ ] Multiple paywalls in a single episode
  - [ ] Paywall at ep 1 or last episode
  - [ ] `IS_COMPLETED=false` => preflight error
- [ ] Scoring determinism tests:
  - [ ] Same input => same output
  - [ ] Keyword config version pin
- [ ] L2 failure tests:
  - [ ] Non-JSON response => fallback + warn
  - [ ] Timeout => neutral matrix + warn

- [ ] Language/tokenizer tests:
  - [ ] `meta.language=zh` uses `Intl.Segmenter` tokens (or char-fallback) and remains deterministic

Deliverable:
- [ ] A minimal automated test suite covering contract + fallback behavior

## 11) Verification Checklist

- [ ] LSP diagnostics: zero errors in modified files
- [ ] Build: `npm run build` passes
- [ ] Tests: `npm test` (or project equivalent) passes
- [ ] Manual smoke:
  - [ ] Valid full input renders `/result` and `/diagnosis`
  - [ ] Invalid input shows contract error and does not score
  - [ ] During analysis, loading UI shows steps and redirects to `/result` when done
  - [ ] Export PDF renders `/print` and prints
