import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "yaml";

/**
 * **AspectJ-style logical join points** (agent / OpenClaw mapping):
 *
 * | Logical kind | AspectJ analogue | Typical OpenClaw hook (internal) |
 * |----------------|------------------|----------------------------------|
 * | `preinitialization` | pre-initialization | first `before_prompt_build` only, early pass |
 * | `staticinitialization` | static initialization | first `before_prompt_build` only, after preinit |
 * | `execution` | method execution | `before_prompt_build` (main pass) |
 * | `initialization` | instance initialization / ctor body | `before_agent_start` |
 * | `call` | method call | `before_tool_call` |
 * | `get` | field read (payload bound for model) | `llm_input` |
 * | `set` | field write (outgoing assistant text) | `message_sending` |
 * | `handler` | exception handler | `error` (if Concern Client exposes it) |
 * | `adviceexecution` | advice execution | reserved (no hook yet) |
 * | `synchronization_lock` / `synchronization_unlock` | lock points | reserved (no hook yet) |
 *
 * Legacy alias: `jointpoint == "prompt"` ≡ **`execution`**.
 * Pointcut designators: `execution("execution")`, `within(...)`, `jointpoint ==`, `jointpoint in`, and no-arg
 * `execution()`, `call()`, `get()`, `set()`, … matching the current `ctx.jointpoint`.
 * Plain lines = natural-language substring (or `/regex/flags`) on `ctx.verbHaystack`.
 * **`all_of` / `any_of` / `not` may mix freely**: e.g. `jointpoint == "execution"` with `skill == "web_answer"` and
 *   `task.requires_web == true` in the same lists as natural-language phrases — every entry is one `evalCondition` atom.
 */
/** Main model-step join (AspectJ *execution* analogue). */
const HOOK_EXECUTION = "before_prompt_build" as const;
/** Pre-run model/provider resolution (hard switch point). */
const HOOK_MODEL_RESOLVE = "before_model_resolve" as const;
/** Agent / session start (*initialization*). */
const HOOK_INITIALIZATION = "before_agent_start" as const;
/** Tool / skill invocation (*call*). */
const HOOK_CALL = "before_tool_call" as const;
/** Final provider-bound payload (*get*). */
const HOOK_GET = "llm_input" as const;
/** Outgoing user-visible message (*set*). */
const HOOK_SET = "message_sending" as const;
/** Exception path (*handler*). */
const HOOK_HANDLER = "error" as const;

/** Canonical logical join point ids (subset mirrors AspectJ join point kinds). */
const JOINT_POINT = {
  preinitialization: "preinitialization",
  staticinitialization: "staticinitialization",
  execution: "execution",
  initialization: "initialization",
  call: "call",
  get: "get",
  set: "set",
  handler: "handler",
  adviceexecution: "adviceexecution",
  synchronization_lock: "synchronization_lock",
  synchronization_unlock: "synchronization_unlock"
} as const;

type AdviceKind = "before" | "after" | "around";
type ExecutableHookName =
  | "before_model_resolve"
  | "before_prompt_build"
  | "before_agent_start"
  | "before_tool_call"
  | "message_sending";
type ExecutableHookConfig = {
  script?: string;
  timeout_ms?: number;
};
type ExecutableConfig = Partial<Record<ExecutableHookName, ExecutableHookConfig>>;

type SenseMeta = {
  name: string;
  description?: string;
  /** Ignored in the prompt-only weave phase (injection site is fixed internally). */
  jointpoints?: string[];
  /** AspectJ @Before | @After | @Around — if omitted, `mode` or default `before` is used. */
  advice?: { kind?: AdviceKind };
  pointcut?: {
    all_of?: string[];
    any_of?: string[];
    not?: string[];
  };
  priority?: number;
  mode?: "before" | "after" | "around";
  modulation?: {
    type?: "inhibitory" | "excitatory" | "gating" | "mixed";
  };
  executable?: ExecutableConfig;
  packageDir?: string;
  prompt?: string;
};

const SENSE_RESOURCE_DIRS = ["scripts", "references", "assets"] as const;
const MAX_SENSE_RESOURCE_LIST = 64;

function effectiveAdviceKind(meta: SenseMeta): AdviceKind {
  const k = meta.advice?.kind ?? meta.mode ?? "before";
  if (k === "after" || k === "around") return k;
  return "before";
}

function normalizeAspectMeta(meta: SenseMeta): void {
  if (!meta.advice?.kind && meta.mode) {
    meta.advice = { ...meta.advice, kind: meta.mode };
  } else if (!meta.advice?.kind) {
    meta.advice = { kind: "before" };
  }
}

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Single-file concern format (like skills): YAML frontmatter + markdown body as prompt.
 * Prefer **`CONCERN.md`**; `concern.md` is still read as a legacy fallback.
 */
