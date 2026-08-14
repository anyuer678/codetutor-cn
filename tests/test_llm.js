/* 中文代码教学器 — llm.js 测试（node:test，mock fetch，不依赖网络） */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const llm = require("../llm.js");

const VALID_LESSON = {
  overview: "打印问候",
  blocks: [{ title: "开头", text: "打招呼" }],
  terms: [{ term: "print", def: "打印", analogy: "喊话" }],
  quiz: [{ q: "哪个对?", correct: 0, options: ["A", "B", "C"], explain: "因为 A" }],
  challenge: { task: "改数字", hint: "试试 3" }
};

function wrap(content) {
  return { choices: [{ message: { content: content } }] };
}

function installFetch(fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = fn;
  return () => { globalThis.fetch = orig; };
}

const OPTS = { apiBase: "http://fake/v1/chat/completions", apiKey: "sk-fake", model: "m" };

test("requestLesson 成功：解析 OpenAI 兼容响应", async () => {
  const restore = installFetch(async () =>
    new Response(JSON.stringify(wrap(JSON.stringify(VALID_LESSON))), { status: 200 })
  );
  try {
    const data = await llm.requestLesson("print(1)", 0, OPTS);
    assert.equal(data.overview, "打印问候");
    assert.equal(data.quiz.length, 1);
  } finally { restore(); }
});

test("畸形响应自动重试一次后成功（附纠错指令）", async () => {
  let calls = 0;
  const restore = installFetch(async () => {
    calls++;
    const bad = Object.assign({}, VALID_LESSON, { overview: 123 });
    const good = JSON.stringify(VALID_LESSON);
    return new Response(JSON.stringify(wrap(calls === 1 ? JSON.stringify(bad) : good)), { status: 200 });
  });
  try {
    const data = await llm.requestLesson("print(1)", 0, OPTS);
    assert.equal(calls, 2);
    assert.equal(data.overview, "打印问候");
  } finally { restore(); }
});

test("两次畸形响应抛 parse LlmError", async () => {
  const restore = installFetch(async () =>
    new Response(JSON.stringify(wrap(JSON.stringify({ overview: 1, blocks: "x" }))), { status: 200 })
  );
  try {
    await assert.rejects(
      llm.requestLesson("print(1)", 0, OPTS),
      (e) => e instanceof llm.LlmError && e.kind === "parse"
    );
  } finally { restore(); }
});

test("HTTP 非 2xx 抛 http LlmError", async () => {
  const restore = installFetch(async () => new Response("err", { status: 401 }));
  try {
    await assert.rejects(llm.requestLesson("print(1)", 0, OPTS), (e) => e.kind === "http");
  } finally { restore(); }
});

test("缺少配置抛 config LlmError（不发起请求）", async () => {
  let called = false;
  const restore = installFetch(async () => { called = true; return new Response("{}"); });
  try {
    await assert.rejects(llm.requestLesson("print(1)", 0, { apiBase: "", apiKey: "k", model: "m" }), (e) => e.kind === "config");
    assert.equal(called, false);
  } finally { restore(); }
});

test("外部 signal 已中止抛 timeout LlmError", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    llm.requestLesson("print(1)", 0, Object.assign({}, OPTS, { signal: ctrl.signal })),
    (e) => e instanceof llm.LlmError && e.kind === "timeout"
  );
});

test("validateLesson：畸形数据返回 errors 而非 throw（契约校验）", () => {
  const r = llm.validateLesson({ overview: "x", blocks: [], quiz: [{ q: "q", correct: 9, options: ["a"], explain: 1 }] });
  assert.equal(r.ok, false);
  assert.ok(Array.isArray(r.errors) && r.errors.length > 0);
});

test("requestReexplain 返回纯文本（非 JSON 也兼容）", async () => {
  const restore = installFetch(async () =>
    new Response(JSON.stringify(wrap("用一个比喻解释这一块")), { status: 200 })
  );
  try {
    const text = await llm.requestReexplain("某块", OPTS);
    assert.equal(text, "用一个比喻解释这一块");
  } finally { restore(); }
});
