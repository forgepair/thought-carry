import { describe, expect, it } from "vitest";
import { ThoughtSignatureMissingError } from "../src/errors.js";
import {
  assertThoughtSignaturePresent,
  attachThoughtSignature,
  extractThoughtSignature,
} from "../src/providers/gemini.js";
import type { GeminiPart } from "../src/types.js";

// Real Gemini 2.5 shape (thoughtSignature nested inside functionCall)
const gemini25Part: GeminiPart = {
  functionCall: {
    name: "get_weather",
    args: { city: "Seattle" },
    thoughtSignature: "sig_abc123_v25",
  },
};

// Real Gemini 3 shape, taken verbatim from mlflow/mlflow#25745's issue body
// (thoughtSignature promoted to a SIBLING of functionCall on the Part)
const gemini3Part: GeminiPart = {
  functionCall: { name: "get_weather", args: { city: "Seattle" }, id: "call_426398" },
  thoughtSignature: "sig_xyz789_v3",
};

describe("gemini", () => {
  it("extracts the signature from the real 2.5 shape", () => {
    expect(extractThoughtSignature(gemini25Part)).toBe("sig_abc123_v25");
  });

  it("extracts the signature from the real 3 shape (the actual regression case)", () => {
    expect(extractThoughtSignature(gemini3Part)).toBe("sig_xyz789_v3");
  });

  it("reproduces the real mlflow#25745 bug: a naive extractor that only checks the 2.5 location silently drops the v3 signature", () => {
    const naive25OnlyExtractor = (part: GeminiPart) =>
      part.functionCall?.thoughtSignature ?? part.functionCall?.thought_signature;
    expect(naive25OnlyExtractor(gemini3Part)).toBeUndefined();
  });

  it("strict mode raises a clear error instead of silently proceeding", () => {
    const broken: GeminiPart = { functionCall: { name: "x" } };
    expect(() => assertThoughtSignaturePresent(broken)).toThrow(ThoughtSignatureMissingError);
  });

  it("attaches the signature in the correct location for a v3 request (sibling of functionCall)", () => {
    const rebuilt = attachThoughtSignature(
      { name: "get_weather", args: { city: "Seattle" } },
      "sig_xyz789_v3",
      "3",
    );
    expect(rebuilt.thoughtSignature).toBe("sig_xyz789_v3");
    expect(rebuilt.functionCall).not.toHaveProperty("thoughtSignature");
  });

  it("attaches the signature in the correct location for a 2.5 request (nested inside functionCall)", () => {
    const rebuilt = attachThoughtSignature(
      { name: "get_weather", args: { city: "Seattle" } },
      "sig_abc123_v25",
      "2.5",
    );
    expect(rebuilt.functionCall?.thoughtSignature).toBe("sig_abc123_v25");
    expect(rebuilt.thoughtSignature).toBeUndefined();
  });
});
