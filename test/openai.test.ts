import { describe, expect, it } from "vitest";
import { ThoughtBlockTamperedError, ThoughtSignatureMissingError } from "../src/errors.js";
import {
  assertOutputPreserved,
  assertReasoningItemPresent,
  buildIncludeParam,
  hasFunctionCallItem,
  hasReasoningItem,
} from "../src/providers/openai.js";
import type { OpenAIOutputItem } from "../src/types.js";

// Real shape, confirmed against developers.openai.com/api/docs/guides/reasoning:
// reasoning is a SIBLING item in the output array, not nested in function_call.
const realOutput: OpenAIOutputItem[] = [
  {
    type: "reasoning",
    id: "rs_abc123",
    encrypted_content: "gAAAAA...opaque...",
    summary: [{ type: "summary_text", text: "Checking the weather for Paris." }],
  },
  {
    type: "function_call",
    id: "fc_1",
    call_id: "call_1",
    name: "get_weather",
    arguments: '{"location":"Paris"}',
  },
];

describe("openai", () => {
  it("detects the reasoning and function_call items in the real shape", () => {
    expect(hasReasoningItem(realOutput)).toBe(true);
    expect(hasFunctionCallItem(realOutput)).toBe(true);
  });

  it("flags the real failure shape: function_call present, reasoning item missing", () => {
    const broken: OpenAIOutputItem[] = [
      { type: "function_call", id: "fc_1", call_id: "call_1", name: "get_weather", arguments: "{}" },
    ];
    expect(() => assertReasoningItemPresent(broken)).toThrow(ThoughtSignatureMissingError);
  });

  it("passes when the output is echoed back byte-identical", () => {
    const toSend = JSON.parse(JSON.stringify(realOutput));
    expect(() => assertOutputPreserved(realOutput, toSend)).not.toThrow();
  });

  it("catches tampering: dropping the reasoning item before sending", () => {
    const tampered = realOutput.filter((i) => i.type !== "reasoning");
    expect(() => assertOutputPreserved(realOutput, tampered)).toThrow(ThoughtBlockTamperedError);
  });

  it("builds the include param with reasoning.encrypted_content merged in", () => {
    expect(buildIncludeParam(["some.other.field"])).toEqual(
      expect.arrayContaining(["some.other.field", "reasoning.encrypted_content"]),
    );
  });
});
