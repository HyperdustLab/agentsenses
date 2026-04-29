/**
 * Heuristic candidate-sense detector for the chat-developed agent pipeline.
 *
 * Spec: specification/CHAT_DEVELOPED_AGENT.md §4.1 (Observer).
 *
 * This is the *fast path* — regex/keyword scan of recent turns. A slower LLM
 * pass can be layered on top to reshape the drafts; this module is a cheap
 * first cut that runs on every turn.
 */

const RULE_VERB_RE = new RegExp(
  "\\b(always|never|prefer|avoid|should|must|don't|do not|stop(?: doing)?|use|never use|only use|by default|make sure|be sure to|when|if)\\b",
  "i"
);

const TIER_HINTS = [
  {
    tier: "meta",
    pattern: /\b(sense|senses|self-sense|self sense|inquiry|heartbeat|joinpoint|pointcut|advice|pipeline|observer|curator|confirmer|persister|agent senses)\b/i
  },
  {
    tier: "material",
    pattern: /\b(tool|command|shell|browser|file|path|env|environment|run|execute|open|close|save|download|upload|install|uninstall|mcp|model|provider)\b/i
  },
  {
    tier: "social",
    pattern: /\b(you|me|my|we|user|address|call me|tone|greet|politely|formal|informal|name|persona|style of speaking|honorific)\b/i
  },
  {
    tier: "spiritual",
    pattern: /\b(cite|source|reference|brief|concise|verbose|explain|reason|step by step|chain of thought|uncertainty|confidence|hedge|bullet|markdown|format|tone of writing|rhetoric)\b/i
  }
];

const CONFIRMATION_RE = /\b(thanks|great|perfect|exactly|yes please|that works|nice)\b/i;
const CORRECTION_RE = /\b(no|don't|do not|stop|wrong|incorrect|not like that|not that way|i said|i told you|again)\b/i;

function nowIso() {
  return new Date().toISOString();
}

function slugNameFrom(phrase) {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function guessTier(text) {
  for (const { tier, pattern } of TIER_HINTS) {
    if (pattern.test(text)) return tier;
  }
  return "spiritual";
}

/** Split an utterance into clauses we can evaluate one-by-one. */
function splitClauses(text) {
  return text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 400);
}

function classifyUserTurn(turn) {
  const text = turn?.content ?? turn?.text ?? "";
  if (typeof text !== "string") return { signal: null };
  if (CORRECTION_RE.test(text)) return { signal: "correct", text };
  if (CONFIRMATION_RE.test(text)) return { signal: "affirm", text };
  return { signal: null, text };
}

/**
 * Extract candidate rules from a window of the most recent turns.
 *
 * @param {Array<{role: string, content: string, id?: string}>} turns
 * @param {{windowSize?: number, minConfidence?: number}} options
 * @returns {Array<{name, description, advice_draft, tier_hint, confidence, source_turns}>}
 */
function detectCandidates(turns, options = {}) {
  const { windowSize = 20, minConfidence = 0.35 } = options;
  if (!Array.isArray(turns) || turns.length === 0) return [];
  const window = turns.slice(-windowSize);

  const candidates = [];
  const seen = new Set();

  for (const turn of window) {
    if (turn?.role !== "user") continue;
    const text = String(turn.content ?? turn.text ?? "").trim();
    if (!text) continue;

    for (const clause of splitClauses(text)) {
      if (!RULE_VERB_RE.test(clause)) continue;

      const tier = guessTier(clause);
      const subject = clause.replace(/^[,;:\-\s]+/, "").slice(0, 80);
      const name = slugNameFrom(subject) || slugNameFrom(clause);
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);

      let confidence = 0.4;
      if (CONFIRMATION_RE.test(clause)) confidence += 0.1;
      if (CORRECTION_RE.test(clause)) confidence += 0.15;
      if (/\balways\b|\bnever\b/i.test(clause)) confidence += 0.15;
      if (
        tier === "meta" &&
        /\b(should|must|do not|don't|by default|make sure)\b/i.test(clause)
      ) {
        confidence += 0.1;
      }
      confidence = Math.min(confidence, 0.95);
      if (confidence < minConfidence) continue;

      candidates.push({
        name,
        description: subject,
        advice_draft: clause.trim().replace(/\s+/g, " "),
        tier_hint: tier,
        confidence,
        source_turns: [turn.id ?? `${window.indexOf(turn)}`],
        created_at: nowIso()
      });
    }
  }
  return candidates;
}

/**
 * Turn a pair (assistant response, next user turn) into feedback signals
 * that can be fed to the Curator for an existing sense.
 *
 * Returns an object keyed by active sense name → array of signal strings.
 *   { citation_always: ["affirm"], tone_brief: ["correct"] }
 */
function detectFeedbackSignals(activeSenseNames, { priorAssistantTurn, nextUserTurn }) {
  const out = {};
  if (!Array.isArray(activeSenseNames) || activeSenseNames.length === 0) return out;
  const { signal } = classifyUserTurn(nextUserTurn);
  if (!signal) return out;
  for (const name of activeSenseNames) {
    out[name] = [signal];
  }
  return out;
}

module.exports = {
  RULE_VERB_RE,
  TIER_HINTS,
  slugNameFrom,
  guessTier,
  classifyUserTurn,
  splitClauses,
  detectCandidates,
  detectFeedbackSignals
};