function parseSenseMd(raw: string, dir: string): SenseMeta | null {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return null;

  const afterOpen = text.slice(3).replace(/^\r?\n/, "");
  const closeIdx = afterOpen.search(/\r?\n---\r?\n/);
  if (closeIdx === -1) {
    console.warn(`[openclaw-concerns] CONCERN.md missing closing --- at ${dir}`);
    return null;
  }

  const yamlBlock = afterOpen.slice(0, closeIdx).trim();
  const body = afterOpen.slice(closeIdx).replace(/^\r?\n---\r?\n/, "").trim();

  try {
    const meta = yaml.parse(yamlBlock) as SenseMeta;
    if (!meta?.name) {
      console.warn(`[openclaw-concerns] CONCERN.md missing name at ${dir}`);
      return null;
    }
    meta.prompt = body;
    meta.packageDir = dir;
    normalizeAspectMeta(meta);
    return meta;
  } catch (err) {
    console.warn(`[openclaw-concerns] Failed to parse CONCERN.md YAML at ${dir}:`, err);
    return null;
  }
}

function loadSenseFromDir(dir: string): SenseMeta | null {
  const senseMdPreferred = path.join(dir, "CONCERN.md");
  const senseMdLegacy = path.join(dir, "concern.md");
  const senseMdRaw = readFileSafe(senseMdPreferred) ?? readFileSafe(senseMdLegacy);
  if (senseMdRaw) {
    return parseSenseMd(senseMdRaw, dir);
  }

  const metaPath = path.join(dir, "concern.yaml");
  const promptPath = path.join(dir, "prompt.md");
  const metaRaw = readFileSafe(metaPath);
  const promptRaw = readFileSafe(promptPath);
  if (!metaRaw || !promptRaw) return null;

  try {
    const meta = yaml.parse(metaRaw) as SenseMeta;
    meta.prompt = promptRaw.trim();
    meta.packageDir = dir;
    normalizeAspectMeta(meta);
    return meta;
  } catch (err) {
    console.warn(`[openclaw-concerns] Failed to parse legacy concern at ${dir}:`, err);
    return null;
  }
}

function loadSenses(workspacePath: string): SenseMeta[] {
  // api.resolvePath("concerns") may already return ".../concerns".
  // Normalize both workspace-root and concerns-dir inputs here.
  const sensesDir =
    path.basename(workspacePath) === "concerns"
      ? workspacePath
      : path.join(workspacePath, "concerns");
  if (!fs.existsSync(sensesDir)) return [];

  const entries = fs.readdirSync(sensesDir, { withFileTypes: true });
  const concerns: SenseMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dir = path.join(sensesDir, entry.name);
    const concern = loadSenseFromDir(dir);
    if (concern) concerns.push(concern);
  }

  return concerns;
}

const MAX_VERB_HAYSTACK_CHARS = 120_000;

function messageContentToText(msg: any): string {
  if (!msg || typeof msg !== "object") return "";
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part: unknown) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const p = part as { type?: string; text?: string };
          if (p.type === "text" && typeof p.text === "string") return p.text;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  if (typeof (msg as { text?: string }).text === "string") {
    return (msg as { text: string }).text;
  }
  return "";
}

/**
 * All text that may be sent toward / interpreted by the model for this step
 * (user, assistant, tool results, bodies, tool name/params). Used for natural-language pointcut matching.
 */
function buildVerbHaystack(event: any): string {
  const parts: string[] = [];
  const push = (s: unknown) => {
    if (typeof s === "string" && s.trim()) parts.push(s.trim());
  };

  push(event?.prompt);
  push(event?.systemPrompt);
  push(event?.body);
  push(event?.bodyForAgent);

  const msgs = event?.messages ?? event?.historyMessages;
  if (Array.isArray(msgs)) {
    const cap = 48;
    const slice = msgs.length > cap ? msgs.slice(-cap) : msgs;
    for (const m of slice) {
      push(messageContentToText(m));
    }
  }

  if (event?.message && typeof event.message === "object") {
    push(messageContentToText(event.message));
  } else if (typeof event?.message === "string") {
    push(event.message);
  }

  if (typeof event?.toolName === "string" && event.toolName) {
    push(`tool:${event.toolName}`);
  }
  if (event?.params !== undefined && event?.params !== null) {
    push(
      typeof event.params === "object" ? JSON.stringify(event.params) : String(event.params)
    );
  }

  let out = parts.join("\n\n");
  if (out.length > MAX_VERB_HAYSTACK_CHARS) {
    out = out.slice(-MAX_VERB_HAYSTACK_CHARS);
  }
  return out;
}

function collectCandidateSenseDirs(basePaths: Array<string | undefined>): string[] {
  const dirs = new Set<string>();

  for (const base of basePaths) {
    if (!base || typeof base !== "string") continue;
    const trimmed = base.trim();
    if (!trimmed) continue;
    if (path.basename(trimmed) === "concerns") {
      dirs.add(trimmed);
    } else {
      dirs.add(path.join(trimmed, "concerns"));
    }
  }

  // Heuristic fallback: scan one level under HOME for */concerns.
  const home = process.env.HOME;
  if (home && fs.existsSync(home)) {
    // OpenClaw default workspace path (hidden dir) should always be considered.
    dirs.add(path.join(home, ".openclaw", "workspace", "concerns"));
    try {
      const entries = fs.readdirSync(home, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".")) continue;
        dirs.add(path.join(home, entry.name, "concerns"));
      }
    } catch {
      // ignore home scan errors
    }
  }

  return Array.from(dirs);
}

