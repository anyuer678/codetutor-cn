/* 中文代码教学器 — 年龄分级词表与角色卡（纯文本模块，无网络依赖）
 * UMD 双模式：浏览器挂 window.CodeTutor.prompts；node 用 require() 加载。
 * 接口契约见 架构设计.md §2.3。 */
(function (global) {
  "use strict";

  var AGE_RULES = {
    0: { name: "幼儿园", vocab: "仅限6岁词汇，一个句子不超过10个字", ban: ["迭代器", "异步", "对象", "递归"], analogies: "游乐场/排队/朋友/面包" },
    1: { name: "小学生", vocab: "小学生能懂，多用生活比喻", ban: ["递归"], analogies: "生活比喻（食堂打饭、做值日）" },
    2: { name: "初中生", vocab: "初中生能懂，可以出现函数、循环、数组术语", ban: [], allow: "函数、循环、数组" },
    3: { name: "成人", vocab: "成人但保持通俗讲解，保留正常术语", ban: [], allow: "全部术语" }
  };

  /* LLM 输出 JSON 契约（单一来源：llm.js 的 LLM_JSON_SCHEMA 引用此常量） */
  var LLM_JSON_SCHEMA = '{\n' +
    '  "overview": "一句话概述这段代码在做什么（用当前年龄段词汇）",\n' +
    '  "blocks": [{"title": "块标题", "text": "该块在做什么、为什么这么写"}],\n' +
    '  "terms": [{"term": "术语名", "def": "含义", "analogy": "生活类比"}],\n' +
    '  "quiz": [{"q": "题干", "correct": 0, "options": ["选项A", "选项B", "选项C"], "explain": "答案解析"}],\n' +
    '  "challenge": {"task": "改写任务（改一个数字/条件看会发生什么）", "hint": "提示"}' +
    '\n}';

  /* 角色卡：中文编程讲师，对象{年龄段}，词汇要求{限制} */
  function buildSystemPrompt(levelCode) {
    var rule = AGE_RULES[levelCode] || AGE_RULES[3];
    var parts = [
      "你是中文编程讲师，面向" + rule.name + "阶段的学习者。",
      "词汇要求：" + rule.vocab + "。"
    ];
    if (rule.ban && rule.ban.length > 0) {
      parts.push("禁止使用技术术语，只准用日常生活中的词语（比如：重复、排队、记数）。");
    }
    if (rule.allow) {
      parts.push("可以使用：" + rule.allow + "。");
    }
    if (rule.analogies) {
      parts.push("类比方向：" + rule.analogies + "。");
    }
    parts.push("讲解要像老师一样循序渐进：先讲这段代码整体在做什么，再分块讲为什么这么写，最后用练习题巩固。不允许一次倒出一大段文字。");
    return parts.join("");
  }

  /* 用户消息：[代码] + [输出要求]，内嵌 JSON 契约 */
  function buildUserPrompt(code) {
    return "[代码]\n```\n" + code + "\n```\n\n" +
      "[输出要求]\n严格按以下 JSON 契约输出，只输出 JSON，不要输出任何额外文字或代码块标记：\n" +
      LLM_JSON_SCHEMA + "\n\n" +
      "要求：\n" +
      "1. overview 用一句话概述这段代码在做什么（用词符合当前年龄段）。\n" +
      "2. blocks 按语义块（不是按行）分成 3-8 块，每块两句：在做什么 + 为什么这么写。\n" +
      "3. terms 列出 2-5 个关键术语，每个包含 含义 与 生活类比。\n" +
      "4. quiz 出恰好 3 道选择题，correct 是正确选项下标(0-2)，options 恰好 3 项，explain 写答案解析。\n" +
      "5. challenge 出一个改写挑战任务（改一个数字/条件看会发生什么）并附 hint 提示。\n" +
      "6. 全部用中文。";
  }

  /* "我没听懂"局部重讲：只用最简单词汇，纯文本（非 JSON） */
  function buildReexplainPrompt(blockTitle) {
    return "学习者没听懂下面这一块：" + blockTitle + "。\n" +
      "请只用 6 岁小孩能懂的词汇重新讲这一块（一个句子不超过10个字），用" + AGE_RULES[0].analogies + "这类类比，" +
      "两三句话即可。直接输出讲解文字，不要输出 JSON。";
  }

  /* 契约拼接：llm.js 调用入口 */
  function concatPrompt(code, ageLevel) {
    return { system: buildSystemPrompt(ageLevel), user: buildUserPrompt(code) };
  }

  var api = {
    AGE_RULES: AGE_RULES,
    LLM_JSON_SCHEMA: LLM_JSON_SCHEMA,
    buildSystemPrompt: buildSystemPrompt,
    buildUserPrompt: buildUserPrompt,
    buildReexplainPrompt: buildReexplainPrompt,
    concatPrompt: concatPrompt
  };

  global.CodeTutor = global.CodeTutor || {};
  global.CodeTutor.prompts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
