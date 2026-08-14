/* 中文代码教学器 — state.js 状态机测试（node:test，mock fetch，不依赖网络） */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { LessonState, AGE_LEVELS } = require("../state.js");

const VALID_LESSON = {
  overview: "打印问候",
  blocks: [{ title: "开头", text: "打招呼" }, { title: "循环", text: "重复三次" }],
  terms: [{ term: "print", def: "打印", analogy: "喊话" }],
  quiz: [
    { q: "第1题?", correct: 0, options: ["A", "B", "C"], explain: "因为 A" },
    { q: "第2题?", correct: 1, options: ["X", "Y", "Z"], explain: "因为 Y" },
    { q: "第3题?", correct: 2, options: ["P", "Q", "R"], explain: "因为 R" }
  ],
  challenge: { task: "改数字", hint: "试试 3" }
};

function wrap(content) {
  return { choices: [{ message: { content: content } }] };
}

function installFetch(content) {
  const orig = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(wrap(JSON.stringify(content))), { status: 200 });
  return () => { globalThis.fetch = orig; };
}

test("AGE_LEVELS 四级映射契约", () => {
  assert.deepEqual(AGE_LEVELS, { kids: 0, child: 1, teen: 2, adult: 3 });
});

test("start() 按序回报五步 + done 事件", async () => {
  const restore = installFetch(VALID_LESSON);
  const events = [];
  try {
    const s = new LessonState("print(1)", 0, (p) => events.push(p));
    await s.start();
    const steps = events.filter((e) => e.type === "step").map((e) => e.step);
    assert.deepEqual(steps, ["overview", "blocks", "terms", "quiz", "challenge"]);
    assert.ok(events.some((e) => e.type === "done"));
    const quizEv = events.find((e) => e.type === "step" && e.step === "quiz");
    assert.deepEqual(quizEv.data.answered, []);
  } finally { restore(); }
});

test("start() 失败回报 error 事件", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response("err", { status: 500 });
  const events = [];
  try {
    const s = new LessonState("x", 0, (p) => events.push(p));
    await assert.rejects(s.start());
    const err = events.find((e) => e.type === "error");
    assert.ok(err && err.data.kind === "http");
  } finally { globalThis.fetch = orig; }
});

test("answerQuiz 记录已答并触发 reveal（答案不外显之前）", async () => {
  const restore = installFetch(VALID_LESSON);
  try {
    const events = [];
    const s = new LessonState("print(1)", 0, (p) => events.push(p));
    await s.start();
    s.answerQuiz(1);
    const quizEvs = events.filter((e) => e.type === "step" && e.step === "quiz");
    const last = quizEvs[quizEvs.length - 1];
    assert.deepEqual(last.data.answered, [1]);
    // 重复作答同一题不重复记录
    s.answerQuiz(1);
    const last2 = events.filter((e) => e.type === "step" && e.step === "quiz").pop();
    assert.deepEqual(last2.data.answered, [1]);
  } finally { restore(); }
});

test("acceptChallenge 公布参考思路并完成会话", async () => {
  const restore = installFetch(VALID_LESSON);
  const events = [];
  try {
    const s = new LessonState("print(1)", 0, (p) => events.push(p));
    await s.start();
    s.acceptChallenge();
    const ch = events.filter((e) => e.type === "step" && e.step === "challenge").pop();
    assert.equal(ch.data.accepted, true);
    assert.ok(events.filter((e) => e.type === "done").length >= 2);
  } finally { restore(); }
});

test("setAgeLevel 切换后重新讲解（重估词表）", async () => {
  let fetchCount = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(JSON.stringify(wrap(JSON.stringify(VALID_LESSON))), { status: 200 });
  };
  try {
    const s = new LessonState("print(1)", 0, () => {});
    await s.start();
    assert.equal(fetchCount, 1);
    s.setAgeLevel(3);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fetchCount, 2, "切换年龄段应重新请求");
  } finally { globalThis.fetch = orig; }
});

test("reexplain 只重讲指定块（reask 事件带 blockIndex）", async () => {
  const restore = installFetch(VALID_LESSON);
  try {
    const events = [];
    const s = new LessonState("print(1)", 0, (p) => events.push(p));
    await s.start();
    // reexplain 会再次请求（mock fetch 返回同一 LessonData 的 content，纯文本场景由 llm 返回内容）
    await s.reexplain(1);
    const reask = events.find((e) => e.type === "reask");
    assert.ok(reask);
    assert.equal(reask.blockIndex, 1);
    assert.ok(reask.data.title);
  } finally { restore(); }
});
