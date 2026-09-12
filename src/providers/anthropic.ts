import { ThoughtBlockTamperedError, ThoughtSignatureMissingError } from "../errors.js";
import type { AnthropicContentBlock } from "../types.js";

/**
 * Anthropic's model is NOT "extract a signature string and reinsert it" --
 * the signature lives on its own `thinking` (or `redacted_thinking`) block,
 * a sibling of `tool_use` in the same content array. Per Anthropic's own
 * docs (thinking-tool-workflows), rebuilding the message or filtering out
 * a redacted_thinking block triggers a 400. The correct operation is
 * "pass the array back exactly as received," not "extract one field."
 */

export function hasThinkingBlock(content: AnthropicContentBlock[]): boolean {
  return content.some((b) => b.type === "thinking" || b.type === "redacted_thinking");
}

export function hasToolUseBlock(content: AnthropicContentBlock[]): boolean {
  return content.some((b) => b.type === "tool_use");
}

/**
 * Strict-mode check for the actual real-world failure shape: a tool_use
 * block present with no accompanying thinking/redacted_thinking block --
 * fail fast rather than let Anthropic reject the next turn.
 */
export function assertThinkingBlockPresent(content: AnthropicContentBlock[]): void {
  if (hasToolUseBlock(content) && !hasThinkingBlock(content)) {
    throw new ThoughtSignatureMissingError(
      "anthropic",
      "content array has a tool_use block but no thinking or " +
        "redacted_thinking block alongside it",
    );
  }
}

/**
 * The other real failure shape: the content array WAS echoed back, but
 * something along the way mutated it (a serialization round-trip that
 * drops an unrecognized field, a manual reconstruction that "cleans up"
 * the thinking block, filtering redacted_thinking out because it looks
 * like noise). Deep-equality check against the originally received array
 * before sending -- catches tampering before the API does, with a message
 * that says what actually happened instead of a bare 400.
 */
export function assertContentPreserved(
  received: AnthropicContentBlock[],
  toSend: AnthropicContentBlock[],
): void {
  const a = JSON.stringify(received);
  const b = JSON.stringify(toSend);
  if (a !== b) {
    throw new ThoughtBlockTamperedError(
      "anthropic",
      `content array differs from what was received (received ${received.length} ` +
        `block(s), sending ${toSend.length} block(s))`,
    );
  }
}
