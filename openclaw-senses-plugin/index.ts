import fs from "node:fs";
import path from "node:path";
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
 * | `handler` | exception handler | `error` (if Sense Client exposes it) |
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
  prompt?: string;
};

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
 * Single-file sense format (like skills): YAML frontmatter + markdown body as prompt.
 * Prefer **`SENSE.md`**; `sense.md` is still read as a legacy fallback.
 */
function parseSenseMd(raw: string, dir: string): SenseMeta | null {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return null;

  const afterOpen = text.slice(3).replace(/^\r?\n/, "");
  const closeIdx = afterOpen.search(/\r?\n---\r?\n/);
  if (closeIdx === -1) {
    console.warn(`[openclaw-senses] SENSE.md missing closing --- at ${dir}`);
    return null;
  }

  const yamlBlock = afterOpen.slice(0, closeIdx).trim();
  const body = afterOpen.slice(closeIdx).replace(/^\r?\n---\r?\n/, "").trim();

  try {
    const meta = yaml.parse(yamlBlock) as SenseMeta;
    if (!meta?.name) {
      console.warn(`[openclaw-senses] SENSE.md missing name at ${dir}`);
      return null;
    }
    meta.prompt = body;
    normalizeAspectMeta(meta);
    return meta;
  } catch (err) {
    console.warn(`[openclaw-senses] Failed to parse SENSE.md YAML at ${dir}:`, err);
    return null;
  }
}

function loadSenseFromDir(dir: string): SenseMeta | null {
  const senseMdPreferred = path.join(dir, "SENSE.md");
  const senseMdLegacy = path.join(dir, "sense.md");
  const senseMdRaw = readFileSafe(senseMdPreferred) ?? readFileSafe(senseMdLegacy);
  if (senseMdRaw) {
    return parseSenseMd(senseMdRaw, dir);
  }

  const metaPath = path.join(dir, "sense.yaml");
  const promptPath = path.join(dir, "prompt.md");
  const metaRaw = readFileSafe(metaPath);
  const promptRaw = readFileSafe(promptPath);
  if (!metaRaw || !promptRaw) return null;

  try {
    const meta = yaml.parse(metaRaw) as SenseMeta;
    meta.prompt = promptRaw.trim();
    normalizeAspectMeta(meta);
    return meta;
  } catch (err) {
    console.warn(`[openclaw-senses] Failed to parse legacy sense at ${dir}:`, err);
    return null;
  }
}

