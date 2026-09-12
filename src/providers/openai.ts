import { ThoughtBlockTamperedError, ThoughtSignatureMissingError } from "../errors.js";
import { OPENAI_REQUIRED_INCLUDE, type OpenAIOutputItem } from "../types.js";

/**
 * Same structural pattern as Anthropic: OpenAI's Responses API puts a
 * `reasoning` item (carrying `encrypted_content`) as a SIBLING item in the
 * output array next to `function_call`, not nested inside it. Confirmed
 * against developers.openai.com/api/docs/guides/reasoning. The correct
 * operation is "pass every output item between the last user message and
 * the function call output back untouched," not "extract one field."
 */

export function hasReasoningItem(output: OpenAIOutputItem[]): boolean {
  return output.some((i) => i.type === "reasoning");
}

export function hasFunctionCallItem(output: OpenAIOutputItem[]): boolean {
  return output.some((i) => i.type === "function_call");
}

/** Reminder helper -- encrypted_content is default-on for store:false/ZDR
 * orgs, but the include value is still accepted (and needed on non-ZDR
 * stateless setups per the docs) for compatibility. */
export function buildIncludeParam(existing: string[] = []): string[] {
  const merged = new Set([...existing, ...OPENAI_REQUIRED_INCLUDE]);
  return [...merged];
}

export function assertReasoningItemPresent(output: OpenAIOutputItem[]): void {
  if (hasFunctionCallItem(output) && !hasReasoningItem(output)) {
    throw new ThoughtSignatureMissingError(
      "openai",
      "output array has a function_call item but no reasoning item " +
        "alongside it -- check that 'reasoning.encrypted_content' is in " +
        "the request's include param, or that store:false/ZDR is active",
    );
  }
}

export function assertOutputPreserved(
  received: OpenAIOutputItem[],
  toSend: OpenAIOutputItem[],
): void {
  const a = JSON.stringify(received);
  const b = JSON.stringify(toSend);
  if (a !== b) {
    throw new ThoughtBlockTamperedError(
      "openai",
      `output array differs from what was received (received ${received.length} ` +
        `item(s), sending ${toSend.length} item(s))`,
    );
  }
}
