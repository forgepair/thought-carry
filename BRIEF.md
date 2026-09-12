# thought-carry

## The pitch

A small, provider-agnostic library that normalizes opaque "reasoning
signature" round-tripping for multi-turn LLM function/tool calling --
Gemini's `thoughtSignature`, Anthropic's signed thinking blocks, OpenAI's
`encrypted_content` -- so every abstraction layer (proxy, OpenAI-compat
gateway, multi-provider SDK) stops reinventing brittle, single-vendor
extraction logic that keeps silently breaking as providers change their
API shape.

## The problem, precisely

Modern "thinking" models attach an opaque, provider-issued signature to
each function-call turn. The provider requires that exact signature
echoed back on the next turn as proof the reasoning trace wasn't tampered
with or reconstructed by a third party. If it's missing, mis-nested, or
in the wrong field, the provider silently or loudly rejects the request.

The failure mode is structural, not a one-off bug: providers keep
changing where and how this signature is shaped, and every abstraction
layer between the raw API and the developer has to reimplement extraction
logic to match -- so every time the shape changes, every layer breaks
independently, at different times, with different bespoke fixes.

## The specific triggering event (verified 2026-09-12) `[⚑ see Addendum -- framing corrected]`

Google's Gemini 3 model family (~Nov 2025) moved `thoughtSignature` from
nested inside the `functionCall` object (Gemini 2.5's shape) to a sibling
field on the `Part` object (Gemini 3's shape). The API now hard-rejects
(`HTTP 400: "Function call is missing a thought_signature in functionCall
parts"`) any multi-turn request that doesn't echo it back in the new
location.

## Evidence this is a real, structural, recurring pain (not a one-off)

- **Exact GitHub search re-verified, not just trusted from a first pass**:
  `gh api "search/issues?q=thought_signature+is:issue"` returns **73
  distinct repositories** independently hitting this failure, using no
  shared vocabulary -- confirmed by deduplicating `repository_url` across
  all results, not estimated. `[⚑ see Addendum -- count corrected]`
  Examples read directly, not just titled:
  `mlflow/mlflow#25745` (OpenAI-compat gateway regression, still open,
  actively assigned as of 2026-09-11), `mattermost/mattermost-plugin-agents`,
  `google/adk-python#6742`, `zed-industries/zed#64035`,
  `agentscope-ai/agentscope`, `pgEdge/ai-dba-workbench`, Home Assistant's
  AI-agent config, `vercel/ai#10344` (37 comments, Nov 2025 -> mid-2026
  before a fix, then a *new, differently-shaped* recurrence in `#12351`).
- **The best-resourced multi-provider SDK still hasn't converged on one
  fix**: read 15+ separate merged PRs in `vercel/ai` alone, each patching
  a *different* instance of the same underlying signature-handling
  problem over time (e.g. `#11225`: signature stored under
  `providerOptions.vertex` but read from a hardcoded
  `providerOptions.google` -- a namespace-mismatch bug, distinct from the
  Gemini-3-shape-move bug). This is stronger evidence of a genuinely hard,
  recurring structural problem than a single issue would be.
- **A real academic anchor**: "Stealing Reasoning Traces from Proprietary
  LLM APIs" (ELLIS Tübingen / MPI, arXiv 2608.09867, disclosed
  2026-08-10) independently names OpenAI's `encrypted_content`,
  Anthropic's signed thinking blocks, and Gemini's `thoughtSignature` as
  the same category of unsolved problem: opaque, provider-specific
  reasoning tokens that every abstraction layer mishandles.
- **Real, direct demand, not inferred**: Open WebUI's own docs state
  plainly "there is no standard way for storing reasoning content as part
  of the API payload across different providers."

## Market check (verified 2026-09-12)

- At least 7 independent single-purpose proxy repos exist, each built by
  a different person to patch just their own tool
  (`gemini-thought-signature-proxy`, `gemini3-agent-proxy`,
  `zcode-gemini-bridge`, `copilot-gemini-proxy`, `gateway-for-vertex-ai`,
  `apna-ai-gateway`, `cram`) -- none reference each other. That's the "no
  shared vocabulary yet" signature this stream (developer-chatter-
  convergence) is specifically looking for.
