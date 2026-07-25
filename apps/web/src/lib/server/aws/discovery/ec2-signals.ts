const AI_SIGNAL =
  /(^|[-_:/.])(ai|agent|llm|genai|copilot|assistant|langchain|crewai|autogen)([-_:/.]|$)/i;
const COMPOUND_AI_SIGNAL = /(agent|assistant|copilot|chatbot)$/i;
const SIGNAL_TAG_KEYS = new Set([
  "ai",
  "ai-agent",
  "agent",
  "norix:agent",
  "norix-agent",
  "workload-type",
]);

export function hasAgentSignal(
  name: string,
  tags: Record<string, string>,
): boolean {
  // Deployment names commonly join the workload type to the application
  // name (for example "streamlit-chatbotagent"). Treat an AI role suffix as
  // an explicit signal as well as the separator-delimited forms above.
  if (AI_SIGNAL.test(name) || COMPOUND_AI_SIGNAL.test(name)) return true;
  return Object.entries(tags).some(
    ([key, value]) =>
      (SIGNAL_TAG_KEYS.has(key.toLowerCase()) || AI_SIGNAL.test(key)) &&
      value.toLowerCase() !== "false" &&
      value.toLowerCase() !== "disabled",
  );
}
