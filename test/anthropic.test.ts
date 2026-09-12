import { describe, expect, it } from "vitest";
import { ThoughtBlockTamperedError, ThoughtSignatureMissingError } from "../src/errors.js";
import {
  assertContentPreserved,
  assertThinkingBlockPresent,
  hasThinkingBlock,
  hasToolUseBlock,
} from "../src/providers/anthropic.js";
import type { AnthropicContentBlock } from "../src/types.js";

// Real shape, taken verbatim from platform.claude.com/docs/en/build-with-claude/
// thinking-tool-workflows -- the actual documented example output.
const realContent: AnthropicContentBlock[] = [
  {
    type: "thinking",
    thinking:
      "The user wants to know the current weather in Paris. I have access to a function `get_weather`...",
    signature: "BDaL4VrbR2Oj0hO4XpJxT28J5T....",
  },
  {
    type: "text",
    text: "I can help you get the current weather information for Paris. Let me check that for you",
  },
  {
    type: "tool_use",
    id: "toolu_01CswdEQBMshySk6Y9DFKrfq",
    name: "get_weather",
    input: { location: "Paris" },
  },
];

describe("anthropic", () => {
  it("detects the thinking block in the real documented shape", () => {
    expect(hasThinkingBlock(realContent)).toBe(true);
    expect(hasToolUseBlock(realContent)).toBe(true);
  });

  it("does not flag content with no tool_use block even without thinking", () => {
    const textOnly: AnthropicContentBlock[] = [{ type: "text", text: "hi" }];
    expect(() => assertThinkingBlockPresent(textOnly)).not.toThrow();
  });

  it("flags the real failure shape: tool_use present, thinking block missing", () => {
    const broken: AnthropicContentBlock[] = [
      { type: "text", text: "..." },
      { type: "tool_use", id: "toolu_1", name: "get_weather", input: {} },
    ];
    expect(() => assertThinkingBlockPresent(broken)).toThrow(ThoughtSignatureMissingError);
  });

  it("accepts a redacted_thinking block as satisfying the requirement too", () => {
    const withRedacted: AnthropicContentBlock[] = [
      { type: "redacted_thinking", data: "opaque_blob" },
      { type: "tool_use", id: "toolu_1", name: "get_weather", input: {} },
    ];
    expect(() => assertThinkingBlockPresent(withRedacted)).not.toThrow();
  });

  it("passes when the array is echoed back byte-identical", () => {
    const toSend = JSON.parse(JSON.stringify(realContent));
    expect(() => assertContentPreserved(realContent, toSend)).not.toThrow();
  });

  it("catches the real documented failure: rebuilding/filtering the array before sending", () => {
    // Filtering out the thinking block -- exactly what Anthropic's docs
    // warn triggers a 400 if actually sent to the API.
    const tampered = realContent.filter((b) => b.type !== "thinking");
    expect(() => assertContentPreserved(realContent, tampered)).toThrow(ThoughtBlockTamperedError);
  });
});