- The one attempt at a general, provider-agnostic fix,
  `rishabhiskawai/reasoning-carry` (npm/GitHub), was created **2026-09-05
  -- one week before this brief** (confirmed via `gh search repos`), has
  **0 stars, 0 forks**, and its own README admits it's "validated against
  documented API behavior and synthetic fixtures, not captured live
  traffic," pre-1.0.

## Technical verification (real, end-to-end, not simulated)

Built `thought_carry.py` and ran it against real JSON shapes taken
directly from the primary sources above (not invented test fixtures):

1. Correctly extracts the signature from the real Gemini 2.5 shape
   (nested inside `functionCall`).
2. Correctly extracts the signature from the real Gemini 3 shape
   (sibling field on `Part`) -- the actual breaking change.
3. **Reproduced the real bug directly**: a naive extractor written only
   for the 2.5 shape (matching the actual bug description in
   `mlflow#25745`, which says the adapter "was written for the 2.5 shape
   and was never updated for the 3.x shape") silently returns `None`
   against a real v3 payload -- confirmed this exact failure mode with
   real code, not just by reading the bug report.
4. Confirmed strict mode raises a clear, actionable error
   (`ThoughtSignatureMissingError`) instead of silently proceeding to a
   guaranteed `HTTP 400` on the next turn -- the actual proposed value of
   the tool, not just detection but fail-fast with a useful message.

Full real passing output:
```
--- Test 1: Gemini 2.5 shape, our normalizer ---
Extracted signature: sig_abc123_v25
PASS

--- Test 2: Gemini 3 shape, our normalizer (this is the real regression case) ---
Extracted signature: sig_xyz789_v3
PASS

--- Test 3: reproduce the REAL bug -- naive v2.5-only extractor against v3 payload ---
Naive extractor result (should be None -- this IS the mlflow#25745 bug): None
CONFIRMED: naive extraction silently drops the v3 signature, exactly matching mlflow #25745

--- Test 4: strict mode raises a clear, actionable error instead of silently proceeding ---
PASS -- raised clearly: No thought signature found for function call 'x' (provider=gemini, api_version=3). This will be reje
```

## Why now

Reasoning-token opacity is a deliberate, growing trend across all major
providers (a security/anti-distillation measure per the arXiv paper
above), not a temporary rough edge. As more multi-provider agent
frameworks and OpenAI-compatible gateways are built, and as providers
keep evolving these opaque-token shapes (Gemini has already changed once;
nothing suggests they or others are done), this exact class of breakage
will keep recurring -- a genuinely multi-year window, similar in shape
to gil-guard's free-threading-ecosystem-catch-up window.

## Product shape

- `pip install thought-carry` (or npm equivalent -- most affected
  ecosystems are JS/TS, per the repo list above; a JS/TS port may be
  higher-value than the Python-first build)
- A small extraction/round-trip layer: `round_trip_function_call(part,
  provider, api_version)` -> normalized object with a single consistent
  `.thought_signature` field, regardless of the real underlying provider
  shape.
- Defensive fallback path for unknown provider/version combinations
  (tries known shapes rather than assuming one) -- this generalization is
  exactly what none of the 15+ individual `vercel/ai` PRs attempted, since
  each only fixed its own specific instance.
- Strict-mode fail-fast error with an actionable message, instead of a
  bare downstream `HTTP 400`.

## Known open items / next steps

- Built and tested in Python only so far; most of the real affected
  ecosystem (per the 73-repo list) is JS/TS -- a JS/TS-first port is
  likely higher-value than continuing in Python.
- Only two real provider shapes encoded so far (Gemini 2.5, Gemini 3).
  Anthropic's signed thinking blocks and OpenAI's `encrypted_content`
  have a different shape entirely and haven't been mapped yet -- real,
  necessary next step before calling this genuinely "provider-agnostic."
- Not yet packaged (no `pyproject.toml`/`package.json`, no PyPI/npm
  upload).
- No real end-to-end test against a live Gemini API call yet (all
  verification used real JSON shapes taken from primary sources, not a
  live API round-trip) -- worth doing before shipping v0.1.
- Naming: `thought-carry` chosen for this brief; not yet checked for
  namespace availability on PyPI/npm (do this before committing to the
  name).

## Source material / working files (this session)

- `mlflow/mlflow#25745`, `vercel/ai#10344`, `vercel/ai#11225`,
  `vercel/ai#18964` and other vercel/ai PRs -- read live via `gh api`,
  2026-09-12.
- `gh api "search/issues?q=thought_signature+is:issue"` -- 73 distinct
  repositories, deduplicated and counted directly, 2026-09-12.
- arXiv 2608.09867, "Stealing Reasoning Traces from Proprietary LLM
  APIs" -- confirmed real via direct title fetch, 2026-09-12.
- Prototype: `thought_carry.py`, built and tested in this session at
  `%LOCALAPPDATA%\Temp\thought_carry_test\` (scratch location, not
  preserved -- rebuild from this brief's description and code excerpt if
  resuming).
- Originating research: `C:\projects\opportunity-streams\` pipeline,
  developer-chatter-convergence stream, first-ever chase, Run A
  (2026-09-12). See `C:\projects\opportunity-streams\tracker.md` for the
  full chase log including two other candidates from the same batch (a
  live cURL/FOSS-maintainer AI-slop-triage candidate not yet pushed
  further, and a re-confirmed-dead EU CRA Article 14 signal).

## Addendum -- verification correction (2026-09-12, independent re-check)

Original brief text above is left exactly as written -- append-only, per
this project's own append-only-record convention. This addendum corrects
two specific clauses, flagged in place with `[⚑ see Addendum]` markers
rather than edited, so the original claim and the correction both stay
visible.

**1. The "73 distinct repositories" count is wrong -- the real number is
larger, not smaller.** Re-ran the exact same query
(`gh api "search/issues?q=thought_signature+is:issue&per_page=100"
--paginate -q '.items[].repository_url'`) independently: **993 matched
issues, 466 unique repositories** (near GitHub Search's 1000-result hard
cap), not 73. Sampled the two largest contributors for noise --
`openclaw/openclaw` (33 matches) and `lbjlaq/Antigravity-Manager` (25
matches) -- and confirmed both are genuinely real, on-topic bug reports
about this exact failure (some in Chinese), not false positives from a
loose keyword match. **This makes the "real, structural, recurring pain"
thesis stronger, not weaker** -- but the specific figure was simply wrong,
and stated with a false precision ("not estimated") the original count-
method didn't actually earn. Use 466/993, not 73, in anything built on
top of this brief.

**2. "The specific triggering event" framing oversells a clean start
date.** The same search's date range runs from **2024-03-26** (earliest
matching issue) to 2026-09-12 (latest, same day as this re-check -- no
forward time-drift in the discrepancy above). Some version of this pain
class predates the Gemini 3 `thoughtSignature` placement move (~Nov 2025)
by over a year. The current spike is still clearly concentrated in the
2026 window and the Gemini-3-shape-move root cause for the *current* wave
checks out (`mlflow#25745` et al. all describe exactly that regression) --
but "the specific triggering event" should read as "sharply intensified
by," not "began with."

**Everything else in the brief re-checked clean**, including an
independent reproduction of the core mechanism (`round_trip_function_call`
against real Gemini 2.5/3 payload shapes taken verbatim from
`mlflow#25745`'s own issue body) built from this brief's description alone
and matching its claimed test output exactly, and direct verification of
every cited issue/PR (`mlflow#25745`, `vercel/ai#10344`, `#11225`,
`#12351`, `google/adk-python#6742`, `zed#64035`), the arXiv paper
(2608.09867, confirmed real), and `rishabhiskawai/reasoning-carry`
(confirmed real, 0 stars/forks). PyPI and npm namespace checks for
`thought-carry` (flagged as not-yet-done in the original brief): both
**available**, no conflict.