/** `prompt` in pointcuts is treated as `execution` (legacy alias). */
function canonicalJointPointName(name: string): string {
  const n = name.trim();
  if (n === "prompt") return JOINT_POINT.execution;
  return n;
}

function jointPointNameMatches(ctxJp: string, declared: string): boolean {
  return canonicalJointPointName(ctxJp) === canonicalJointPointName(declared);
}

function outgoingTextFromEvent(event: any): string {
  if (typeof event?.content === "string") return event.content;
  if (typeof event?.text === "string") return event.text;
  if (typeof event?.message?.content === "string") return event.message.content;
  if (typeof event?.message?.text === "string") return event.message.text;
  if (typeof event?.body === "string") return event.body;
  if (typeof event?.bodyForAgent === "string") return event.bodyForAgent;
  return "";
}

function buildOutgoingPatch(event: any, merged: string): Record<string, any> {
  const patch: Record<string, any> = {};
  if (typeof event?.content === "string") patch.content = merged;
  if (typeof event?.text === "string") patch.text = merged;
  if (typeof event?.body === "string") patch.body = merged;
  if (typeof event?.bodyForAgent === "string") patch.bodyForAgent = merged;
  if (event?.message && typeof event.message === "object") {
    if (typeof event.message.content === "string") {
      patch.message = { ...event.message, content: merged };
    } else if (typeof event.message.text === "string") {
      patch.message = { ...event.message, text: merged };
    }
  }
  if (!Object.keys(patch).length) {
    patch.content = merged;
    patch.text = merged;
  }
  return patch;
}

function buildPointcutContext(event: any, jointpoint: string): any {
  const lastContent = event?.messages?.at?.(-1)?.content;
  const promptText =
    typeof event?.prompt === "string"
      ? event.prompt
      : typeof lastContent === "string"
        ? lastContent
        : typeof event?.message?.content === "string"
          ? event.message.content
          : "";

  const lower = promptText.toLowerCase();
  const requiresWeb =
    /\b(search|web|latest|news|current|today|look up|browse|official site|browser)\b/i.test(
      promptText
    );

  const skillFromTool =
    typeof event?.toolName === "string" && event.toolName.length > 0
      ? event.toolName
      : null;

  let verbHaystack = buildVerbHaystack(event);
  if (jointpoint === JOINT_POINT.set) {
    const out = outgoingTextFromEvent(event);
    if (out) verbHaystack = [out, verbHaystack].filter(Boolean).join("\n\n");
  }

  return {
    userPrompt: promptText,
    verbHaystack,
    task: {
      requires_web: requiresWeb,
    },
    skill:
      event?.agent?.selectedSkill ??
      event?.selectedSkill ??
      skillFromTool ??
      (lower.includes("web") || lower.includes("search") ? "web_answer" : null),
    jointpoint
  };
}

/**
 * `/body/flags` only; flags must be a subset of gimsuy. Otherwise treated as substring.
 */
function matchVerbPattern(expr: string, haystack: string): boolean {
  const p = expr.trim();
  if (!p) return false;
  if (p.startsWith("/")) {
    const lastSlash = p.lastIndexOf("/");
    if (lastSlash <= 0) return false;
    const body = p.slice(1, lastSlash);
    const flags = p.slice(lastSlash + 1);
    if (flags && !/^[gimsuy]*$/.test(flags)) {
      return haystack.toLowerCase().includes(p.toLowerCase());
    }
    try {
      return new RegExp(body, flags).test(haystack);
    } catch {
      return false;
    }
  }
  return haystack.toLowerCase().includes(p.toLowerCase());
}

function adviceAppliesAtWeave(concern: SenseMeta): boolean {
  const kind = effectiveAdviceKind(concern);
  return kind === "before" || kind === "around";
}

function matchSensesForJointPoint(concerns: SenseMeta[], ctx: any): SenseMeta[] {
  const matched = concerns.filter((concern) => {
    if (!adviceAppliesAtWeave(concern)) return false;
    return matchesPointcut(concern.pointcut, ctx);
  });

  matched.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return matched;
}

const PROMPT_MUTATION_FIELDS = [
  "systemPrompt",
  "prependContext",
  "prependSystemContext",
  "appendSystemContext"
] as const;
const TOOL_CALL_FIELDS = ["params", "block", "blockReason", "requireApproval"] as const;
const MESSAGE_MUTATION_FIELDS = [
  "content",
  "text",
  "body",
  "bodyForAgent",
  "message"
] as const;

function pickAllowedFields(result: SenseExecutableResult, fields: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (result[f] !== undefined) out[f] = result[f];
  }
  return out;
}

