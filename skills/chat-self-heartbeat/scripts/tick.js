#!/usr/bin/env node
/**
 * chat-self-heartbeat: make the self-layer aware of time and of the workspace
 * without requiring a chat turn.
 *
 * Spec: specification/CHAT_DEVELOPED_AGENT.md §5 (predictive coding loop) and
 *       §5.1.4 (decay is "disuse → uncertainty, not disapproval").
 *
 * What one tick does:
 *   1. Apply tickDecay to every installed Sense's sidecar Beta state,
 *      scaled by minutes elapsed since the sense's last_tick.
 *   2. Snapshot the workspace file listing (name, mtime, size) and diff it
 *      against the previous snapshot to surface additions / modifications /
 *      deletions.
 *   3. Emit a concise human-readable report (stdout) and a machine-readable
 *      JSON report (--json) for the agent to read.
 *
 * Invariants:
 *   - Never edits SENSE.md (sidecars only).
 *   - Never writes outside the workspace.
 *   - Never enters .constitution/.
 *   - Idempotent: running the same tick twice in a row decays minimally and
 *     produces no spurious workspace diffs.
 */

const fs = require("node:fs");
const path = require("node:path");

const WS = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME, ".openclaw", "workspace");
const SENSES_DIR = path.join(WS, "senses");
const STATE_DIR = path.join(WS, "state", "chat-self-heartbeat");
const SNAPSHOT_FILE = path.join(STATE_DIR, "workspace-snapshot.json");
const LAST_TICK_FILE = path.join(STATE_DIR, "last-tick.json");
const INQUIRIES_FILE = path.join(STATE_DIR, "inquiries.json");

// Agent behavior: quiet hours + escalation cadence.
const QUIET_HOUR_START = 23; // 23:00 local
const QUIET_HOUR_END = 8;    // 08:00 local
const ESCALATE_AFTER_TICKS = 4; // unanswered for ~4 heartbeats → suggest web research

// Per-tier question catalogue. Small on purpose; grow via user feedback.
const QUESTION_CATALOGUE = {
  material: [
    "Which tools should I avoid running on my own, without asking first?",
    "Are there files or directories I should never touch in this workspace?",
    "Is there a time window when I shouldn't take any external actions at all?",
    "What do I do if a tool fails repeatedly — retry, ask, or give up?"
  ],
  social: [
    "How should I address you at the start of a session — by name, nickname, or neutral?",
    "When we disagree, should I push back directly or defer first and ask?",
    "How formal should I be when talking to other people through you?",
    "What kinds of things about our conversations are private and shouldn't leak out of main?"
  ],
  spiritual: [
    "When I make a factual claim, do you want sources inline, in a footnote, or not at all?",
    "Do you want to see my reasoning steps, or only the conclusion?",
    "How concise should my default reply be — one line, one paragraph, or thorough?",
    "When I'm uncertain, should I guess with a confidence label, hedge, or say 'I don't know'?"
  ],
  meta: [
    "When two of my rules conflict, which should I default to — the older or the newer one?",
    "How should I decide when a rule I used to follow is no longer mine?",
    "Should I ever apply a new rule silently, or always surface it for your OK first?"
  ]
};

// Import Beta-Binomial helpers from chat-self-curator (installed alongside).
function loadCurator() {
  const abs = path.resolve(
    __dirname,
    "..",
    "..",
    "chat-self-curator",
    "scripts",
    "for-me-score.js"
  );
  if (!fs.existsSync(abs)) {
    throw new Error(
      `chat-self-curator not found at ${abs} — install it alongside chat-self-heartbeat`
    );
  }
  return require(abs);
}

// -------- sense discovery + sidecar state --------

function isSenseDir(dir) {
  return (
    fs.existsSync(path.join(dir, "SENSE.md")) ||
    (fs.existsSync(path.join(dir, "sense.yaml")) &&
      fs.existsSync(path.join(dir, "prompt.md")))
  );
}

function listSensePackages() {
  if (!fs.existsSync(SENSES_DIR)) return [];
  const entries = fs.readdirSync(SENSES_DIR, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue; // skip .constitution, .archive, .staging
    const full = path.join(SENSES_DIR, e.name);
    if (!isSenseDir(full)) continue;
    out.push({ name: e.name, dir: full, sidecar: path.join(full, ".state.json") });
  }
  return out;
}

