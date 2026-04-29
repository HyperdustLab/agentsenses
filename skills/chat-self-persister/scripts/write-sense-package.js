/**
 * Persist a confirmed sense candidate to the workspace `senses/` directory.
 *
 * Spec: specification/CHAT_DEVELOPED_AGENT.md §4.4 (Persister) and §8 (IEM).
 *
 * Writes:
 *   <sensesRoot>/<tier>/<name>/SENSE.md
 *
 * Invariants:
 *   - never writes outside sensesRoot
 *   - never writes under sensesRoot/.constitution/
 *   - never creates an executable `scripts/` subfolder in the MVP
 *   - appends one JSONL line to sensesRoot/.audit.log per action
 *   - refuses to overwrite an existing stable/core sense without a `replace` flag
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ALLOWED_TIERS = new Set(["material", "social", "spiritual", "meta"]);
const FORBIDDEN_TIERS = new Set([".constitution", "constitution"]);

function assertInsideRoot(abs, root) {
  const r = path.resolve(root);
  const a = path.resolve(abs);
  if (a !== r && !a.startsWith(r + path.sep)) {
    throw new Error(`refused: path ${a} escapes senses root ${r}`);
  }
}

function assertSafeTier(tier) {
  if (FORBIDDEN_TIERS.has(tier)) {
    throw new Error(`refused: tier "${tier}" is the immutable "I" layer`);
  }
  if (!ALLOWED_TIERS.has(tier)) {
    throw new Error(
      `refused: tier "${tier}" not in {${[...ALLOWED_TIERS].join(", ")}}`
    );
  }
}

function assertSafeName(name) {
  if (typeof name !== "string" || !/^[a-z0-9]([a-z0-9_-]{0,62}[a-z0-9])?$/.test(name)) {
    throw new Error(`refused: invalid sense name "${name}"`);
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readFileIfExists(abs) {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

function ensureDir(abs, root) {
  assertInsideRoot(abs, root);
  fs.mkdirSync(abs, { recursive: true });
}

function appendAudit(root, record) {
  const logPath = path.join(root, ".audit.log");
  assertInsideRoot(logPath, root);
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n";
  fs.appendFileSync(logPath, line, "utf8");
}

function detectExistingState(sensesRoot, tier, name) {
  const dir = path.join(sensesRoot, tier, name);
  const file = path.join(dir, "SENSE.md");
  const text = readFileIfExists(file);
  if (!text) return null;
  const match = text.match(/\bstate:\s*(staging|probation|stable|core|archive)/);
  return {
    exists: true,
    path: file,
    text,
    hash: sha256(text),
    state: match ? match[1] : "probation"
  };
}

/**
 * Main entry. Takes the Curator's output contract and persists it.
 *
 * @param {{ sensesRoot: string, tier: string, name: string,
 *           sense_md_text: string, metadata: object, approver?: string,
 *           replace?: boolean }} args
 * @returns {{ path: string, audit_id: string, action: string }}
 */
function persist(args) {
  const {
    sensesRoot,
    tier,
    name,
    sense_md_text,
    metadata = {},
    approver = "user",
    replace = false
  } = args;

  if (typeof sensesRoot !== "string" || !sensesRoot) {
    throw new Error("sensesRoot required");
  }
  assertSafeTier(tier);
  assertSafeName(name);
  if (typeof sense_md_text !== "string" || !sense_md_text.trim()) {
    throw new Error("sense_md_text required");
  }
  if (/\n\s*scripts\s*:/.test(sense_md_text) || /executable\s*:/.test(sense_md_text)) {
    throw new Error(
      "refused: MVP Persister does not accept executable advice (see spec §13 stage 4)"
    );
  }

  const targetDir = path.join(sensesRoot, tier, name);
  const targetFile = path.join(targetDir, "SENSE.md");
  assertInsideRoot(targetDir, sensesRoot);

  const existing = detectExistingState(sensesRoot, tier, name);
  if (existing && !replace) {
    if (existing.state === "stable" || existing.state === "core") {
      throw new Error(
        `refused: sense "${name}" is ${existing.state}; use Confirmer merge/replace flow`
      );
    }
  }

  ensureDir(targetDir, sensesRoot);
  fs.writeFileSync(targetFile, sense_md_text, "utf8");

  const audit_id = sha256(
    `${targetFile}:${new Date().toISOString()}:${approver}`
  ).slice(0, 16);

  appendAudit(sensesRoot, {
    action: existing ? "update" : "create",
    candidate: name,
    tier,
    approver,
    path: path.relative(sensesRoot, targetFile),
    prev_hash: existing?.hash ?? null,
    new_hash: sha256(sense_md_text),
    metadata,
    audit_id
  });

  return {
    path: targetFile,
    audit_id,
    action: existing ? "update" : "create"
  };
}

/**
 * Move a sense directory to `.archive/` (soft delete, preserves history).
 */
function archive({ sensesRoot, tier, name, approver = "user" }) {
  assertSafeTier(tier);
  assertSafeName(name);
  const src = path.join(sensesRoot, tier, name);
  assertInsideRoot(src, sensesRoot);
  if (!fs.existsSync(src)) {
    throw new Error(`sense "${tier}/${name}" does not exist`);
  }
  const dstDir = path.join(sensesRoot, ".archive", tier);
  ensureDir(dstDir, sensesRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = path.join(dstDir, `${name}.${stamp}`);
  fs.renameSync(src, dst);

  const audit_id = sha256(`${dst}:${stamp}:${approver}`).slice(0, 16);
  appendAudit(sensesRoot, {
    action: "archive",
    candidate: name,
    tier,
    approver,
    path: path.relative(sensesRoot, dst),
    audit_id
  });
  return { path: dst, audit_id };
}

/**
 * Stage a candidate without installing it (→ `.staging/<tier>/<name>/`).
 * Useful for "defer" on the Confirmer card.
 */
function stage(args) {
  const { sensesRoot, tier, name, sense_md_text, approver = "user" } = args;
  assertSafeTier(tier);
  assertSafeName(name);
  const dir = path.join(sensesRoot, ".staging", tier, name);
  ensureDir(dir, sensesRoot);
  const file = path.join(dir, "SENSE.md");
  fs.writeFileSync(file, sense_md_text, "utf8");
  const audit_id = sha256(`${file}:${new Date().toISOString()}:${approver}`).slice(
    0,
    16
  );
  appendAudit(sensesRoot, {
    action: "stage",
    candidate: name,
    tier,
    approver,
    path: path.relative(sensesRoot, file),
    audit_id
  });
  return { path: file, audit_id };
}

module.exports = {
  ALLOWED_TIERS,
  FORBIDDEN_TIERS,
  persist,
  archive,
  stage,
  assertSafeTier,
  assertSafeName
};
