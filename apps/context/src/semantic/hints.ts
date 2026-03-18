const DEFAULT_SEMANTIC_HINT =
  "Check provider configuration and retry semantic indexing.";

export function semanticHintForCode(errorCode?: string): string | undefined {
  switch (errorCode) {
    case "SEMANTIC_OPENAI_MISSING_KEY":
      return "Set OPENAI_API_KEY to enable semantic embeddings.";
    case "SEMANTIC_OPENAI_AUTH":
      return "Verify your OPENAI API key value and account permissions.";
    case "SEMANTIC_OPENAI_RATE_LIMIT":
      return "OpenAI rate limit hit. Retry shortly or reduce embedding batch size.";
    case "SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE":
      return "OpenAI provider unavailable. Retry shortly and check provider status.";
    case "SEMANTIC_ANTHROPIC_MISSING_KEY":
      return "Set ANTHROPIC_API_KEY to enable provider-backed summaries.";
    case "SEMANTIC_ANTHROPIC_AUTH":
      return "Verify your ANTHROPIC_API_KEY value and account permissions.";
    case "SEMANTIC_ANTHROPIC_RATE_LIMIT":
      return "Anthropic rate limit hit. Retry shortly or reduce summary batch size.";
    case "SEMANTIC_ANTHROPIC_PROVIDER_UNAVAILABLE":
      return "Anthropic provider unavailable. Retry shortly and check provider status.";
    default:
      return undefined;
  }
}

export function semanticHintOrDefault(errorCode?: string): string {
  return semanticHintForCode(errorCode) ?? DEFAULT_SEMANTIC_HINT;
}