function readSidecar(pkg, curator) {
  try {
    const txt = fs.readFileSync(pkg.sidecar, "utf8");
    return JSON.parse(txt);
  } catch {
    const s = curator.initial();
    // Publish derived fields on first read so the report shows clean numbers.
    const d = curator.derive(s);
    s.for_me_score = Math.round(d.score * 1000) / 1000;
    s.for_me_lcb = Math.round(d.lcb * 1000) / 1000;
    s.evidence_n = Math.round(d.n * 100) / 100;
    s.priority = Math.round(100 * d.score);
    s.last_tick = new Date().toISOString();
    return s;
  }
}

function writeSidecar(pkg, state) {
  fs.mkdirSync(path.dirname(pkg.sidecar), { recursive: true });
  fs.writeFileSync(pkg.sidecar, JSON.stringify(state, null, 2) + "\n", "utf8");
}

// -------- decay pass --------

function minutesBetween(iso) {
  if (!iso) return 0;
  const dt = Date.now() - Date.parse(iso);
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.floor(dt / 60000);
}

function decayPass(curator, isCoreForSense = () => false) {
  // Per-minute lambda derived from DEFAULTS (tuned for a ~35-minute half-life
  // in the unit-tests; adjust per tier via metadata if needed later).
  const perTickLambda = curator.DEFAULTS.decay.lambda;
  const packages = listSensePackages();
  const changes = [];

  for (const pkg of packages) {
    const state = readSidecar(pkg, curator);
    const sidecarExists = fs.existsSync(pkg.sidecar);
    const minutes = minutesBetween(state.last_tick);
    if (sidecarExists && minutes === 0) {
      continue; // already up to date this minute
    }

    const before = {
      alpha: state.alpha,
      beta: state.beta,
      for_me_score: state.for_me_score,
      evidence_n: state.evidence_n,
      priority: state.priority,
      s: state.state
    };

    const isCore = isCoreForSense(pkg.name, state);
    const config = {
      ...curator.DEFAULTS,
      decay: {
        ...curator.DEFAULTS.decay,
        // Map minute-granularity into the module's tick lambda by passing
        // ticks = minutes; the module raises (1 - lambda) to that power.
        lambda: perTickLambda
      }
    };

    curator.tickDecay(state, { ticks: minutes, isCore }, config);
    state.last_tick = new Date().toISOString();
    writeSidecar(pkg, state);

    if (before.state !== state.state || Math.abs(before.for_me_score - state.for_me_score) >= 0.001) {
      changes.push({
        sense: pkg.name,
        elapsed_minutes: minutes,
        before,
        after: {
          alpha: state.alpha,
          beta: state.beta,
          for_me_score: state.for_me_score,
          evidence_n: state.evidence_n,
          priority: state.priority,
          s: state.state
        }
      });
    }
  }

  return { packages: packages.map((p) => p.name), changes };
}

// -------- workspace diff --------

const SNAPSHOT_EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "sessions",
  "state",
  "memory"
]);
const SNAPSHOT_MAX_FILES = 2000;

const SNAPSHOT_EXCLUDE_FILES = new Set([".state.json", ".audit.log"]);

function walkWorkspace(rel, acc) {
  if (acc.length >= SNAPSHOT_MAX_FILES) return;
  const abs = path.join(WS, rel);
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (acc.length >= SNAPSHOT_MAX_FILES) break;
    if (SNAPSHOT_EXCLUDE_DIRS.has(e.name)) continue;
    if (SNAPSHOT_EXCLUDE_FILES.has(e.name)) continue;
    const r = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) {
      walkWorkspace(r, acc);
      continue;
    }
    try {
      const st = fs.statSync(path.join(WS, r));
      acc.push({ p: r, m: st.mtimeMs, s: st.size });
    } catch {
      // ignore
    }
  }
}

function snapshotWorkspace() {
  const acc = [];
  walkWorkspace("", acc);
  return acc;
}

function readPrevSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  } catch {
    return null;
  }
}

function diffSnapshot(prev, next) {
  const byPath = (xs) => {
    const m = new Map();
    for (const x of xs) m.set(x.p, x);
    return m;
  };
  const a = byPath(prev || []);
  const b = byPath(next);
  const added = [];
  const removed = [];
  const modified = [];
  for (const [p, y] of b) {
    const x = a.get(p);
    if (!x) added.push(p);
    else if (x.m !== y.m || x.s !== y.s) modified.push(p);
  }
  for (const p of a.keys()) if (!b.has(p)) removed.push(p);
  return { added, removed, modified };
}

