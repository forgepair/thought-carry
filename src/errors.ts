export class ThoughtSignatureMissingError extends Error {
  constructor(
    public readonly provider: string,
    public readonly detail: string,
  ) {
    super(
      `No reasoning signature found for provider "${provider}": ${detail}. ` +
        `This will be rejected on the next turn.`,
    );
    this.name = "ThoughtSignatureMissingError";
  }
}

export class ThoughtBlockTamperedError extends Error {
  constructor(
    public readonly provider: string,
    public readonly detail: string,
  ) {
    super(
      `Reasoning content for provider "${provider}" was modified before being ` +
        `echoed back: ${detail}. Anthropic and OpenAI reject a tampered/rebuilt ` +
        `reasoning block or item with a 400 -- pass the original array/output ` +
        `through unchanged, never reconstruct it field by field.`,
    );
    this.name = "ThoughtBlockTamperedError";
  }
}