function loadSenses(workspacePath: string): SenseMeta[] {
  // api.resolvePath("senses") may already return ".../senses".
  // Normalize both workspace-root and senses-dir inputs here.
  const sensesDir =
    path.basename(workspacePath) === "senses"
      ? workspacePath
      : path.join(workspacePath, "senses");
  if (!fs.existsSync(sensesDir)) return [];

  const entries = fs.readdirSync(sensesDir, { withFileTypes: true });
  const senses: SenseMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dir = path.join(sensesDir, entry.name);
    const sense = loadSenseFromDir(dir);
    if (sense) senses.push(sense);
  }

  return senses;
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
    if (path.basename(trimmed) === "senses") {
      dirs.add(trimmed);
    } else {
      dirs.add(path.join(trimmed, "senses"));
    }
  }

  // Heuristic fallback: scan one level under HOME for */senses.
  const home = process.env.HOME;
  if (home && fs.existsSync(home)) {
    try {
      const entries = fs.readdirSync(home, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".")) continue;
        dirs.add(path.join(home, entry.name, "senses"));
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
  if (typeof event?.message?.content === "string") return event.message.content;
  return "";
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

function adviceAppliesAtWeave(sense: SenseMeta): boolean {
  const kind = effectiveAdviceKind(sense);
  return kind === "before" || kind === "around";
}

function matchSensesForJointPoint(senses: SenseMeta[], ctx: any): SenseMeta[] {
  const matched = senses.filter((sense) => {
    if (!adviceAppliesAtWeave(sense)) return false;
    return matchesPointcut(sense.pointcut, ctx);
  });

  matched.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return matched;
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

function buildSenseBlock(senses: SenseMeta[]): string {
  const parts: string[] = [];

  parts.push("The following Senses are active for this run.");
  parts.push("They are crosscutting modulation instructions and must be followed.");

  for (const s of senses) {
    const adv = effectiveAdviceKind(s);
    const advLabel = `@${adv.charAt(0).toUpperCase()}${adv.slice(1)}`;
    parts.push(
      [
        `[Sense / Aspect: ${s.name}]`,
        `[Advice: ${advLabel}]`,
        s.description ? `Description: ${s.description}` : "",
        s.modulation?.type ? `Modulation: ${s.modulation.type}` : "",
        s.prompt ?? ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return parts.join("\n\n");
}

function buildUserVisibleNotice(senses: SenseMeta[]): string {
  const names = senses.map((s) => s.name).join(", ");
  const descriptions = senses
    .map((s) => `- ${s.name}: ${s.description ?? "(no description provided)"}`)
    .join("\n");

  return [
    "SYSTEM INSTRUCTION: The next assistant response MUST begin with the following notice exactly as written.",
    `NOTICE: The following sense rules were triggered for this response: ${names}`,
    descriptions,
    "The assistant must not omit, shorten, or hide this notice.",
    "This notice should be the first visible text in the response."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRenderedNotice(senses: SenseMeta[]): string {
  const names = senses.map((s) => s.name).join(", ");
  const descriptions = senses
    .map((s) => `- ${s.name}: ${s.description ?? "(no description provided)"}`)
    .join("\n");

  return [
    `NOTICE: The following sense rules were triggered for this response: ${names}`,
    descriptions
  ]
    .filter(Boolean)
    .join("\n");
}

/** Merged NOTICE for senses matched on model-bound join points. */
let pendingNoticePrefix = "";
const pendingMatchedSensesForNotice: SenseMeta[] = [];

const NOTICE_MERGE_JOINTS = new Set<string>([
  JOINT_POINT.execution,
  JOINT_POINT.initialization,
  JOINT_POINT.get
]);

/** Dedupe woven blocks per (jointpoint, sense name). */
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
  const workspacePath = api.resolvePath("senses");
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
  for (const sense of allLoaded) {
    const key = `${sense.name}::${sense.prompt ?? ""}`;
    if (!uniq.has(key)) uniq.set(key, sense);
  }
  return Array.from(uniq.values());
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

function buildSetSensePrefix(senses: SenseMeta[]): string {
  if (!senses.length) return "";
  const blocks = senses.map((s) =>
    [`[Sense @set / field-write: ${s.name}]`, s.description ? `(${s.description})` : "", s.prompt ?? ""]
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
    if (!api.resolvePath?.("senses")) {
      api.logger?.warn?.("[openclaw-senses] No workspace path resolved.");
      return {};
    }

    const senses = loadAllSenses(api, event);
    if (!senses.length) return {};

    const ctxObj = buildPointcutContext(event, jointpoint);
    const matched = matchSensesForJointPoint(senses, ctxObj);
    if (!matched.length) return {};

    mergePendingNoticeSenses(matched, jointpoint);

    const toInject = matched.filter((s) => !wovenSenseKeys.has(weaveDedupeKey(jointpoint, s.name)));
    for (const s of toInject) wovenSenseKeys.add(weaveDedupeKey(jointpoint, s.name));
    if (!toInject.length) return {};

    api.logger?.info?.(`[openclaw-senses] weave @${jointpoint}: ${matched.map((s) => s.name).join(", ")}`);

    if (opts?.skipPrependReturn) {
      return {};
    }

    const senseBlock = buildSenseBlock(toInject);
    const notice = opts?.omitUserNotice ? "" : buildUserVisibleNotice(toInject);
    const responseText = notice
      ? `\n\n<Senses join="${jointpoint}">\n${senseBlock}\n</Senses>\n\n${notice}`
      : `\n\n<Senses join="${jointpoint}">\n${senseBlock}\n</Senses>\n`;
    return {
      prependSystemContext: responseText,
      prependContext: responseText
    };
  } catch (err) {
    api.logger?.error?.(`[openclaw-senses] weave @${jointpoint} failed:`, err);
    return {};
  }
}

function weaveLlmInputGet(api: any, event: any, ctx: any) {
  try {
    if (!api.resolvePath?.("senses")) return;

    const senses = loadAllSenses(api, event);
    if (!senses.length) return;

    const ctxObj = buildPointcutContext(event, JOINT_POINT.get);
    const matched = matchSensesForJointPoint(senses, ctxObj);
    if (!matched.length) return;

    mergePendingNoticeSenses(matched, JOINT_POINT.get);

    const toInject = matched.filter((s) => !wovenSenseKeys.has(weaveDedupeKey(JOINT_POINT.get, s.name)));
    for (const s of toInject) wovenSenseKeys.add(weaveDedupeKey(JOINT_POINT.get, s.name));
    if (!toInject.length) return;

    const senseBlock = buildSenseBlock(toInject);
    const notice = buildUserVisibleNotice(toInject);
    const inject = `\n\n<Senses join="${JOINT_POINT.get}">\n${senseBlock}\n</Senses>\n\n${notice}`;

    if (typeof event?.systemPrompt === "string") {
      event.systemPrompt = inject + event.systemPrompt;
    } else if (typeof event?.prompt === "string") {
      event.prompt = inject + event.prompt;
    }

    api.logger?.info?.(`[openclaw-senses] weave @${JOINT_POINT.get} (llm_input): ${matched.map((s) => s.name).join(", ")}`);
  } catch (err) {
    api.logger?.error?.("[openclaw-senses] llm_input weave failed:", err);
  }
}

/** First `before_prompt_build` in process: preinit + staticinit + execution (AspectJ ordering). */
let firstBeforePromptBuild = true;

export default function register(api: any) {
  api.on(HOOK_EXECUTION, async (event: any, ctx: any) => {
    const parts: Array<Record<string, string>> = [];
    if (firstBeforePromptBuild) {
      firstBeforePromptBuild = false;
      parts.push(weaveJointPoint(api, event, ctx, JOINT_POINT.preinitialization, { omitUserNotice: true }));
      parts.push(weaveJointPoint(api, event, ctx, JOINT_POINT.staticinitialization, { omitUserNotice: true }));
    }
    parts.push(weaveJointPoint(api, event, ctx, JOINT_POINT.execution));
    return mergePrependReturns(parts);
  });

  api.on(HOOK_INITIALIZATION, async (event: any, ctx: any) => {
    return weaveJointPoint(api, event, ctx, JOINT_POINT.initialization);
  });

  api.on(HOOK_CALL, async (event: any, ctx: any) => {
    weaveJointPoint(api, event, ctx, JOINT_POINT.call, { omitUserNotice: true, skipPrependReturn: true });
    return {};
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
    /* Sense Client may not expose error hook */
  }

  api.on(HOOK_SET, async (event: any, _ctx: any) => {
    const content = outgoingTextFromEvent(event);
    if (!content) return {};

    let senses: SenseMeta[] = [];
    try {
      if (api.resolvePath("senses")) {
        senses = loadAllSenses(api, event);
      }
    } catch {
      senses = [];
    }

    const ctxSet = buildPointcutContext(event, JOINT_POINT.set);
    const matchedSet = matchSensesForJointPoint(senses, ctxSet);
    const toInjectSet = matchedSet.filter((s) => !wovenSenseKeys.has(weaveDedupeKey(JOINT_POINT.set, s.name)));
    for (const s of toInjectSet) {
      wovenSenseKeys.add(weaveDedupeKey(JOINT_POINT.set, s.name));
    }
    const setPrefix = buildSetSensePrefix(toInjectSet);

    const hasNotice = content.includes("NOTICE: The following sense rules were triggered");
    const noticePrefix = hasNotice ? "" : pendingNoticePrefix;

    const merged = [noticePrefix, setPrefix, content].filter(Boolean).join("\n\n");

    clearPendingNoticeState();
    wovenSenseKeys.clear();

    if (merged === content) return {};
    return { content: merged };
  });
}