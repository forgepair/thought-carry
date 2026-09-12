/**
 * Gemini's `functionCall` part. Real shape difference between API versions,
 * confirmed against mlflow/mlflow#25745's own issue body (which quotes
 * Google's documented Gemini 2.5 vs 3 response formats verbatim):
 *
 *   Gemini 2.5 and earlier: thoughtSignature nested INSIDE functionCall.
 *   Gemini 3+:              thoughtSignature promoted to a SIBLING field
 *                            on the Part object, next to functionCall.
 */
export interface GeminiFunctionCall {
  name: string;
  args?: Record<string, unknown>;
  id?: string;
  thoughtSignature?: string;
  thought_signature?: string;
}

export interface GeminiPart {
  functionCall?: GeminiFunctionCall;
  thoughtSignature?: string;
  [key: string]: unknown;
}

export type GeminiApiVersion = "2.5" | "3";

/**
 * Anthropic's content-block shape, confirmed against
 * platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows.
 * The signature lives on its OWN block, a sibling of tool_use in the same
 * content array -- NOT a field attached to tool_use. A redacted_thinking
 * block type also exists (opaque, no readable `thinking` text) and must be
 * preserved the same way.
 */
export interface AnthropicThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface AnthropicRedactedThinkingBlock {
  type: "redacted_thinking";
  data: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export type AnthropicContentBlock =
  | AnthropicThinkingBlock
  | AnthropicRedactedThinkingBlock
  | AnthropicToolUseBlock
  | AnthropicTextBlock
  | { type: string; [key: string]: unknown };

/**
 * OpenAI Responses API output-item shape, confirmed against
 * developers.openai.com/api/docs/guides/reasoning. Same structural pattern
 * as Anthropic: `reasoning` is a sibling item in the output array next to
 * `function_call`, not nested inside it. Requires
 * `include: ["reasoning.encrypted_content"]` on the request unless
 * store:false or a Zero Data Retention org makes it the default.
 */
export interface OpenAIReasoningItem {
  type: "reasoning";
  id: string;
  encrypted_content?: string;
  summary?: Array<{ type: "summary_text"; text: string }>;
}

export interface OpenAIFunctionCallItem {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export type OpenAIOutputItem =
  | OpenAIReasoningItem
  | OpenAIFunctionCallItem
  | { type: string; [key: string]: unknown };

export const OPENAI_REQUIRED_INCLUDE = ["reasoning.encrypted_content"] as const;