function writeSnapshot(snap) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap), "utf8");
}

// -------- tier coverage + inquiry queue --------

const ALL_TIERS = ["material", "social", "spiritual", "meta"];

function readSenseTier(pkg) {
  // Best-effort YAML frontmatter read for `metadata.tier`; falls back to "unknown".
  const senseMd = path.join(pkg.dir, "SENSE.md");
  if (!fs.existsSync(senseMd)) return "unknown";
  const raw = fs.readFileSync(senseMd, "utf8");
  const m = raw.match(/^---([\s\S]*?)\n---/);
  if (!m) return "unknown";
  const fm = m[1];
  const tm = fm.match(/\btier:\s*([a-z]+)/i);
  return tm ? tm[1].toLowerCase() : "unknown";
}

function tierCoverage(packages) {
  const counts = { material: 0, social: 0, spiritual: 0, meta: 0, unknown: 0 };
  for (const p of packages) {
    const t = readSenseTier(p);
    if (counts[t] === undefined) counts.unknown += 1;
    else counts[t] += 1;
  }
  return counts;
}

function nextTierToDevelop(counts) {
  let target = ALL_TIERS[0];
  let lowest = Infinity;
  for (const t of ALL_TIERS) {
    if (counts[t] < lowest) {
      lowest = counts[t];
      target = t;
    }
  }
  return target;
}

function readInquiries() {
  try {
    return JSON.parse(fs.readFileSync(INQUIRIES_FILE, "utf8"));
  } catch {
    return { recent_asked: {}, queue: [] };
  }
}

function writeInquiries(inq) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(inq, null, 2) + "\n", "utf8");
}

function pickQuestion(tier, inq) {
  const pool = QUESTION_CATALOGUE[tier] ?? QUESTION_CATALOGUE.spiritual;
  const recent = new Set(inq.recent_asked?.[tier] ?? []);
  const unused = pool.filter((q) => !recent.has(q));
  if (unused.length > 0) return unused[Math.floor(Math.random() * unused.length)];
  // Everything in catalogue has been asked; clear the ring and reuse.
  inq.recent_asked[tier] = [];
  return pool[Math.floor(Math.random() * pool.length)];
}

function isQuietHour(date = new Date()) {
  const h = date.getHours();
  if (QUIET_HOUR_START <= QUIET_HOUR_END) {
    return h >= QUIET_HOUR_START && h < QUIET_HOUR_END;
  }
  // wraps midnight
  return h >= QUIET_HOUR_START || h < QUIET_HOUR_END;
}

function mintInquiryId() {
  return "inq_" + Math.random().toString(36).slice(2, 10);
}

function inquiryPass(packages, now = new Date()) {
  const inq = readInquiries();
  inq.queue = inq.queue ?? [];
  inq.recent_asked = inq.recent_asked ?? {};

  // 1. Increment tick counter for every open inquiry.
  for (const q of inq.queue) {
    if (q.state === "open") q.tick_count = (q.tick_count ?? 0) + 1;
  }

  // 2. Flag long-unanswered open inquiries for web-research escalation.
  const newlyEscalated = [];
  for (const q of inq.queue) {
    if (q.state === "open" && q.tick_count >= ESCALATE_AFTER_TICKS && !q.escalate_to_web) {
      q.escalate_to_web = true;
      newlyEscalated.push(q);
    }
  }

  // 3. Decide whether to mint a new inquiry this tick.
  const quiet = isQuietHour(now);
  const hasOpen = inq.queue.some((q) => q.state === "open" && !q.escalate_to_web);
  let minted = null;
  if (!quiet && !hasOpen) {
    const counts = tierCoverage(packages);
    const tier = nextTierToDevelop(counts);
    const question = pickQuestion(tier, inq);
    minted = {
      id: mintInquiryId(),
      tier,
      question,
      state: "open",
      asked_at: now.toISOString(),
      tick_count: 0,
      escalate_to_web: false
    };
    inq.queue.push(minted);
    if (!inq.recent_asked[tier]) inq.recent_asked[tier] = [];
    inq.recent_asked[tier].push(question);
    // keep ring short
    if (inq.recent_asked[tier].length > Math.max(3, (QUESTION_CATALOGUE[tier] || []).length - 1)) {
      inq.recent_asked[tier].shift();
    }
  }

  writeInquiries(inq);
  return {
    tier_coverage: tierCoverage(packages),
    newly_minted: minted,
    newly_escalated: newlyEscalated,
    open: inq.queue.filter((q) => q.state === "open"),
    quiet_hours: quiet
  };
}

