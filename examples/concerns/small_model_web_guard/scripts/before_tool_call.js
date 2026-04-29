/**
 * Safety concern: block web-reaching tools when the current turn is running on
 * a small local model.
 *
 * Pairs with CONCERN.md in this package.
 * Spec: specification/CHAT_DEVELOPED_AGENT.md §8 (IEM) and
 *       examples/chat-developed-agent/CONSTITUTION.md §Invariants.
 *
 * Executable advice hook: before_tool_call
 * Return shape: { block: true, blockReason: string }
 */

const GUARDED_PROVIDERS = new Set([
  "ollama",
  "lmstudio",
  "llama",
  "llama.cpp",
  "vllm",
  "local"
]);

const BLOCKED_TOOLS = new Set(
  [
    "web_fetch",
    "webfetch",
    "fetch",
    "http_get",
    "http.get",
    "browser",
    "browser_navigate",
    "browser_snapshot",
    "browser_click",
    "browser_type",
    "browser_tabs",
    "browser_fill",
    "browser_hover",
    "browser_scroll",
    "curl",
    "wget"
  ].map((t) => t.toLowerCase())
);

const SMALL_MODEL_HINTS = [
  /\bgpt-oss\b/i,
  /\bllama[-_]?3\b/i,
  /\b(mistral|mixtral|phi|qwen|gemma)\b/i,
  /\b(7b|8b|13b|14b|20b|30b|70b)\b/i
];

function parseModelId(id) {
  if (typeof id !== "string") return { provider: null, model: null };
  const slash = id.indexOf("/");
  if (slash === -1) return { provider: null, model: id };
  return {
    provider: id.slice(0, slash).trim().toLowerCase(),
    model: id.slice(slash + 1).trim()
  };
}

function resolveProviderAndModel(event = {}) {
  // Try the direct fields the gateway is most likely to pass.
  const direct =
    event.providerOverride ||
    event.provider ||
    event.resolvedProvider ||
    event.agent?.provider;
  if (typeof direct === "string" && direct) {
    return {
      provider: direct.toLowerCase(),
      model: event.model ?? event.modelOverride ?? event.agent?.model ?? null
    };
  }
  const modelId =
    event.modelOverride ||
    event.model ||
    event.resolvedModel ||
    event.agent?.model ||
    event.request?.model;
  return parseModelId(modelId);
}

function isSmallOrLocal({ provider, model }) {
  if (provider && GUARDED_PROVIDERS.has(provider)) return true;
  if (typeof model === "string") {
    if (SMALL_MODEL_HINTS.some((re) => re.test(model))) return true;
  }
  return false;
}

function extractToolName(event = {}) {
  const raw =
    event.toolName ||
    event.tool_name ||
    event.tool ||
    event.name ||
    event.request?.tool ||
    event.call?.name ||
    "";
  return String(raw).trim().toLowerCase();
}

function before_tool_call(input = {}) {
  const event = input.event || input;
  const tool = extractToolName(event);
  if (!tool) return {};
  const { provider, model } = resolveProviderAndModel(event);
  if (!isSmallOrLocal({ provider, model })) return {};
  if (!BLOCKED_TOOLS.has(tool)) return {};

  const providerLabel = provider ?? "local";
  const modelLabel = model ?? "unknown";
  return {
    block: true,
    blockReason:
      `small_model_web_guard: tool "${tool}" is not allowed while running on ` +
      `${providerLabel}/${modelLabel}. Route the task to the hosted 'advanced' ` +
      `agent (openai/gpt-5.4) and retry. ` +
      `Rationale: small local models are vulnerable to prompt injection into ` +
      `uncontrolled network calls.`
  };
}

module.exports = {
  GUARDED_PROVIDERS,
  BLOCKED_TOOLS,
  SMALL_MODEL_HINTS,
  parseModelId,
  resolveProviderAndModel,
  isSmallOrLocal,
  extractToolName,
  before_tool_call,
  run: before_tool_call,
  default: before_tool_call
};
