/**
 * Render a chat-sourced candidate into a valid SENSE.md string.
 *
 * Spec: specification/CHAT_DEVELOPED_AGENT.md §4.2 (Curator) and
 *       specification/SENSE_FORMAT.md (authored surface).
 *
 * The rendered document is plain text; the Persister writes it.
 */

const NAME_RE = /^[a-z0-9]([a-z0-9_-]{0,62}[a-z0-9])?$/;
const ALLOWED_TIERS = new Set(["material", "social", "spiritual", "meta"]);
const ALLOWED_KINDS = new Set(["before", "after", "around"]);
const JOINTPOINTS_BY_TIER = {
  material: ['jointpoint == "initialization"', 'jointpoint == "call"'],
  social: ['jointpoint == "set"', 'jointpoint == "call"'],
  spiritual: ['jointpoint == "execution"', 'jointpoint == "get"'],
  meta: ['jointpoint == "adviceexecution"']
};

function slugifyName(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/__+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);
}

function validateName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    throw new Error(
      `invalid sense name "${name}" (must match ${NAME_RE}, max 64 chars)`
    );
  }
}

function validateTier(tier) {
  if (!ALLOWED_TIERS.has(tier)) {
    throw new Error(
      `invalid tier "${tier}" (allowed: ${[...ALLOWED_TIERS].join(", ")})`
    );
  }
}

function validateKind(kind) {
  if (!ALLOWED_KINDS.has(kind)) {
    throw new Error(
      `invalid advice.kind "${kind}" (allowed: ${[...ALLOWED_KINDS].join(", ")})`
    );
  }
}

function defaultPointcut(tier, extras = []) {
  const base = JOINTPOINTS_BY_TIER[tier]?.slice(0, 1) ?? [];
  return { all_of: [...base, ...extras] };
}

function yamlEscape(str) {
  if (typeof str !== "string") return "";
  const needsQuote = /[:#&*!|>'"%@`]/.test(str) || /^\s|\s$/.test(str);
  if (!needsQuote) return str;
  return `'${str.replace(/'/g, "''")}'`;
}

function renderPointcut(pc, indent = "  ") {
  const lines = [];
  for (const branch of ["all_of", "any_of", "not"]) {
    const list = pc?.[branch];
    if (!Array.isArray(list) || list.length === 0) continue;
    lines.push(`${indent}${branch}:`);
    for (const item of list) {
      lines.push(`${indent}  - ${yamlEscape(String(item))}`);
    }
  }
  return lines.join("\n");
}

function renderFrontmatter(meta) {
  const lines = ["---"];
  lines.push(`name: ${meta.name}`);
  if (meta.description) lines.push(`description: ${yamlEscape(meta.description)}`);
  lines.push("advice:");
  lines.push(`  kind: ${meta.advice?.kind ?? "before"}`);
  if (typeof meta.priority === "number") lines.push(`priority: ${meta.priority}`);
  if (meta.pointcut) {
    lines.push("pointcut:");
    const pc = renderPointcut(meta.pointcut);
    if (pc) lines.push(pc);
  }
  if (meta.metadata && typeof meta.metadata === "object") {
    lines.push("metadata:");
    for (const [k, v] of Object.entries(meta.metadata)) {
      if (v === undefined || v === null) continue;
      lines.push(`  ${k}: ${yamlEscape(String(v))}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function renderBody(advice_draft, provenance) {
  const parts = [];
  if (typeof advice_draft === "string" && advice_draft.trim()) {
    parts.push(advice_draft.trim());
  } else {
    parts.push("(advice body missing — please edit before accepting)");
  }
  if (provenance && provenance.source_turns?.length) {
    parts.push("");
    parts.push("<!--");
    parts.push("Provenance (kept as a comment; not sent to the LLM):");
    parts.push(`  source_turns: ${provenance.source_turns.join(", ")}`);
    if (provenance.approver) parts.push(`  approver: ${provenance.approver}`);
    if (provenance.created_at) parts.push(`  created_at: ${provenance.created_at}`);
    parts.push("-->");
  }
  return parts.join("\n");
}

/**
 * Produce a SENSE.md string from a candidate object.
 * Candidate shape:
 *   { name, description, tier, advice_draft, pointcut?, priority?,
 *     for_me_score?, evidence_n?, state?, source_turns?, approver? }
 */
function renderSense(candidate) {
  const tier = candidate.tier ?? "spiritual";
  validateTier(tier);

  const name = slugifyName(candidate.name ?? "");
  validateName(name);

  const kind = candidate.advice?.kind ?? "before";
  validateKind(kind);

  const pointcut = candidate.pointcut ?? defaultPointcut(tier);

  const meta = {
    name,
    description: candidate.description,
    advice: { kind },
    priority: candidate.priority,
    pointcut,
    metadata: {
      tier,
      state: candidate.state ?? "probation",
      for_me_score: candidate.for_me_score,
      for_me_lcb: candidate.for_me_lcb,
      evidence_n: candidate.evidence_n,
      alpha: candidate.alpha,
      beta: candidate.beta,
      source: "chat-developed-agent"
    }
  };

  const frontmatter = renderFrontmatter(meta);
  const body = renderBody(candidate.advice_draft, {
    source_turns: candidate.source_turns,
    approver: candidate.approver,
    created_at: candidate.created_at ?? new Date().toISOString()
  });

  return `${frontmatter}\n\n${body}\n`;
}

module.exports = {
  ALLOWED_TIERS,
  JOINTPOINTS_BY_TIER,
  slugifyName,
  validateName,
  validateTier,
  defaultPointcut,
  renderSense,
  renderFrontmatter,
  renderBody
};
