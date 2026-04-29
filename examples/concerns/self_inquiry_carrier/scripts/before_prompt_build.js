/**
 * Executable advice for the self_inquiry_carrier concern.
 *
 * Pointcut: jointpoint == "execution"  (fires at before_prompt_build)
 *
 * Reads the chat-self-heartbeat inquiry queue. If there is any open inquiry,
 * builds a compact <self_inquiry_reminder> block and prepends it to the
 * model's system context for this turn. No open inquiry → no injection,
 * zero tokens.
 *
 * Return fields (picked up by openclaw-concerns-plugin): prependSystemContext,
 * prependContext (mirrored so both plugin code paths see it).
 *
 * Spec: specification/CHAT_DEVELOPED_AGENT.md §5 (learning loop) and §8 (IEM).
 *       The concern NEVER writes to disk and NEVER mutates inquiries.json.
 */

const fs = require("node:fs");
const path = require("node:path");

const WS =
  process.env.OPENCLAW_WORKSPACE ||
  path.join(process.env.HOME || "", ".openclaw", "workspace");

const INQUIRIES_FILE = path.join(
  WS,
  "state",
  "chat-self-heartbeat",
  "inquiries.json"
);

function loadInquiries() {
  try {
    const txt = fs.readFileSync(INQUIRIES_FILE, "utf8");
    const obj = JSON.parse(txt);
    return Array.isArray(obj?.queue) ? obj.queue : [];
  } catch {
    return [];
  }
}

function pickPrimary(openQueue) {
  if (openQueue.length === 0) return null;
  // Prefer escalated (oldest first), then the oldest still-plain-open.
  const escalated = openQueue
    .filter((q) => q.escalate_to_web)
    .sort((a, b) => String(a.asked_at).localeCompare(String(b.asked_at)));
  if (escalated.length) return escalated[0];
  return [...openQueue].sort((a, b) =>
    String(a.asked_at).localeCompare(String(b.asked_at))
  )[0];
}

function renderBanner(primary, allOpen) {
  const tier = primary.tier ?? "unknown";
  const requiredAction = primary.escalate_to_web
    ? [
        `REQUIRED_ACTION: ESCALATE_TO_WEB`,
        `This inquiry has been open for ${primary.tick_count} heartbeat ticks with no user reply.`,
        `You MUST invoke a web tool (web_fetch, browser, or equivalent) on this turn before final reply —`,
        `do not skip research because the user is silent.`,
        `Search how humans shape the "${tier}" aspect of self`,
        `(useful queries: "${tier} self identity", "${tier} self habit", "${tier} self practice").`,
        `Synthesise 1-3 candidate answers and propose the most grounded one via`,
        `chat-self-confirmer. When the user next appears, show them what you`,
        `found and close with:`,
        `    node ~/.openclaw/workspace/skills/chat-self-heartbeat/scripts/tick.js --answer ${primary.id}`
      ]
    : [
        `REQUIRED_ACTION: ASK_THE_USER_NOW`,
        `Ask the user this question, verbatim or with a light "Quick self-check:" prefix:`,
        ``,
        `    ${primary.question}`,
        ``,
        `Do NOT reply HEARTBEAT_OK on a heartbeat tick while this inquiry is open.`,
        `When the user replies, close the inquiry and create a tier-${tier} Concern:`,
        `    node ~/.openclaw/workspace/skills/chat-self-heartbeat/scripts/tick.js --answer ${primary.id}`,
        `then feed the answer through chat-self-observer → chat-self-curator → chat-self-confirmer → chat-self-persister.`
      ];

  const others =
    allOpen.length > 1
      ? [
          ``,
          `(${allOpen.length - 1} other open ${allOpen.length - 1 === 1 ? "inquiry" : "inquiries"} not listed here.)`
        ]
      : [];

  return [
    `<self_inquiry_reminder>`,
    `inquiry_id: ${primary.id}`,
    `tier: ${tier}`,
    `opened_at: ${primary.asked_at}`,
    `tick_count: ${primary.tick_count}`,
    `question: ${primary.question}`,
    ``,
    ...requiredAction,
    ...others,
    `</self_inquiry_reminder>`,
    ``
  ].join("\n");
}

function before_prompt_build(_input = {}) {
  const queue = loadInquiries();
  const open = queue.filter((q) => q && q.state === "open");
  // diagnostic trace: written to /tmp so we can verify the plugin actually invokes us.
  try {
    fs.appendFileSync(
      "/tmp/openclaw/self_inquiry_carrier.log",
      new Date().toISOString() + " called; openQueue=" + open.length + "\n"
    );
  } catch {}

  if (open.length === 0) return {};

  const primary = pickPrimary(open);
  if (!primary) return {};

  const banner = renderBanner(primary, open);
  return {
    prependSystemContext: banner,
    prependContext: banner
  };
}

module.exports = {
  loadInquiries,
  pickPrimary,
  renderBanner,
  before_prompt_build,
  run: before_prompt_build,
  default: before_prompt_build
};