// Close an inquiry when the user has answered. Called via --answer <id>.
function markAnswered(id, notes = "") {
  const inq = readInquiries();
  const row = (inq.queue ?? []).find((q) => q.id === id);
  if (!row) {
    throw new Error(`inquiry ${id} not found`);
  }
  row.state = "answered";
  row.answered_at = new Date().toISOString();
  if (notes) row.notes = notes;
  writeInquiries(inq);
  return row;
}

// -------- main --------

function formatReport({ tickAt, decay, workspace, inquiry }) {
  const lines = [];
  lines.push(`# self-heartbeat tick @ ${tickAt}`);
  lines.push("");
  lines.push(`## time`);
  lines.push(`- senses scanned: ${decay.packages.length}`);
  lines.push(`- senses changed: ${decay.changes.length}`);
  if (decay.changes.length > 0) {
    for (const c of decay.changes) {
      lines.push(
        `  - ${c.sense}: ${c.before.s} → ${c.after.s} (score ${c.before.for_me_score}→${c.after.for_me_score}, after ${c.elapsed_minutes}m)`
      );
    }
  }
  lines.push("");
  lines.push(`## workspace`);
  if (workspace.firstRun) {
    lines.push(`- first run — snapshot saved, nothing to diff yet`);
  }
  lines.push(`- added:    ${workspace.added.length}`);
  lines.push(`- modified: ${workspace.modified.length}`);
  lines.push(`- removed:  ${workspace.removed.length}`);
  const show = (label, xs) => {
    if (!xs.length) return;
    lines.push(`  ${label}:`);
    for (const p of xs.slice(0, 10)) lines.push(`    - ${p}`);
    if (xs.length > 10) lines.push(`    (+${xs.length - 10} more)`);
  };
  show("new", workspace.added);
  show("changed", workspace.modified);
  show("gone", workspace.removed);

  // ---- inquiry section ----
  lines.push("");
  lines.push(`## inquiry`);
  const cov = inquiry.tier_coverage;
  lines.push(
    `- tier coverage: material=${cov.material} social=${cov.social} spiritual=${cov.spiritual} meta=${cov.meta} unknown=${cov.unknown}`
  );
  if (inquiry.quiet_hours) {
    lines.push(`- quiet hours — no new question minted this tick`);
  }
  // Any open inquiry that is not yet escalated and not already minted this
  // tick is a "still pending" one the agent should re-ask if it never sent it
  // (e.g. it replied HEARTBEAT_OK on the tick that minted it).
  const carriedOpen = inquiry.open.filter(
    (q) =>
      !q.escalate_to_web &&
      (!inquiry.newly_minted || q.id !== inquiry.newly_minted.id)
  );

  // Required action: ASK the user this tick.
  const mustAsk = inquiry.newly_minted ?? carriedOpen[0] ?? null;
  if (mustAsk) {
    const q = mustAsk;
    lines.push(``);
    lines.push(`### !!! REQUIRED_ACTION: ASK_THE_USER_NOW !!!`);
    lines.push(
      `This is a material event. Do NOT reply HEARTBEAT_OK this tick. You MUST send the user a message.`
    );
    lines.push(``);
    lines.push(`Send verbatim, or with a light "Quick self-check:" prefix:`);
    lines.push(``);
    lines.push(`    ${q.question}`);
    lines.push(``);
    lines.push(`Metadata: id=${q.id} tier=${q.tier} ticks=${q.tick_count}`);
    lines.push(
      `After they answer (next turn or later): \`node ~/.openclaw/workspace/skills/chat-self-heartbeat/scripts/tick.js --answer ${q.id}\` then feed the answer into chat-self-observer → chat-self-curator → chat-self-confirmer → chat-self-persister to create a tier-${q.tier} Sense.`
    );
  }

  // Escalations: repeat REQUIRED_ACTION on **every** tick while the inquiry stays
  // open and escalated. (Only using newly_escalated would fire once; the agent could
  // miss that tick and then see no ESCALATE block forever while escalate_to_web stays true.)
  const escalatedOpen = inquiry.open.filter((q) => q.escalate_to_web);
  if (escalatedOpen.length > 0) {
    lines.push(``);
    for (const q of escalatedOpen) {
      const justCrossed = inquiry.newly_escalated.some((n) => n.id === q.id);
      lines.push(`### !!! REQUIRED_ACTION: ESCALATE_TO_WEB !!!`);
      lines.push(
        justCrossed
          ? `Inquiry ${q.id} (tier=${q.tier}) just crossed the silence threshold (${q.tick_count} ticks).`
          : `Inquiry ${q.id} (tier=${q.tier}) is still escalated (${q.tick_count} ticks, no user answer yet).`
      );
      lines.push(`Question: "${q.question}"`);
      lines.push(
        `You MUST run at least one web search (web_fetch / browser / provider web tool) this heartbeat turn before sending HEARTBEAT_OK.`
      );
      lines.push(
        `Search how humans shape the "${q.tier}" aspect of self (e.g. "${q.tier} self identity habit").`
      );
      lines.push(
        `Synthesise 1-3 candidate answers, propose the most grounded one via chat-self-confirmer,`
      );
      lines.push(
        `and when the user next appears show them what you found and close with \`--answer ${q.id}\`.`
      );
    }
  }

  // Also list any other still-open inquiries so nothing silently falls on the floor.
  const others = carriedOpen.filter((q) => !mustAsk || q.id !== mustAsk.id);
  if (others.length > 0) {
    lines.push(``);
    lines.push(`- other open inquiries (for context):`);
    for (const q of others) {
      lines.push(
        `  - ${q.id} (tier=${q.tier}, ticks=${q.tick_count}${q.escalate_to_web ? ", escalated" : ""}): "${q.question}"`
      );
    }
  }

  return lines.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const asJson = args.has("--json");
  const skipDiff = args.has("--no-diff");
  const skipDecay = args.has("--no-decay");
  const skipInquiry = args.has("--no-inquiry");

  // --answer <id> [notes...] path — closes an open inquiry.
  const answerIdx = argv.indexOf("--answer");
  if (answerIdx !== -1) {
    const id = argv[answerIdx + 1];
    if (!id) throw new Error("--answer requires an inquiry id");
    const notes = argv.slice(answerIdx + 2).join(" ");
    const row = markAnswered(id, notes);
    if (asJson) {
      process.stdout.write(JSON.stringify(row, null, 2) + "\n");
    } else {
      process.stdout.write(`closed inquiry ${row.id} (tier=${row.tier})\n`);
    }
    return;
  }

  const curator = loadCurator();
  const tickAt = new Date().toISOString();

  const decay = skipDecay
    ? { packages: [], changes: [] }
    : decayPass(curator);

  let workspace = { added: [], removed: [], modified: [] };
  if (!skipDiff) {
    const prev = readPrevSnapshot();
    const next = snapshotWorkspace();
    workspace = prev ? diffSnapshot(prev, next) : { added: [], removed: [], modified: [], firstRun: true };
    writeSnapshot(next);
  }

  const packages = listSensePackages();
  const inquiry = skipInquiry
    ? { tier_coverage: tierCoverage(packages), newly_minted: null, newly_escalated: [], open: [], quiet_hours: false }
    : inquiryPass(packages);

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LAST_TICK_FILE, JSON.stringify({ tickAt }, null, 2), "utf8");

  if (asJson) {
    process.stdout.write(JSON.stringify({ tickAt, decay, workspace, inquiry }, null, 2) + "\n");
  } else {
    process.stdout.write(formatReport({ tickAt, decay, workspace, inquiry }) + "\n");
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[chat-self-heartbeat] error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  listSensePackages,
  decayPass,
  snapshotWorkspace,
  diffSnapshot,
  readPrevSnapshot,
  writeSnapshot,
  formatReport,
  // inquiry surface
  QUESTION_CATALOGUE,
  ALL_TIERS,
  tierCoverage,
  nextTierToDevelop,
  readInquiries,
  writeInquiries,
  inquiryPass,
  markAnswered,
  isQuietHour
};
