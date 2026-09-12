import { ThoughtSignatureMissingError } from "../errors.js";
import type { GeminiApiVersion, GeminiFunctionCall, GeminiPart } from "../types.js";

/**
 * Extract the thought signature from a Gemini Part, regardless of whether
 * it's shaped like 2.5 (nested inside functionCall) or 3 (sibling of
 * functionCall on the Part). Tries the 3.x location first since that's the
 * current shape; falls back to the 2.5 location so callers don't need to
 * know the api version in advance to extract.
 */
export function extractThoughtSignature(part: GeminiPart): string | undefined {
  return (
    part.thoughtSignature ??
    part.functionCall?.thoughtSignature ??
    part.functionCall?.thought_signature
  );
}

/**
 * Same extraction, but throws ThoughtSignatureMissingError instead of
 * returning undefined -- fail fast with an actionable message instead of
 * silently proceeding to a guaranteed HTTP 400 on the next turn.
 */
export function assertThoughtSignaturePresent(part: GeminiPart): string {
  const sig = extractThoughtSignature(part);
  if (sig === undefined) {
    const name = part.functionCall?.name ?? "?";
    throw new ThoughtSignatureMissingError(
      "gemini",
      `function call '${name}' has no thoughtSignature in either the 3.x ` +
        `(Part-level) or 2.5 (functionCall-level) location`,
    );
  }
  return sig;
}

/**
 * Build the correctly-shaped Part for the NEXT request, given a signature
 * you extracted (or received from your own model call) and the target api
 * version. This is the reinsertion half of the round trip -- Gemini 3
 * rejects a request that nests thoughtSignature inside functionCall (the
 * old 2.5 shape), per mlflow#25745's own reproduction of the write-side bug.
 */
export function attachThoughtSignature(
  functionCall: GeminiFunctionCall,
  signature: string,
  apiVersion: GeminiApiVersion,
): GeminiPart {
  if (apiVersion === "3") {
    return { functionCall, thoughtSignature: signature };
  }
  return { functionCall: { ...functionCall, thoughtSignature: signature } };
}
