# thought-carry

Provider-agnostic round-tripping for opaque "reasoning signature" tokens
across multi-turn LLM tool calling — Gemini's `thoughtSignature`,
Anthropic's signed thinking blocks, OpenAI's `encrypted_content`.

## Why I built this

I kept hitting the same failure while wiring multi-turn tool calling
against thinking models: a function call would come back with an opaque
signature attached, my code would forget to send it back exactly right,
and the next turn would fail — sometimes a clear 400, sometimes just a
silently dropped reasoning trace. Every provider needed different
handling, and the handling kept breaking as providers changed their API
shape. Google moved `thoughtSignature` from inside `functionCall` (Gemini
2.5) to a sibling field on the `Part` object (Gemini 3) in ~Nov 2025, and
whatever adapter I'd written for the old shape just silently stopped
attaching anything on the new one.

Once I went looking, I wasn't alone. A GitHub search for the failure
signature turns up 466 distinct repositories independently hitting
variants of it, with no shared vocabulary: `mlflow/mlflow#25745`, over a
dozen separate PRs to `vercel/ai` each patching a *different* instance of
the same underlying problem, and a handful of single-purpose proxies
built by different people to patch just their own tool, none referencing
each other. A recent paper (arXiv 2608.09867) independently names this
same class of opaque, provider-issued reasoning token — across OpenAI,
Anthropic, and Gemini — as an unsolved, structural problem, not a one-off
rough edge.

## The problem, precisely

Modern "thinking" models attach an opaque, provider-issued signature to
each function-call turn as proof the reasoning trace wasn't tampered
with. Every abstraction layer between the raw API and the developer has
to reimplement extraction/round-trip logic to match, and that logic keeps
breaking as providers change their API shape.

## Three genuinely different shapes, not one

Verified directly against each provider's own docs — this isn't one
problem with three syntaxes, it's two different *kinds* of problem:

- **Gemini**: the signature is a flat string attached near the function
  call. Extract it, reinsert it at the right nesting spot on the next
  request. The nesting spot itself has already changed once (2.5 → 3).
- **Anthropic**: the signature lives on its own `thinking` (or
  `redacted_thinking`) content block — a *sibling* of `tool_use`, not a
  field on it. Anthropic's own docs are explicit: rebuilding the message
  or filtering out a `redacted_thinking` block causes a 400. The correct
  operation is "pass the whole content array back exactly as received,"
  not "extract one field."
- **OpenAI**: same structural pattern as Anthropic — a `reasoning` item
  (carrying `encrypted_content`) sits as a sibling item in the output
  array next to `function_call`. Needs `include:
  ["reasoning.encrypted_content"]` on the request (or is default-on for
  `store: false` / Zero Data Retention orgs).

`thought-carry` gives each provider the operations its actual shape needs,
instead of forcing all three through one "extract a signature string"
abstraction that only really fits Gemini.

## Install

```
npm install thought-carry
```

## Use

```ts
import { gemini, anthropic, openai } from "thought-carry";

// Gemini -- extract-and-reinsert
const sig = gemini.assertThoughtSignaturePresent(part); // throws if missing
const nextPart = gemini.attachThoughtSignature(functionCall, sig, "3");

// Anthropic -- verbatim-preservation
anthropic.assertThinkingBlockPresent(content); // tool_use with no thinking block?
anthropic.assertContentPreserved(received, toSend); // did something mutate the array?

// OpenAI -- same pattern
openai.assertReasoningItemPresent(output);
openai.assertOutputPreserved(received, toSend);
const include = openai.buildIncludeParam(); // ["reasoning.encrypted_content"]
```

## Verification

Every shape above was pulled from each provider's own current docs, not
assumed:
- Gemini 2.5/3 shapes: confirmed against `mlflow/mlflow#25745`'s issue
  body, which quotes Google's documented response format verbatim.
- Anthropic: confirmed against
  `platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows`.
- OpenAI: confirmed against
  `developers.openai.com/api/docs/guides/reasoning` and the
  `reasoning.encrypted_content` include-parameter behavior.

**Live-verified against the real Gemini API** (`scripts/live-verify-gemini.mjs`,
requires `GEMINI_API_KEY`): a real `gemini-3.5-flash` call returns a real
`functionCall` + sibling `thoughtSignature`, `extractThoughtSignature()`
pulls it, `attachThoughtSignature()` reinserts it, and the reattached
signature is accepted on the next turn (no 400) with the tool-result data
genuinely reaching the model's final answer. Anthropic and OpenAI live
verification is still open -- shapes are confirmed against primary docs
but not yet round-tripped against a real API call.

## License

MIT
