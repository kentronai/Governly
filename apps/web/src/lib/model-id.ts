/**
 * Validation for the `model_id` stored on a Model Registry entry.
 *
 * `model_id` is not a label — it is the literal string the gateway puts in the
 * `model` field of the provider request. A registry row saved with a display
 * name ("Google Gemini") instead of an API identifier ("gemini-2.0-flash")
 * makes the provider reject *every* proxied request with an opaque HTTP 400,
 * long after the row was created and from a completely different screen.
 *
 * That is exactly what happened in production: the tenant's selected model had
 * `model_id = 'Google Gemini'`, so every message a customer sent through their
 * integration endpoint passed all guardrails and then died at the provider.
 *
 * The Model Registry form takes this identifier as free text, so the rule has
 * to live somewhere both the form and the server action can call.
 */

/**
 * Provider model identifiers are URL/path-safe tokens: letters, digits, and
 * `. _ - : / @`. Every major provider (OpenAI, Anthropic, Google, Groq,
 * Together, Mistral) follows this. None of them contain a space.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-:/@]*$/;

export const MODEL_ID_HINT =
  'Use the provider\'s API model identifier (e.g. "gpt-4o-mini", "gemini-2.0-flash", "claude-sonnet-4-20250514") — not the display name.';

/**
 * Returns an error message when `modelId` cannot be a provider API identifier,
 * or `null` when it is acceptable.
 */
export function validateModelId(
  modelId: string | null | undefined,
): string | null {
  const value = (modelId ?? "").trim();

  if (!value) {
    return "Model ID is required.";
  }

  // The single highest-value check: a space means someone typed a label.
  if (/\s/.test(value)) {
    return `Model ID cannot contain spaces. ${MODEL_ID_HINT}`;
  }

  if (!MODEL_ID_PATTERN.test(value)) {
    return `Model ID contains characters no provider accepts. ${MODEL_ID_HINT}`;
  }

  return null;
}
