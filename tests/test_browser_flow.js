/* 浏览器全流程集成测试（node:test，无真实浏览器）：
 * 用 fake DOM + mock fetch 走 真实 ui → LessonState → llm 事件链路，
 * 验证：示例填入 / 骨架屏 / 五步渲染 / 答错标红 / quiz 卡片替换不重复 /
 *       挑战收尾指示器 / 切龄重讲清空 / placeholder 恢复。
 * 运行：node --test tests/test_*.js */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");

function makeEl(id) {
  const listeners = {};
  return {
    id, value: "", placeholder: "", textContent: "", disabled: false, innerHTML: "",
    focus() {}, scrollIntoView() {},
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    insertAdjacentHTML(pos, html) { this.innerHTML += html; },
    querySelector(sel) {
      const map = { ".step-quiz": "card step-quiz", ".step-challenge": "card step-challenge" };
      if (map[sel]) {
        const self = this;
        const cls = map[sel];
        if (!new RegExp('class="' + cls + '"').test(self.innerHTML)) return null;
        return {
          set outerHTML(v) {
            self.innerHTML = self.innerHTML.replace(new RegExp('<section class="' + cls + '">[\\s\\S]*?<\\/section>'), v);
          }
        };
      }
      return null;
    },
    _fire(t, ev) { (listeners[t] || []).forEach((fn) => fn(ev || {})); }
  };
}

function load(name) {
  const p = path.join(ROOT, name);
  const m = { exports: {} };
  Function("module", "exports", "require", "global", "__dirname", "__filename",
    fs.readFileSync(p, "utf8"))(m, m.exports, require, global, ROOT, p);
  return m.exports;
}

const LESSON = {
  overview: "这段代码用循环打印三次问候。",
  blocks: [
    { title: "for i in range(3):", text: "让下面的语句重复执行三次。" },
    { title: 'print("你好")', text: "每次循环都打印一行你好。" }
  ],
  terms: [{ term: "for", def: "循环关键字", analogy: "像复读机一样重复执行" }],
  quiz: [
    { q: "循环会执行几次？", correct: 1, options: ["1 次", "3 次", "永远"], explain: "range(3) 生成 0、1、2 三个数。" },
    { q: "print 的作用是？", correct: 0, options: ["打印输出", "删除", "循环"], explain: "print 把内容打印到屏幕。" }
  ],
  challenge: { task: "试着把循环改成 5 次", hint: "改 range 里的数字即可。" }
};

function quizBtn(qi, oi) {
  return {
    dataset: {},
    closest(sel) { return sel === ".quiz-opt" ? this : null; },
    getAttribute(a) { return a === "data-quiz" ? String(qi) : a === "data-opt" ? String(oi) : null; }
  };
}
function challengeBtn() {
  return { dataset: {}, closest(sel) { return sel === ".btn-challenge" ? this : null; } };
}

test("浏览器全流程：示例→讲解→答题→挑战→切龄→placeholder 恢复", async () => {
  const els = {};
  global.document = { getElementById(id) { return (els[id] = els[id] || makeEl(id)); }, addEventListener() {} };
  global.localStorage = {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  };
  global.fetch = async () => ({
    ok: true, status: 200,
    async text() { return JSON.stringify({ choices: [{ message: { content: JSON.stringify(LESSON) } }] }); }
  });

  load("prompts.js");
  load("storage.js");
  load("llm.js");
  load("state.js");
  const ui = load("ui.js");

  const tick = () => new Promise((r) => setTimeout(r, 40));
  const countQuiz = (html) => (html.match(/class="card step-quiz"/g) || []).length;

  ui.init();
  const age = els["age"], code = els["code"], go = els["btn-go"],
        steps = els["steps"], ind = els["step-indicator"], sample = els["btn-sample"];

  // 1. 示例一键填入
  sample._fire("click");
  assert.ok(code.value.includes("你好"), "示例应填入 textarea");

  // 2. 开始讲解 → 骨架屏 → 四步渲染（challenge 需答完题才出现）
  go._fire("click");
  assert.ok(steps.innerHTML.includes("skeleton"), "讲解中应显示骨架屏");
  await tick();
  for (const s of ["overview", "blocks", "terms", "quiz"]) {
    assert.ok(steps.innerHTML.includes(s), "缺少步骤卡片: " + s);
  }
  assert.ok(!steps.innerHTML.includes("skeleton"), "骨架屏应消失");
  assert.ok(ind.innerHTML.includes("ind-item"), "指示器应渲染");
  assert.equal(countQuiz(steps.innerHTML), 1, "初始应只有一张 quiz 卡片");
  assert.ok(steps.innerHTML.includes("完成"), "五步后应显示完成卡片");

  // 3. 答错第一题（correct=1，选 0）→ 标红 + 正确答案标绿 + 答案显示 + 卡片不重复
  steps._fire("click", { target: quizBtn(0, 0) });
  assert.equal(countQuiz(steps.innerHTML), 1, "答第 1 题后 quiz 卡片应替换不重复");
  assert.ok(steps.innerHTML.includes("quiz-opt wrong"), "答错选项必须标红(wrong)");
  assert.ok(steps.innerHTML.includes("quiz-opt correct"), "正确答案必须标绿(correct)");
  assert.ok(steps.innerHTML.includes("quiz-answer"), "答案与解析应显示");

  // 4. 答对第二题 → 挑战卡出现
  steps._fire("click", { target: quizBtn(1, 0) });
  assert.equal(countQuiz(steps.innerHTML), 1, "答第 2 题后 quiz 卡片仍应只有一张");
  assert.ok(steps.innerHTML.includes("btn-challenge"), "答完题应出现挑战卡");

  // 5. 接受挑战 → 参考思路 + 指示器收尾 + 挑战卡不重复
  steps._fire("click", { target: challengeBtn() });
  assert.ok(steps.innerHTML.includes("challenge-hint"), "接受挑战后显示参考思路");
  assert.equal((steps.innerHTML.match(/class="card step-challenge"/g) || []).length, 1, "挑战卡片不应重复");
  assert.ok(ind.innerHTML.includes("ind-item done active"), "完成后指示器收尾");
  assert.equal((steps.innerHTML.match(/step-done/g) || []).length, 1, "完成卡片不应重复");

  // 6. 切换年龄段：清空旧卡片 + 骨架屏 + 重新讲解
  age.value = "2";
  age._fire("change");
  assert.ok(steps.innerHTML.includes("skeleton"), "切龄后应先清空显示骨架屏");
  await tick();
  assert.ok(!steps.innerHTML.includes("skeleton"), "重新讲解完成");

  // 7. 空输入提示 → input 后 placeholder 恢复默认
  code.value = "  ";
  go._fire("click");
  assert.ok(code.placeholder.includes("请先粘贴"), "空输入应提示");
  code._fire("input");
  assert.ok(!code.placeholder.includes("请先粘贴"), "input 后 placeholder 恢复默认");
});