async function runExecutableForMatchedSenses(
  api: any,
  matched: SenseMeta[],
  hook: ExecutableHookName,
  jointpoint: string,
  event: any,
  pointcutCtx: any
): Promise<Array<{ concern: SenseMeta; result: SenseExecutableResult }>> {
  const out: Array<{ concern: SenseMeta; result: SenseExecutableResult }> = [];
  for (const concern of matched) {
    try {
      const res = await runSenseExecutable(concern, hook, jointpoint, event, pointcutCtx);
      if (res) out.push({ concern, result: res });
    } catch (err) {
      api.logger?.warn?.(
        `[openclaw-concerns] executable @${hook} failed for ${concern.name}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
  return out;
}

function parseQuotedList(inner: string): string[] {
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** AspectJ-style no-arg designators: `call()`, `get()`, `execution()`, … */
function noArgDesignatorJoint(cond: string): string | null {
  const c = cond.replace(/\s+/g, " ").trim();
  const tests: Array<[RegExp, string]> = [
    [/^call\s*\(\s*\)$/i, JOINT_POINT.call],
    [/^get\s*\(\s*\)$/i, JOINT_POINT.get],
    [/^set\s*\(\s*\)$/i, JOINT_POINT.set],
    [/^execution\s*\(\s*\)$/i, JOINT_POINT.execution],
    [/^initialization\s*\(\s*\)$/i, JOINT_POINT.initialization],
    [/^preinitialization\s*\(\s*\)$/i, JOINT_POINT.preinitialization],
    [/^staticinitialization\s*\(\s*\)$/i, JOINT_POINT.staticinitialization],
    [/^handler\s*\(\s*\)$/i, JOINT_POINT.handler],
    [/^adviceexecution\s*\(\s*\)$/i, JOINT_POINT.adviceexecution],
    [/^synchronization_lock\s*\(\s*\)$/i, JOINT_POINT.synchronization_lock],
    [/^synchronization_unlock\s*\(\s*\)$/i, JOINT_POINT.synchronization_unlock]
  ];
  for (const [re, j] of tests) {
    if (re.test(c)) return j;
  }
  return null;
}

function evalCondition(cond: string, ctx: any): boolean {
  const c = cond.trim();
  const jp = String(ctx?.jointpoint ?? "");

  const execQuoted = c.match(/^\s*execution\s*\(\s*["']([^"']+)["']\s*\)\s*$/i);
  if (execQuoted) {
    return jointPointNameMatches(jp, execQuoted[1]);
  }

  const within = c.match(/^\s*within\s*\(\s*([^)]+)\s*\)\s*$/i);
  if (within) {
    const names = parseQuotedList(within[1]);
    return names.some((n) => jointPointNameMatches(jp, n));
  }

  const jIn = c.match(/^\s*jointpoint\s+in\s*\(\s*([^)]+)\s*\)\s*$/i);
  if (jIn) {
    const names = parseQuotedList(jIn[1]);
    return names.some((n) => jointPointNameMatches(jp, n));
  }

  const jEqDouble = c.match(/^\s*jointpoint\s*==\s*"([^"]+)"\s*$/);
  const jEqSingle = c.match(/^\s*jointpoint\s*==\s*'([^']+)'\s*$/);
  const jEq = jEqDouble ?? jEqSingle;
  if (jEq) {
    return jointPointNameMatches(jp, jEq[1]);
  }

  const noArgJp = noArgDesignatorJoint(c);
  if (noArgJp !== null) {
    return jp === noArgJp;
  }

  if (c === "task.requires_web == true") {
    return !!ctx?.task?.requires_web;
  }

  if (c === 'skill == "web_answer"') {
    return ctx?.skill === "web_answer";
  }

  if (c === 'skill == "browser"') {
    return ctx?.skill === "browser";
  }

  return matchNaturalLanguagePointcut(c, ctx);
}

/** Plain text or `/regex/flags` against `ctx.verbHaystack` (substring, case-insensitive unless regex says otherwise). */
function matchNaturalLanguagePointcut(expr: string, ctx: any): boolean {
  const phrase = expr.trim();
  if (!phrase) return false;
  const hay = String(ctx?.verbHaystack ?? "");
  if (phrase.startsWith("/")) {
    return matchVerbPattern(phrase, hay);
  }
  return hay.toLowerCase().includes(phrase.toLowerCase());
}

function matchesPointcut(pointcut: SenseMeta["pointcut"], ctx: any): boolean {
  if (!pointcut) return true;

  const allOf = pointcut.all_of ?? [];
  const anyOf = pointcut.any_of ?? [];
  const notOf = pointcut.not ?? [];

  if (allOf.length && !allOf.every((x) => evalCondition(x, ctx))) {
    return false;
  }

  if (anyOf.length && !anyOf.some((x) => evalCondition(x, ctx))) {
    return false;
  }

  if (notOf.length && notOf.some((x) => evalCondition(x, ctx))) {
    return false;
  }

  return true;
}

function buildSenseBlock(concerns: SenseMeta[]): string {
  const parts: string[] = [];

  parts.push("The following Concerns are active for this run.");
  parts.push("They are crosscutting modulation instructions and must be followed.");

  for (const s of concerns) {
    const adv = effectiveAdviceKind(s);
    const advLabel = `@${adv.charAt(0).toUpperCase()}${adv.slice(1)}`;
    parts.push(
      [
        `[Concern / Aspect: ${s.name}]`,
        `[Advice: ${advLabel}]`,
        s.description ? `Description: ${s.description}` : "",
        s.modulation?.type ? `Modulation: ${s.modulation.type}` : "",
        buildSenseResourceIndex(s),
        s.prompt ?? ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return parts.join("\n\n");
}

function walkFilesRecursive(baseDir: string, relDir: string, acc: string[], cap: number): void {
  if (acc.length >= cap) return;
  const abs = path.join(baseDir, relDir);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (acc.length >= cap) break;
    const nextRel = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      walkFilesRecursive(baseDir, nextRel, acc, cap);
      continue;
    }
    if (entry.isFile()) {
      acc.push(nextRel);
    }
  }
}

function listSenseResources(concern: SenseMeta): string[] {
  const base = concern.packageDir;
  if (!base) return [];
  const out: string[] = [];
  for (const d of SENSE_RESOURCE_DIRS) {
    if (out.length >= MAX_SENSE_RESOURCE_LIST) break;
    const abs = path.join(base, d);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    walkFilesRecursive(base, d, out, MAX_SENSE_RESOURCE_LIST);
  }
  return out.sort();
}

function buildSenseResourceIndex(concern: SenseMeta): string {
  const base = concern.packageDir;
  if (!base) return "";
  const resources = listSenseResources(concern);
  if (!resources.length) return `Concern directory: ${base}`;
  return [
    `Concern directory: ${base}`,
    "<sense_resources>",
    ...resources.map((p) => `- ${p}`),
    "</sense_resources>"
  ].join("\n");
}

function buildUserVisibleNotice(_senses: SenseMeta[]): string {
  // User requested: keep concerns active but suppress verbose NOTICE blocks.
  return "";
}

function buildRenderedNotice(_senses: SenseMeta[]): string {
  // User requested: keep concerns active but suppress verbose NOTICE blocks.
  return "";
}

function _buildUserVisibleNoticeDisabledReference(concerns: SenseMeta[]): string {
  const names = concerns.map((s) => s.name).join(", ");
  const descriptions = concerns
    .map((s) => `- ${s.name}: ${s.description ?? "(no description provided)"}`)
    .join("\n");

  return [
    "SYSTEM INSTRUCTION: The next assistant response MUST begin with the following notice exactly as written.",
    `NOTICE: The following concern rules were triggered for this response: ${names}`,
    descriptions,
    "The assistant must not omit, shorten, or hide this notice.",
    "This notice should be the first visible text in the response."
  ]
    .filter(Boolean)
    .join("\n");
}
function _buildRenderedNoticeDisabledReference(concerns: SenseMeta[]): string {
  const names = concerns.map((s) => s.name).join(", ");
  const descriptions = concerns
    .map((s) => `- ${s.name}: ${s.description ?? "(no description provided)"}`)
    .join("\n");

  return [
    `NOTICE: The following concern rules were triggered for this response: ${names}`,
    descriptions
  ]
    .filter(Boolean)
    .join("\n");
}

type SenseExecutableInput = {
  hook: ExecutableHookName;
  jointpoint: string;
  event: any;
  pointcut: any;
  concern: {
    name: string;
    description?: string;
    packageDir?: string;
  };
};

type SenseExecutableResult = Record<string, unknown>;

type SenseExecutableModule = {
  run?: (input: SenseExecutableInput) => SenseExecutableResult | Promise<SenseExecutableResult>;
  default?: (input: SenseExecutableInput) => SenseExecutableResult | Promise<SenseExecutableResult>;
  [key: string]: unknown;
};

function resolveSenseScriptPath(concern: SenseMeta, rel: string | undefined): string | null {
  const base = concern.packageDir;
  if (!rel || !base) return null;

  const cleaned = rel.trim();
  if (!cleaned) return null;

  const resolved = path.resolve(base, cleaned);
  const scriptsDir = path.resolve(base, "scripts");
  if (!resolved.startsWith(scriptsDir + path.sep) && resolved !== scriptsDir) {
    return null;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

function executableConfigForHook(
  concern: SenseMeta,
  hook: ExecutableHookName
): ExecutableHookConfig | undefined {
  const cfg = concern.executable?.[hook];
  if (cfg?.script) return cfg;
  // Executable-by-default convention: scripts/<hook>.js or scripts/<hook-kebab>.js.
  if (concern.packageDir) {
    const candidates = [`scripts/${hook}.js`, `scripts/${hook.replaceAll("_", "-")}.js`];
    for (const rel of candidates) {
      const absolute = path.join(concern.packageDir, rel);
      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
        return { script: rel };
      }
    }
  }
  return undefined;
}

async function runSenseExecutable(
  concern: SenseMeta,
  hook: ExecutableHookName,
  jointpoint: string,
  event: any,
  pointcutCtx: any
): Promise<SenseExecutableResult | null> {
  const cfg = executableConfigForHook(concern, hook);
  const scriptPath = resolveSenseScriptPath(concern, cfg?.script);
  if (!scriptPath) return null;

  const fileUrl = pathToFileURL(scriptPath).href;
  const module = (await import(fileUrl)) as SenseExecutableModule;
  const hookFn =
    hook === "before_model_resolve"
      ? (module as any).beforeModelResolve
      : (module as any)[hook];
  const fn = hookFn ?? module.run ?? module.default;
  if (typeof fn !== "function") {
    throw new Error(`executable script must export 'run' or default function: ${scriptPath}`);
  }

  const input: SenseExecutableInput = {
    hook,
    jointpoint,
    event,
    pointcut: pointcutCtx,
    concern: {
      name: concern.name,
      description: concern.description,
      packageDir: concern.packageDir
    }
  };
  const result = await fn(input);
  if (!result || typeof result !== "object") return null;
  return result;
}

/** Merged NOTICE for concerns matched on model-bound join points. */
let pendingNoticePrefix = "";
const pendingMatchedSensesForNotice: SenseMeta[] = [];

const NOTICE_MERGE_JOINTS = new Set<string>([
  JOINT_POINT.execution,
  JOINT_POINT.initialization,
  JOINT_POINT.get
]);

/** Dedupe woven blocks per (jointpoint, concern name). */
const wovenSenseKeys = new Set<string>();

function weaveDedupeKey(jointpoint: string, senseName: string): string {
  return `${jointpoint}\t${senseName}`;
}

function mergePendingNoticeSenses(matched: SenseMeta[], jointpoint: string) {
  if (!NOTICE_MERGE_JOINTS.has(jointpoint)) return;
  for (const s of matched) {
    if (!pendingMatchedSensesForNotice.some((x) => x.name === s.name)) {
      pendingMatchedSensesForNotice.push(s);
    }
  }
  if (pendingMatchedSensesForNotice.length) {
    pendingNoticePrefix = buildRenderedNotice(pendingMatchedSensesForNotice);
  }
}

function clearPendingNoticeState() {
  pendingMatchedSensesForNotice.length = 0;
  pendingNoticePrefix = "";
}

function loadAllSenses(api: any, event: any): SenseMeta[] {
  const workspacePath = api.resolvePath("concerns");
  if (!workspacePath) return [];

  const fallbackWorkspacePath =
    typeof event?.workspacePath === "string" ? event.workspacePath : undefined;
  const cwdPath = typeof event?.cwd === "string" ? event.cwd : process.cwd();

  const candidateSenseDirs = collectCandidateSenseDirs([
    workspacePath,
    fallbackWorkspacePath,
    cwdPath
  ]);
  const existingSenseDirs = candidateSenseDirs.filter((dir) => fs.existsSync(dir));

  const allLoaded: SenseMeta[] = [];
  for (const dir of existingSenseDirs) {
    const loaded = loadSenses(dir);
    if (loaded.length > 0) {
      allLoaded.push(...loaded);
    }
  }

  const uniq = new Map<string, SenseMeta>();
  for (const concern of allLoaded) {
    const key = `${concern.name}::${concern.prompt ?? ""}`;
    if (!uniq.has(key)) uniq.set(key, concern);
  }
  return Array.from(uniq.values());
}

function getMatchedSensesAtJointPoint(api: any, event: any, jointpoint: string): {
  concerns: SenseMeta[];
  ctxObj: any;
  matched: SenseMeta[];
} {
  const concerns = loadAllSenses(api, event);
  const ctxObj = buildPointcutContext(event, jointpoint);
  const matched = matchSensesForJointPoint(concerns, ctxObj);
  return { concerns, ctxObj, matched };
}

function mergePrependReturns(parts: Array<Record<string, string>>): Record<string, string> {
  const chunks: string[] = [];
  for (const p of parts) {
    const t = (p?.prependSystemContext ?? p?.prependContext ?? "").trim();
    if (t && !chunks.includes(t)) chunks.push(t);
  }
  const merged = chunks.join("");
  return merged ? { prependSystemContext: merged, prependContext: merged } : {};
}

function buildSetSensePrefix(concerns: SenseMeta[]): string {
  if (!concerns.length) return "";
  const blocks = concerns.map((s) =>
    [`[Concern @set / field-write: ${s.name}]`, s.description ? `(${s.description})` : "", s.prompt ?? ""]
      .filter(Boolean)
      .join("\n")
  );
  return blocks.join("\n\n");
}

type WeaveJointOptions = { omitUserNotice?: boolean; skipPrependReturn?: boolean };

function weaveJointPoint(
  api: any,
  event: any,
  _ctx: any,
  jointpoint: string,
  opts?: WeaveJointOptions
): Record<string, string> {
  try {
    if (!api.resolvePath?.("concerns")) {
      api.logger?.warn?.("[openclaw-concerns] No workspace path resolved.");
      return {};
    }

    const concerns = loadAllSenses(api, event);
    if (!concerns.length) return {};

    const ctxObj = buildPointcutContext(event, jointpoint);
    const matched = matchSensesForJointPoint(concerns, ctxObj);
    if (!matched.length) return {};

    mergePendingNoticeSenses(matched, jointpoint);

    const toInject = matched.filter((s) => !wovenSenseKeys.has(weaveDedupeKey(jointpoint, s.name)));
    for (const s of toInject) wovenSenseKeys.add(weaveDedupeKey(jointpoint, s.name));
    if (!toInject.length) return {};

    api.logger?.info?.(`[openclaw-concerns] weave @${jointpoint}: ${matched.map((s) => s.name).join(", ")}`);

    if (opts?.skipPrependReturn) {
      return {};
    }

    const senseBlock = buildSenseBlock(toInject);
    const notice = opts?.omitUserNotice ? "" : buildUserVisibleNotice(toInject);
    const responseText = notice
      ? `\n\n<Concerns join="${jointpoint}">\n${senseBlock}\n</Concerns>\n\n${notice}`
      : `\n\n<Concerns join="${jointpoint}">\n${senseBlock}\n</Concerns>\n`;
    return {
      prependSystemContext: responseText,
      prependContext: responseText
    };
  } catch (err) {
    api.logger?.error?.(`[openclaw-concerns] weave @${jointpoint} failed:`, err);
    return {};
  }
}

function weaveLlmInputGet(api: any, event: any, ctx: any) {
  try {
    if (!api.resolvePath?.("concerns")) return;

    const concerns = loadAllSenses(api, event);
    if (!concerns.length) return;

    const ctxObj = buildPointcutContext(event, JOINT_POINT.get);
    const matched = matchSensesForJointPoint(concerns, ctxObj);
    if (!matched.length) return;

    mergePendingNoticeSenses(matched, JOINT_POINT.get);

    const toInject = matched.filter((s) => !wovenSenseKeys.has(weaveDedupeKey(JOINT_POINT.get, s.name)));
    for (const s of toInject) wovenSenseKeys.add(weaveDedupeKey(JOINT_POINT.get, s.name));
    if (!toInject.length) return;

    const senseBlock = buildSenseBlock(toInject);
    const notice = buildUserVisibleNotice(toInject);
    const inject = `\n\n<Concerns join="${JOINT_POINT.get}">\n${senseBlock}\n</Concerns>\n\n${notice}`;

    if (typeof event?.systemPrompt === "string") {
      event.systemPrompt = inject + event.systemPrompt;
    } else if (typeof event?.prompt === "string") {
      event.prompt = inject + event.prompt;
    }

    api.logger?.info?.(`[openclaw-concerns] weave @${JOINT_POINT.get} (llm_input): ${matched.map((s) => s.name).join(", ")}`);
  } catch (err) {
    api.logger?.error?.("[openclaw-concerns] llm_input weave failed:", err);
  }
}

/** First `before_prompt_build` in process: preinit + staticinit + execution (AspectJ ordering). */
let firstBeforePromptBuild = true;

export default function register(api: any) {
  api.on(HOOK_MODEL_RESOLVE, async (event: any, _ctx: any) => {
    try {
      if (!api.resolvePath?.("concerns")) return {};
      const concerns = loadAllSenses(api, event);
      if (!concerns.length) return {};

      const ctxObj = buildPointcutContext({ prompt: event?.prompt ?? "" }, JOINT_POINT.execution);
      const matched = matchSensesForJointPoint(concerns, ctxObj);
      if (!matched.length) return {};

      let providerOverride: string | undefined;
      let modelOverride: string | undefined;
      const execResults = await runExecutableForMatchedSenses(
        api,
        matched,
        "before_model_resolve",
        JOINT_POINT.execution,
        event,
        ctxObj
      );
      for (const { result } of execResults) {
        if (!providerOverride && typeof result.providerOverride === "string") {
          providerOverride = result.providerOverride;
        }
        if (!modelOverride && typeof result.modelOverride === "string") {
          modelOverride = result.modelOverride;
        }
      }

      if (providerOverride || modelOverride) {
        api.logger?.info?.(
          `[openclaw-concerns] executable @${HOOK_MODEL_RESOLVE}: ` +
            `provider=${providerOverride ?? "-"} model=${modelOverride ?? "-"}`
        );
        return {
          providerOverride,
          modelOverride
        };
      }
      return {};
    } catch (err) {
      api.logger?.error?.("[openclaw-concerns] executable before_model_resolve failed:", err);
      return {};
    }
  });

  api.on(HOOK_EXECUTION, async (event: any, ctx: any) => {
    const parts: Array<Record<string, string>> = [];
    if (firstBeforePromptBuild) {
      firstBeforePromptBuild = false;
      parts.push(weaveJointPoint(api, event, ctx, JOINT_POINT.preinitialization, { omitUserNotice: true }));
      parts.push(weaveJointPoint(api, event, ctx, JOINT_POINT.staticinitialization, { omitUserNotice: true }));
    }
    parts.push(weaveJointPoint(api, event, ctx, JOINT_POINT.execution));

    const merged = mergePrependReturns(parts);
    try {
      const { ctxObj, matched } = getMatchedSensesAtJointPoint(api, event, JOINT_POINT.execution);
      if (matched.length) {
        const execResults = await runExecutableForMatchedSenses(
          api,
          matched,
          "before_prompt_build",
          JOINT_POINT.execution,
          event,
          ctxObj
        );
        for (const { result } of execResults) {
          Object.assign(merged, pickAllowedFields(result, PROMPT_MUTATION_FIELDS));
        }
      }
    } catch (err) {
      api.logger?.warn?.("[openclaw-concerns] executable @before_prompt_build failed:", err);
    }
    return merged;
  });

  api.on(HOOK_INITIALIZATION, async (event: any, ctx: any) => {
    const merged = weaveJointPoint(api, event, ctx, JOINT_POINT.initialization);
    try {
      const { ctxObj, matched } = getMatchedSensesAtJointPoint(api, event, JOINT_POINT.initialization);
      if (matched.length) {
        const execResults = await runExecutableForMatchedSenses(
          api,
          matched,
          "before_agent_start",
          JOINT_POINT.initialization,
          event,
          ctxObj
        );
        for (const { result } of execResults) {
          Object.assign(merged, pickAllowedFields(result, PROMPT_MUTATION_FIELDS));
        }
      }
    } catch (err) {
      api.logger?.warn?.("[openclaw-concerns] executable @before_agent_start failed:", err);
    }
    return merged;
  });

  api.on(HOOK_CALL, async (event: any, ctx: any) => {
    weaveJointPoint(api, event, ctx, JOINT_POINT.call, { omitUserNotice: true, skipPrependReturn: true });
    try {
      const { ctxObj, matched } = getMatchedSensesAtJointPoint(api, event, JOINT_POINT.call);
      if (!matched.length) return {};
      const execResults = await runExecutableForMatchedSenses(
        api,
        matched,
        "before_tool_call",
        JOINT_POINT.call,
        event,
        ctxObj
      );
      const out: Record<string, any> = {};
      for (const { result } of execResults) {
        Object.assign(out, pickAllowedFields(result, TOOL_CALL_FIELDS));
      }
      return out;
    } catch (err) {
      api.logger?.warn?.("[openclaw-concerns] executable @before_tool_call failed:", err);
      return {};
    }
  });

  api.on(HOOK_GET, async (event: any, ctx: any) => {
    weaveLlmInputGet(api, event, ctx);
  });

  try {
    api.on?.(HOOK_HANDLER, async (event: any, ctx: any) => {
      const err = event?.error ?? event?.message ?? event;
      const synthetic = { prompt: typeof err === "string" ? err : JSON.stringify(err), messages: [] };
      weaveJointPoint(api, synthetic, ctx, JOINT_POINT.handler, { omitUserNotice: true, skipPrependReturn: true });
    });
  } catch {
    /* Concern Client may not expose error hook */
  }

  api.on(HOOK_SET, async (event: any, _ctx: any) => {
    let content = outgoingTextFromEvent(event);
    if (!content) return {};

    let concerns: SenseMeta[] = [];
    let ctxSet: any = null;
    let matchedSet: SenseMeta[] = [];
    let executablePrefix = "";
    try {
      if (api.resolvePath("concerns")) {
        const matchedState = getMatchedSensesAtJointPoint(api, event, JOINT_POINT.set);
        concerns = matchedState.concerns;
        ctxSet = matchedState.ctxObj;
        matchedSet = matchedState.matched;

        if (matchedSet.length) {
          const execResults = await runExecutableForMatchedSenses(
            api,
            matchedSet,
            "message_sending",
            JOINT_POINT.set,
            event,
            ctxSet
          );
          for (const { result } of execResults) {
            if (typeof result.prependContent === "string" && result.prependContent.trim()) {
              executablePrefix = [executablePrefix, result.prependContent.trim()]
                .filter(Boolean)
                .join("\n\n");
            }
            const patched = pickAllowedFields(result, MESSAGE_MUTATION_FIELDS);
            if (typeof patched.content === "string") {
              content = patched.content;
            } else if (typeof patched.text === "string") {
              content = patched.text;
            } else if (typeof patched.body === "string") {
              content = patched.body;
            } else if (typeof patched.bodyForAgent === "string") {
              content = patched.bodyForAgent;
            } else if (
              patched.message &&
              typeof patched.message === "object" &&
              typeof (patched.message as any).content === "string"
            ) {
              content = (patched.message as any).content;
            } else if (
              patched.message &&
              typeof patched.message === "object" &&
              typeof (patched.message as any).text === "string"
            ) {
              content = (patched.message as any).text;
            }
          }
        }
      }
    } catch {
      concerns = [];
    }

    if (!ctxSet) {
      ctxSet = buildPointcutContext(event, JOINT_POINT.set);
      matchedSet = matchSensesForJointPoint(concerns, ctxSet);
    }
    const toInjectSet = matchedSet.filter((s) => !wovenSenseKeys.has(weaveDedupeKey(JOINT_POINT.set, s.name)));
    for (const s of toInjectSet) {
      wovenSenseKeys.add(weaveDedupeKey(JOINT_POINT.set, s.name));
    }
    const setPrefix = buildSetSensePrefix(toInjectSet);

    const hasNotice = content.includes("NOTICE: The following concern rules were triggered");
    let noticePrefix = hasNotice ? "" : pendingNoticePrefix;
    if (!hasNotice && !noticePrefix) {
      // Fallback: if prompt-stage notice state was missed, reconstruct from execution matching.
      const ctxExec = buildPointcutContext(event, JOINT_POINT.execution);
      const matchedExec = matchSensesForJointPoint(concerns, ctxExec);
      if (matchedExec.length) {
        noticePrefix = buildRenderedNotice(matchedExec);
      }
    }

    const merged = [noticePrefix, executablePrefix, setPrefix, content]
      .filter(Boolean)
      .join("\n\n");

    clearPendingNoticeState();
    wovenSenseKeys.clear();

    if (merged === content) return {};
    return buildOutgoingPatch(event, merged);
  });
}