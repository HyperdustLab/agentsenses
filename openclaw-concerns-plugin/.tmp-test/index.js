import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
function readFileSafe(filePath) {
    try {
        return fs.readFileSync(filePath, "utf8");
    }
    catch {
        return null;
    }
}
/**
 * Single-file concern format (like skills): YAML frontmatter + markdown body as prompt.
 * ---\n<meta yaml>\n---\n<prompt markdown>
 */
function parseSenseMd(raw, dir) {
    const text = raw.replace(/^\uFEFF/, "");
    if (!text.startsWith("---"))
        return null;
    const afterOpen = text.slice(3).replace(/^\r?\n/, "");
    const closeIdx = afterOpen.search(/\r?\n---\r?\n/);
    if (closeIdx === -1) {
        console.warn(`[openclaw-concerns] concern.md missing closing --- at ${dir}`);
        return null;
    }
    const yamlBlock = afterOpen.slice(0, closeIdx).trim();
    const body = afterOpen.slice(closeIdx).replace(/^\r?\n---\r?\n/, "").trim();
    try {
        const meta = yaml.parse(yamlBlock);
        if (!meta?.name) {
            console.warn(`[openclaw-concerns] concern.md missing name at ${dir}`);
            return null;
        }
        meta.prompt = body;
        return meta;
    }
    catch (err) {
        console.warn(`[openclaw-concerns] Failed to parse concern.md YAML at ${dir}:`, err);
        return null;
    }
}
function loadSenseFromDir(dir) {
    const senseMdPath = path.join(dir, "concern.md");
    const senseMdRaw = readFileSafe(senseMdPath);
    if (senseMdRaw) {
        return parseSenseMd(senseMdRaw, dir);
    }
    const metaPath = path.join(dir, "concern.yaml");
    const promptPath = path.join(dir, "prompt.md");
    const metaRaw = readFileSafe(metaPath);
    const promptRaw = readFileSafe(promptPath);
    if (!metaRaw || !promptRaw)
        return null;
    try {
        const meta = yaml.parse(metaRaw);
        meta.prompt = promptRaw.trim();
        return meta;
    }
    catch (err) {
        console.warn(`[openclaw-concerns] Failed to parse legacy concern at ${dir}:`, err);
        return null;
    }
}
function loadSenses(workspacePath) {
    // api.resolvePath("concerns") may already return ".../concerns".
    // Normalize both workspace-root and concerns-dir inputs here.
    const sensesDir = path.basename(workspacePath) === "concerns"
        ? workspacePath
        : path.join(workspacePath, "concerns");
    if (!fs.existsSync(sensesDir))
        return [];
    const entries = fs.readdirSync(sensesDir, { withFileTypes: true });
    const concerns = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const dir = path.join(sensesDir, entry.name);
        const concern = loadSenseFromDir(dir);
        if (concern)
            concerns.push(concern);
    }
    return concerns;
}
function collectCandidateSenseDirs(basePaths) {
    const dirs = new Set();
    for (const base of basePaths) {
        if (!base || typeof base !== "string")
            continue;
        const trimmed = base.trim();
        if (!trimmed)
            continue;
        if (path.basename(trimmed) === "concerns") {
            dirs.add(trimmed);
        }
        else {
            dirs.add(path.join(trimmed, "concerns"));
        }
    }
    // Heuristic fallback: scan one level under HOME for */concerns.
    const home = process.env.HOME;
    if (home && fs.existsSync(home)) {
        try {
            const entries = fs.readdirSync(home, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                if (entry.name.startsWith("."))
                    continue;
                dirs.add(path.join(home, entry.name, "concerns"));
            }
        }
        catch {
            // ignore home scan errors
        }
    }
    return Array.from(dirs);
}
function detectPseudoContext(event) {
    const lastContent = event?.messages?.at?.(-1)?.content;
    const promptText = typeof event?.prompt === "string"
        ? event.prompt
        : typeof lastContent === "string"
            ? lastContent
            : typeof event?.message?.content === "string"
                ? event.message.content
                : "";
    const lower = promptText.toLowerCase();
    const requiresWeb = /\b(search|web|latest|news|current|today|look up|browse|official site|browser)\b/i.test(promptText);
    return {
        userPrompt: promptText,
        task: {
            requires_web: requiresWeb,
        },
        skill: event?.agent?.selectedSkill ??
            event?.selectedSkill ??
            (lower.includes("web") || lower.includes("search") ? "web_answer" : null),
        jointpoint: "before_agent_start"
    };
}
function evalCondition(cond, ctx) {
    const c = cond.trim();
    if (c === "task.requires_web == true") {
        return !!ctx?.task?.requires_web;
    }
    if (c === 'skill == "web_answer"') {
        return ctx?.skill === "web_answer";
    }
    if (c === 'skill == "browser"') {
        return ctx?.skill === "browser";
    }
    return false;
}
function matchesPointcut(pointcut, ctx) {
    const allOf = pointcut?.all_of ?? [];
    const anyOf = pointcut?.any_of ?? [];
    const notOf = pointcut?.not ?? [];
    if (allOf.length && !allOf.every((c) => evalCondition(c, ctx))) {
        return false;
    }
    if (anyOf.length && !anyOf.some((c) => evalCondition(c, ctx))) {
        return false;
    }
    if (notOf.length && notOf.some((c) => evalCondition(c, ctx))) {
        return false;
    }
    return true;
}
function matchSenses(concerns, ctx) {
    const matched = concerns.filter((concern) => {
        const declared = concern.jointpoints ?? [];
        const jointpoints = Array.isArray(declared)
            ? declared
            : [declared].filter(Boolean);
        const supportsPromptBuild = jointpoints.includes("before_agent_start") ||
            jointpoints.includes("before_prompt_build") ||
            jointpoints.includes("before_skill_execute") ||
            jointpoints.includes("before_output");
        if (!supportsPromptBuild)
            return false;
        return matchesPointcut(concern.pointcut, ctx);
    });
    matched.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return matched;
}
function buildSenseBlock(concerns) {
    const parts = [];
    parts.push("The following Concerns are active for this run.");
    parts.push("They are crosscutting modulation instructions and must be followed.");
    for (const s of concerns) {
        parts.push([
            `[Concern: ${s.name}]`,
            s.description ? `Description: ${s.description}` : "",
            s.modulation?.type ? `Modulation: ${s.modulation.type}` : "",
            s.prompt ?? ""
        ]
            .filter(Boolean)
            .join("\n"));
    }
    return parts.join("\n\n");
}
function buildUserVisibleNotice(concerns) {
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
function buildRenderedNotice(concerns) {
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
let pendingNoticePrefix = "";
function createSenseInjectionResult(api, event) {
    return (() => {
        try {
            const workspacePath = api.resolvePath("concerns");
            if (!workspacePath) {
                api.logger?.warn?.("[openclaw-concerns] No workspace path resolved.");
                return {};
            }
            const fallbackWorkspacePath = typeof event?.workspacePath === "string" ? event.workspacePath : undefined;
            const cwdPath = typeof event?.cwd === "string" ? event.cwd : process.cwd();
            const candidateSenseDirs = collectCandidateSenseDirs([
                workspacePath,
                fallbackWorkspacePath,
                cwdPath
            ]);
            const existingSenseDirs = candidateSenseDirs.filter((dir) => fs.existsSync(dir));
            const allLoaded = [];
            for (const dir of existingSenseDirs) {
                const loaded = loadSenses(dir);
                if (loaded.length > 0) {
                    allLoaded.push(...loaded);
                }
            }
            // Deduplicate by concern name + prompt content.
            const uniq = new Map();
            for (const concern of allLoaded) {
                const key = `${concern.name}::${concern.prompt ?? ""}`;
                if (!uniq.has(key))
                    uniq.set(key, concern);
            }
            const concerns = Array.from(uniq.values());
            if (!concerns.length)
                return {};
            const ctx = detectPseudoContext(event);
            const matched = matchSenses(concerns, ctx);
            if (!matched.length)
                return {};
            const senseBlock = buildSenseBlock(matched);
            const notice = buildUserVisibleNotice(matched);
            pendingNoticePrefix = buildRenderedNotice(matched);
            api.logger?.info?.(`[openclaw-concerns] matched: ${matched.map((s) => s.name).join(", ")}`);
            const responseText = `\n\n<Concerns>\n${senseBlock}\n</Concerns>\n\n${notice}`;
            return {
                prependSystemContext: responseText,
                prependContext: responseText
            };
        }
        catch (err) {
            api.logger?.error?.("[openclaw-concerns] concern injection failed:", err);
            return {};
        }
    })();
}
export default function register(api) {
    // Newer OpenClaw versions primarily use before_prompt_build.
    api.on("before_prompt_build", async (event) => {
        return createSenseInjectionResult(api, event);
    });
    // Keep legacy compatibility for runtimes still invoking before_agent_start.
    api.on("before_agent_start", async (event) => {
        return createSenseInjectionResult(api, event);
    });
    // Hard guarantee: prepend notice in the final outgoing message.
    api.on("message_sending", async (event) => {
        if (!pendingNoticePrefix)
            return {};
        const content = typeof event?.content === "string"
            ? event.content
            : typeof event?.message?.content === "string"
                ? event.message.content
                : "";
        if (!content)
            return {};
        if (content.includes("NOTICE: The following concern rules were triggered")) {
            pendingNoticePrefix = "";
            return {};
        }
        const merged = `${pendingNoticePrefix}\n\n${content}`;
        pendingNoticePrefix = "";
        return { content: merged };
    });
}
