/* 中文代码教学器 — ui.js 渲染测试（node:test，renderStep 纯函数，无需 DOM） */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const ui = require("../ui.js");

const DATA = {
  overview: { overview: "这段代码在打招呼" },
  blocks: { blocks: [{ title: "开头", text: "打印问候" }, { title: "循环", text: "重复三次" }] },
  terms: { terms: [{ term: "print", def: "打印", analogy: "喊话" }] },
  quiz: {
    quiz: [{ q: "哪个对?", correct: 0, options: ["A", "B", "C"], explain: "因为 A" }],
    answered: []
  },
  challenge: { challenge: { task: "改数字", hint: "试试 3" }, accepted: false }
};

test("renderStep 五大步齐全", () => {
  for (const name of ["overview", "blocks", "terms", "quiz", "challenge", "done"]) {
    const html = ui.renderStep(name, DATA[name] || {});
    assert.ok(html && html.length > 0, name + " 应渲染出内容");
  }
  assert.ok(ui.renderStep("done", {}).includes("完成"), "done 卡片应含完成文案");
});

test("overview 渲染概述文本", () => {
  assert.ok(ui.renderStep("overview", DATA.overview).includes("这段代码在打招呼"));
});

test("blocks 每个语义块含标题与'重新讲得更简单'按钮", () => {
  const html = ui.renderStep("blocks", DATA.blocks);
  assert.ok(html.includes("开头") && html.includes("循环"));
  assert.ok(html.includes("重新讲得更简单"));
});

test("quiz 未作答时答案隐藏（不含 explain）", () => {
  const html = ui.renderStep("quiz", DATA.quiz);
  assert.ok(html.includes("答案隐藏"));
  assert.ok(!html.includes("因为 A"), "未作答不得显示答案");
});

test("quiz 作答后显示答案与解析", () => {
  const html = ui.renderStep("quiz", {
    quiz: DATA.quiz.quiz,
    answered: [0],
    picks: { 0: 1 }
  });
  assert.ok(html.includes("因为 A"));
  assert.ok(html.includes("正确答案"));
  assert.ok(html.includes("wrong"), "选错应标红");
});

test("quiz 答对标记 correct", () => {
  const html = ui.renderStep("quiz", {
    quiz: DATA.quiz.quiz,
    answered: [0],
    picks: { 0: 0 }
  });
  assert.ok(html.includes("correct"));
});

test("challenge 未接受时显示按钮、接受后显示参考思路", () => {
  assert.ok(ui.renderStep("challenge", DATA.challenge).includes("btn-challenge"));
  const accepted = ui.renderStep("challenge", { challenge: DATA.challenge.challenge, accepted: true });
  assert.ok(accepted.includes("参考思路") && accepted.includes("试试 3"));
});

test("HTML 转义防注入", () => {
  const html = ui.renderStep("overview", { overview: '<script>alert(1)</script>' });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("mergeQuizPicks：quiz 事件数据合并用户所选选项（修复答错不标红）", () => {
  const out = ui.mergeQuizPicks({ quiz: [{ q: "q" }], answered: [0] });
  assert.equal(out.quiz.length, 1);
  assert.deepEqual(out.answered, [0]);
  assert.ok(out.picks && typeof out.picks === "object", "渲染数据必须带 picks 字段");
  assert.equal(out.picks[0], undefined, "未作答时 picks 无该题");
});

test("renderIndicator：五步指示器状态正确", () => {
  const idle = ui.renderIndicator(null);
  assert.ok(!idle.includes("active"), "初始无激活步骤");
  const mid = ui.renderIndicator("blocks");
  assert.ok(mid.includes("ind-item done"), "概述已完成");
  const parts = mid.split('class="ind-item');
  assert.ok(parts[2].includes("active"), "blocks 步骤激活");
  const done = ui.renderIndicator("done");
  assert.ok(done.includes("ind-item done active"), "完成后最后一步激活");
});

test("renderSkeleton：加载骨架屏非空", () => {
  const html = ui.renderSkeleton();
  assert.ok(html.includes("skeleton") && html.includes("sk-line"));
});
