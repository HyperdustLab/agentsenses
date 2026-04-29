/**
 * Bayesian Beta-Binomial update for a sense's `for_me_score`.
 *
 * Spec: specification/CHAT_DEVELOPED_AGENT.md §5.1
 *
 * Each sense holds Beta(α, β) pseudo-counts over the hypothesis
 *   "when my pointcut matches, my advice is the right thing for this user".
 *
 *   for_me_score = α / (α + β)       posterior mean
 *   evidence_n   = (α + β) − (α₀ + β₀) confidence
 *   for_me_lcb   = score − sqrt(var)    one-σ lower bound
 *
 * Signals contribute pseudo-counts to α (positive) or β (negative).
 * Decay pulls (α, β) back toward the prior on inactive ticks.
 */

const DEFAULTS = Object.freeze({
  prior: { alpha0: 1.0, beta0: 3.0 },
  decay: { lambda: 0.02, lambda_core: 0.007 },
  weights: {
    accept_card: 2.0,
    reject_card: 4.0,
    affirm: 1.0,
    silent_success: 0.25,
    correct: 2.0,
    silent_override: 1.0,
    meta_contradict: 0.5,
    enable_cmd: 1.5,
    disable_cmd: 3.0
  },
  transitions: {
    probation: { score: 0.35, lcb: 0.0, n: 1 },
    stable: { score: 0.6, lcb: 0.5, n: 6 },
    core: { score: 0.8, lcb: 0.7, n: 15 },
    archive: { score: 0.15 }
  }
});

const POSITIVE_SIGNALS = new Set([
  "accept_card",
  "affirm",
  "silent_success",
  "enable_cmd"
]);

const NEGATIVE_SIGNALS = new Set([
  "reject_card",
  "correct",
  "silent_override",
  "meta_contradict",
  "disable_cmd"
]);

function initial(config = DEFAULTS) {
  return {
    state: "staging",
    alpha: config.prior.alpha0,
    beta: config.prior.beta0
  };
}

function derive(sense, config = DEFAULTS) {
  const a = sense.alpha;
  const b = sense.beta;
  const sum = a + b;
  const score = a / sum;
  const n = sum - (config.prior.alpha0 + config.prior.beta0);
  const variance = (a * b) / (sum * sum * (sum + 1));
  const std = Math.sqrt(variance);
  const lcb = Math.max(0, score - std);
  return { score, n, lcb, variance, std };
}

function applySignals(sense, signals, config = DEFAULTS) {
  if (!Array.isArray(signals)) return sense;
  for (const s of signals) {
    const w = config.weights[s];
    if (w === undefined) continue;
    if (POSITIVE_SIGNALS.has(s)) sense.alpha += w;
    else if (NEGATIVE_SIGNALS.has(s)) sense.beta += w;
  }
  return sense;
}

function applyDecay(sense, { ticks = 1, isCore = false } = {}, config = DEFAULTS) {
  const lambda = isCore ? config.decay.lambda_core : config.decay.lambda;
  const { alpha0, beta0 } = config.prior;
  const factor = Math.pow(1 - lambda, ticks);
  sense.alpha = alpha0 + (sense.alpha - alpha0) * factor;
  sense.beta = beta0 + (sense.beta - beta0) * factor;
  return sense;
}

function transition(sense, derived, config = DEFAULTS) {
  const { score, lcb, n } = derived;
  const T = config.transitions;
  if (score <= T.archive.score) return "archive";
  if (score >= T.core.score && lcb >= T.core.lcb && n >= T.core.n) return "core";
  if (score >= T.stable.score && lcb >= T.stable.lcb && n >= T.stable.n) return "stable";
  if (score >= T.probation.score && n >= T.probation.n) return "probation";
  return sense.state || "staging";
}

function publish(sense, derived) {
  sense.for_me_score = roundTo(derived.score, 3);
  sense.for_me_lcb = roundTo(derived.lcb, 3);
  sense.evidence_n = roundTo(derived.n, 2);
  sense.priority = Math.round(100 * derived.score);
  return sense;
}

function roundTo(value, digits) {
  const scale = Math.pow(10, digits);
  return Math.round(value * scale) / scale;
}

/**
 * Apply a set of chat-derived signals, recompute score/lcb/state, publish fields.
 */
function observe(sense, { signals = [] } = {}, config = DEFAULTS) {
  applySignals(sense, signals, config);
  const d = derive(sense, config);
  sense.state = transition(sense, d, config);
  return publish(sense, d);
}

/**
 * Apply N ticks of disuse decay (no signals), recompute and publish.
 */
function tickDecay(sense, options = {}, config = DEFAULTS) {
  applyDecay(sense, options, config);
  const d = derive(sense, config);
  sense.state = transition(sense, d, config);
  return publish(sense, d);
}

/**
 * Classify a raw chat event into a canonical signal name. Useful for Observers
 * that receive free-form tags and want a single place to normalize them.
 */
function classifySignal(rawTag) {
  if (typeof rawTag !== "string") return null;
  const tag = rawTag.trim().toLowerCase();
  if (!tag) return null;
  if (POSITIVE_SIGNALS.has(tag) || NEGATIVE_SIGNALS.has(tag)) return tag;
  const aliases = {
    accept: "accept_card",
    accepted: "accept_card",
    approve: "accept_card",
    reject: "reject_card",
    rejected: "reject_card",
    deny: "reject_card",
    thumbs_up: "affirm",
    thumbs_down: "correct",
    correction: "correct",
    override: "silent_override",
    ignore: "silent_override",
    conflict: "meta_contradict",
    enable: "enable_cmd",
    disable: "disable_cmd"
  };
  return aliases[tag] ?? null;
}

module.exports = {
  DEFAULTS,
  POSITIVE_SIGNALS,
  NEGATIVE_SIGNALS,
  initial,
  derive,
  applySignals,
  applyDecay,
  transition,
  publish,
  observe,
  tickDecay,
  classifySignal
};
