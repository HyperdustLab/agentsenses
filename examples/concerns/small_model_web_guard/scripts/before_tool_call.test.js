/**
 * Tests for small_model_web_guard before_tool_call.
 * Run: node scripts/before_tool_call.test.js
 */

const assert = require("node:assert/strict");
const {
  before_tool_call,
  isSmallOrLocal,
  parseModelId
} = require("./before_tool_call");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}\n    ${err.message}`);
  }
}

console.log("small_model_web_guard:");

test("blocks web_fetch on ollama", () => {
  const r = before_tool_call({
    event: { toolName: "web_fetch", model: "ollama/gpt-oss:20b" }
  });
  assert.equal(r.block, true);
  assert.match(r.blockReason, /web_fetch/);
  assert.match(r.blockReason, /ollama/);
});

test("blocks browser_navigate on ollama via provider field", () => {
  const r = before_tool_call({
    event: { toolName: "browser_navigate", provider: "ollama" }
  });
  assert.equal(r.block, true);
});

test("allows web_fetch on openai/gpt-5.4", () => {
  const r = before_tool_call({
    event: { toolName: "web_fetch", model: "openai/gpt-5.4" }
  });
  assert.deepEqual(r, {});
});

test("blocks on small-model hint even without provider prefix", () => {
  const r = before_tool_call({
    event: { toolName: "browser", model: "gpt-oss:20b" }
  });
  assert.equal(r.block, true);
});

test("blocks on 70b parameter hint", () => {
  const r = before_tool_call({
    event: { toolName: "fetch", model: "some-provider/llama-70b" }
  });
  assert.equal(r.block, true);
});

test("does not block non-web tools on ollama", () => {
  const r = before_tool_call({
    event: { toolName: "read_file", model: "ollama/gpt-oss:20b" }
  });
  assert.deepEqual(r, {});
});

test("is case-insensitive on tool name", () => {
  const r = before_tool_call({
    event: { toolName: "Browser_Click", model: "ollama/gpt-oss:20b" }
  });
  assert.equal(r.block, true);
});

test("returns {} when no toolName", () => {
  const r = before_tool_call({
    event: { model: "ollama/gpt-oss:20b" }
  });
  assert.deepEqual(r, {});
});

test("parseModelId", () => {
  assert.deepEqual(parseModelId("ollama/gpt-oss:20b"), {
    provider: "ollama",
    model: "gpt-oss:20b"
  });
  assert.deepEqual(parseModelId("gpt-oss:20b"), {
    provider: null,
    model: "gpt-oss:20b"
  });
});

test("isSmallOrLocal recognizes known providers", () => {
  assert.equal(isSmallOrLocal({ provider: "ollama", model: null }), true);
  assert.equal(isSmallOrLocal({ provider: "openai", model: "gpt-5.4" }), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
