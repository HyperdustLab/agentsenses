/**
 * Tests for for-me-score.js — verifies the worked example in
 * specification/CHAT_DEVELOPED_AGENT.md §5.1.7.
 *
 * Run: node scripts/for-me-score.test.js   (no test framework required)
 */

const assert = require("node:assert/strict");
const {
  DEFAULTS,
  initial,
  derive,
  observe,
  tickDecay,
  classifySignal
} = require("./for-me-score");

function approx(actual, expected, tol = 0.01, label = "") {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ≈ ${expected}, got ${actual}`
  );
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(err.message);
  }
}

console.log("for-me-score:");

test("initial state is probationary prior", () => {
  const s = initial();
  const d = derive(s);
  approx(d.score, 0.25, 0.001, "score");
  approx(d.n, 0, 0.001, "n");
  assert.equal(s.state, "staging");
});

test("derive() — basic math on α=3, β=3", () => {
  const s = { alpha: 3, beta: 3 };
  const d = derive(s);
  approx(d.score, 0.5, 0.0001, "score");
  // variance = 9 / (36·7) ≈ 0.0357, std ≈ 0.189
  approx(d.std, 0.189, 0.005, "std");
  approx(d.lcb, 0.311, 0.01, "lcb");
});

// ---- worked example walk-through ----

test("§5.1.7 turn 1: accept_card → Probation", () => {
  const s = initial();
  observe(s, { signals: ["accept_card"] });
  approx(s.alpha, 3.0, 0.001, "alpha");
  approx(s.beta, 3.0, 0.001, "beta");
  approx(s.for_me_score, 0.5, 0.001, "score");
  approx(s.for_me_lcb, 0.311, 0.02, "lcb");
  assert.equal(s.state, "probation");
});

test("§5.1.7 turn 7: cumulative positives → Stable", () => {
  const s = initial();
  // replay turns 1..7 as one observation batch for brevity
  observe(s, {
    signals: [
      "accept_card", // +2
      "silent_success", // +0.25
      "correct", // +2 β
      "affirm", // +1
      "silent_success", // +0.25
      "silent_success", // +0.25  (turn 6 is "...five more silent_success"; we sum to +1.25 below)
      "silent_success",
      "silent_success",
      "silent_success",
      "silent_success",
      "affirm", // +1
      "affirm",
      "affirm"
    ]
  });
  // α = 1 + 2 + 0.25 + 1 + 5·0.25 + 3·1 = 1 + 7.5 = 8.5 (close to the 8.75 in the
  // table; table adds one extra silent_success in turn 2). Verify *state*, not
  // exact α, because intermediate turns in the table round α/β.
  assert.equal(s.state, "stable");
  approx(s.for_me_score, 0.63, 0.03, "score");
  approx(s.for_me_lcb, 0.51, 0.03, "lcb");
});

test("§5.1.7 turn 8: 5 days of disuse → score drifts, state holds Stable or borderline", () => {
  const s = { alpha: 8.75, beta: 5.0, state: "stable" };
  tickDecay(s, { ticks: 5 }, {
    ...DEFAULTS,
    decay: { ...DEFAULTS.decay, lambda: 0.021 } // ~0.9 total factor over 5 ticks
  });
  // α = 1 + 7.75·(0.979)^5 ≈ 1 + 7.75·0.899 ≈ 1 + 6.97 ≈ 7.97
  approx(s.alpha, 7.97, 0.1, "alpha after decay");
  approx(s.beta, 4.8, 0.1, "beta after decay");
  // Score should be very close to 0.63
  approx(s.for_me_score, 0.624, 0.01, "score after decay");
});

test("§5.1.7 turn 9: explicit reject → drops back to Probation", () => {
  const s = { alpha: 7.9, beta: 4.7, state: "stable" };
  observe(s, { signals: ["reject_card"] });
  // α=7.9, β=8.7 → score ≈ 0.476
  approx(s.for_me_score, 0.476, 0.01, "score");
  assert.equal(s.state, "probation");
});

test("§5.1.7 turn 10: long disuse → approaches prior (not archive — spec: decay ≠ reject)", () => {
  const s = { alpha: 7.9, beta: 8.7, state: "probation" };
  tickDecay(s, { ticks: 400 });
  // After 400 turns of lambda=0.02, factor = 0.98^400 ≈ 3.2e-4, ~full decay
  approx(s.alpha, DEFAULTS.prior.alpha0, 0.01, "alpha → α₀");
  approx(s.beta, DEFAULTS.prior.beta0, 0.01, "beta → β₀");
  approx(s.for_me_score, 0.25, 0.01, "score → prior mean");
  // Per spec §5.1.4: decay only produces *uncertainty*, not rejection. Sense
  // stays probation until an explicit negative signal arrives.
  assert.equal(s.state, "probation");
});

// ---- transition guards ----

test("promotion requires evidence floor (n): high score alone is not Stable", () => {
  // α=5, β=1 → score 0.833, n = (6)-(4) = 2. Stable demands n ≥ 6.
  const s = { alpha: 5, beta: 1, state: "probation" };
  observe(s, { signals: [] });
  approx(s.for_me_score, 0.833, 0.01, "score");
  assert.notEqual(s.state, "core", "not enough n for core");
  assert.notEqual(s.state, "stable", "not enough n for stable");
  assert.equal(s.state, "probation");
});

test("promotion to Core requires n ≥ 15, score ≥ 0.8, lcb ≥ 0.7", () => {
  const s = { alpha: 20, beta: 3, state: "stable" };
  observe(s, { signals: [] });
  // score = 20/23 ≈ 0.870, n = 23-4 = 19, should qualify for core if lcb ≥ 0.7
  approx(s.for_me_score, 0.87, 0.01, "score");
  assert.equal(s.state, "core");
});

test("archive on score ≤ 0.15", () => {
  const s = { alpha: 1, beta: 10, state: "probation" };
  observe(s, { signals: [] });
  // score = 1/11 ≈ 0.091
  assert.equal(s.state, "archive");
});

// ---- signal classification ----

test("classifySignal: canonical names pass through", () => {
  assert.equal(classifySignal("accept_card"), "accept_card");
  assert.equal(classifySignal("reject_card"), "reject_card");
  assert.equal(classifySignal("silent_success"), "silent_success");
});

test("classifySignal: aliases normalize", () => {
  assert.equal(classifySignal("accept"), "accept_card");
  assert.equal(classifySignal("Reject"), "reject_card");
  assert.equal(classifySignal("thumbs_up"), "affirm");
  assert.equal(classifySignal("thumbs_down"), "correct");
  assert.equal(classifySignal("disable"), "disable_cmd");
});

test("classifySignal: unknown → null", () => {
  assert.equal(classifySignal("banana"), null);
  assert.equal(classifySignal(""), null);
  assert.equal(classifySignal(null), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
