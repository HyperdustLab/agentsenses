/**
 * Unit tests for self_inquiry_carrier/scripts/before_prompt_build.js.
 * Run: node scripts/before_prompt_build.test.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Redirect workspace path to a throwaway temp dir before requiring the script.
const TMP_WS = fs.mkdtempSync(path.join(os.tmpdir(), "sic-test-ws-"));
process.env.OPENCLAW_WORKSPACE = TMP_WS;
const mod = require("./before_prompt_build");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  FAIL  ${name}\n    ${err.message}`);
    failed += 1;
  }
}

const inqFile = path.join(TMP_WS, "state", "chat-self-heartbeat", "inquiries.json");
fs.mkdirSync(path.dirname(inqFile), { recursive: true });

console.log("self_inquiry_carrier:");

test("no inquiries file → empty return", () => {
  try {
    fs.rmSync(inqFile);
  } catch {}
  const out = mod.before_prompt_build();
  assert.deepEqual(out, {});
});

test("empty queue → empty return", () => {
  fs.writeFileSync(inqFile, JSON.stringify({ queue: [] }));
  const out = mod.before_prompt_build();
  assert.deepEqual(out, {});
});

test("only answered inquiries → empty return", () => {
  fs.writeFileSync(
    inqFile,
    JSON.stringify({
      queue: [
        {
          id: "x1",
          state: "answered",
          tier: "material",
          asked_at: "2026-01-01T00:00:00Z",
          question: "irrelevant",
          tick_count: 5,
          escalate_to_web: false
        }
      ]
    })
  );
  assert.deepEqual(mod.before_prompt_build(), {});
});

test("one open inquiry → prependSystemContext contains question + id", () => {
  fs.writeFileSync(
    inqFile,
    JSON.stringify({
      queue: [
        {
          id: "inq_abc",
          state: "open",
          tier: "material",
          asked_at: "2026-04-21T10:00:00Z",
          question: "Which tools should I avoid running on my own?",
          tick_count: 0,
          escalate_to_web: false
        }
      ]
    })
  );
  const out = mod.before_prompt_build();
  assert.ok(typeof out.prependSystemContext === "string");
  assert.match(out.prependSystemContext, /<self_inquiry_reminder>/);
  assert.match(out.prependSystemContext, /inq_abc/);
  assert.match(out.prependSystemContext, /Which tools should I avoid/);
  assert.match(out.prependSystemContext, /ASK_THE_USER_NOW/);
  assert.equal(out.prependContext, out.prependSystemContext);
});

test("escalated inquiry → banner demands web research", () => {
  fs.writeFileSync(
    inqFile,
    JSON.stringify({
      queue: [
        {
          id: "inq_esc",
          state: "open",
          tier: "spiritual",
          asked_at: "2026-04-21T05:00:00Z",
          question: "Do you want sources inline?",
          tick_count: 6,
          escalate_to_web: true
        }
      ]
    })
  );
  const out = mod.before_prompt_build();
  assert.match(out.prependSystemContext, /ESCALATE_TO_WEB/);
  assert.match(out.prependSystemContext, /MUST invoke a web tool/);
  assert.match(out.prependSystemContext, /spiritual/);
});

test("multiple open inquiries → escalated wins", () => {
  fs.writeFileSync(
    inqFile,
    JSON.stringify({
      queue: [
        {
          id: "inq_plain",
          state: "open",
          tier: "social",
          asked_at: "2026-04-21T08:00:00Z",
          question: "plain question",
          tick_count: 1,
          escalate_to_web: false
        },
        {
          id: "inq_esc",
          state: "open",
          tier: "material",
          asked_at: "2026-04-21T06:00:00Z",
          question: "escalated question",
          tick_count: 5,
          escalate_to_web: true
        }
      ]
    })
  );
  const out = mod.before_prompt_build();
  assert.match(out.prependSystemContext, /inq_esc/);
  assert.match(out.prependSystemContext, /escalated question/);
  assert.match(out.prependSystemContext, /1 other open inquiry not listed/);
});

test("malformed inquiries.json → empty return, no throw", () => {
  fs.writeFileSync(inqFile, "{not-json");
  const out = mod.before_prompt_build();
  assert.deepEqual(out, {});
});

console.log(`\n${passed} passed, ${failed} failed`);
fs.rmSync(TMP_WS, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
