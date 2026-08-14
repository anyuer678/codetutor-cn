/* 中文代码教学器 — DOM 渲染与交互（DOM 唯一出口）
 * UMD 双模式。接口契约见 架构设计.md §2.4。
 * 依赖：state.js / storage.js。禁止 llm.js 之外的模块发网络请求。 */
(function (global) {
  "use strict";

  var stateMod, storage;
  if (typeof module !== "undefined" && module.exports) {
    var path = require("path");
    stateMod = require(path.join(__dirname, "state.js"));
    storage = require(path.join(__dirname, "storage.js"));
  } else {
    stateMod = global.CodeTutor.state;
    storage = global.CodeTutor.storage;
  }

  var DOM = {
    codeInput: "code",
    ageSelect: "age",
    btnGo: "btn-go",
    stepContainer: "steps",
    indicator: "step-indicator",
    btnSample: "btn-sample"
  };

  var DEFAULT_PLACEHOLDER = "把代码粘贴到这里，点击『开始讲解』";
  var doneShown = false;
  var SAMPLE_CODE = 'print("你好，世界")\n' +
    "name = input(\"你叫什么名字？\")\n" +
    'print("你好，" + name + "！")\n' +
    "for i in range(3):\n" +
    '    print("开心", i + 1, "次")';
  var INDICATOR_STEPS = [
    { key: "overview", label: "概述" },
    { key: "blocks", label: "分块" },
    { key: "terms", label: "词表" },
    { key: "quiz", label: "测验" },
    { key: "challenge", label: "挑战" }
  ];

  function mergeQuizPicks(data) {
    data = data || {};
    return { quiz: data.quiz, answered: data.answered, picks: Object.assign({}, picks) };
  }

  /* 五步进度指示器（纯函数返回 HTML） */
  function renderIndicator(activeStep) {
    var idx = INDICATOR_STEPS.findIndex(function (s) { return s.key === activeStep; });
    var allDone = activeStep === "done";
    var html = '<ol class="step-indicator">';
    INDICATOR_STEPS.forEach(function (s, i) {
      var cls = "ind-item";
      if ((idx >= 0 && i < idx) || allDone) cls += " done";
      if (i === idx || (allDone && i === INDICATOR_STEPS.length - 1)) cls += " active";
      html += '<li class="' + cls + '"><span class="ind-num">' + (i + 1) + '</span><span class="ind-label">' + s.label + "</span></li>";
    });
    return html + "</ol>";
  }

  function updateIndicator(step) {
    if (els.indicator) els.indicator.innerHTML = renderIndicator(step || null);
  }

  /* 加载骨架屏 */
  function renderSkeleton() {
    return '<div class="skeleton" aria-hidden="true">' +
      '<div class="sk-line w60"></div><div class="sk-line"></div>' +
      '<div class="sk-line w80"></div><div class="sk-line w40"></div></div>';
  }

  var els = {};
  var session = null;   // 当前 LessonState
  var lastRequest = null; // {code, ageLevel} 供"再试一次"
  var picks = {};       // 每题用户所选选项: {题号: 选项下标}

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ===== 渲染（纯函数，返回 HTML 字符串，可单测） ===== */

  function renderStep(stepName, data) {
    data = data || {};
    switch (stepName) {
      case "overview":
        return '<section class="card step-overview"><h2>① 这段代码在做什么</h2>' +
          '<p class="overview-text">' + escapeHtml(data.overview) + "</p></section>";
      case "blocks":
        return renderBlocks(data);
      case "terms":
        return renderTerms(data);
      case "quiz":
        return renderQuiz(data);
      case "challenge":
        return renderChallenge(data);
      case "done":
        return '<section class="card step-done"><h2>⑤ 完成</h2><p>本节课已记录到学习历史（只存标签，不存代码）。' +
          '点击上方"重新讲得更简单"可反复巩固。</p></section>';
      default:
        return "";
    }
  }

  function renderBlocks(data) {
    var blocks = data.blocks || [];
    var html = '<section class="card step-blocks"><h2>② 分块讲解</h2>';
    blocks.forEach(function (b, i) {
      html += '<div class="block" data-block="' + i + '">' +
        '<h3>' + escapeHtml(b.title) + "</h3>" +
        "<p>" + escapeHtml(b.text) + "</p>" +
        '<button type="button" class="btn-reask" data-block="' + i + '">重新讲得更简单</button>' +
        "</div>";
    });
    return html + "</section>";
  }

  function renderTerms(data) {
    var terms = data.terms || [];
    if (terms.length === 0) return "";
    var html = '<section class="card step-terms"><h2>③ 关键词汇表</h2><table class="terms-table">' +
      "<thead><tr><th>术语</th><th>含义</th><th>类比</th></tr></thead><tbody>";
    terms.forEach(function (t) {
      html += "<tr><td class=\"term-name\">" + escapeHtml(t.term) + "</td><td>" + escapeHtml(t.def) +
        "</td><td>" + escapeHtml(t.analogy) + "</td></tr>";
    });
    return html + "</tbody></table></section>";
  }

  function renderQuiz(data) {
    var quiz = data.quiz || [];
    var answered = data.answered || [];
    var html = '<section class="card step-quiz"><h2>④ 提问测试（先想再看答案）</h2>';
    var letters = ["A", "B", "C"];
    quiz.forEach(function (q, i) {
      var isAnswered = answered.indexOf(i) >= 0;
      var picked = data.picks ? data.picks[i] : undefined;
      html += '<div class="quiz-item" data-quiz="' + i + '">' +
        '<p class="quiz-q">' + (i + 1) + ". " + escapeHtml(q.q) + "</p>" +
        '<div class="quiz-options">';
      q.options.forEach(function (opt, k) {
        var cls = "quiz-opt";
        var mark = "";
        if (isAnswered) {
          if (k === q.correct) { cls += " correct"; mark = " ✓"; }
          else if (k === picked) { cls += " wrong"; mark = " ✗"; }
          else cls += " dim";
        }
        html += '<button type="button" class="' + cls + '" data-quiz="' + i + '" data-opt="' + k + '">' +
          letters[k] + ". " + escapeHtml(opt) + mark + "</button>";
      });
      html += "</div>";
      if (isAnswered) {
        html += '<div class="quiz-answer">' +
          "<p>正确答案：" + letters[q.correct] + "</p>" +
          "<p>解析：" + escapeHtml(q.explain) + "</p></div>";
      } else {
        html += '<div class="quiz-answer hidden">答案隐藏，先作答</div>';
      }
      html += "</div>";
    });
    return html + "</section>";
  }

  function renderChallenge(data) {
    var c = data.challenge || {};
    var html = '<section class="card step-challenge"><h2>⑤ 改写挑战</h2>' +
      "<p class=\"challenge-task\">" + escapeHtml(c.task) + "</p>";
    if (data.accepted) {
      html += '<div class="challenge-hint"><strong>参考思路：</strong>' + escapeHtml(c.hint) + "</div>";
    } else {
      html += '<button type="button" class="btn-challenge">动手试试，然后看参考思路</button>';
    }
    return html + "</section>";
  }

  /* ===== DOM 操作 ===== */

  function showError(e) {
    var kindText = { timeout: "请求超时", http: "接口错误", parse: "解析失败", config: "配置缺失" }[e.kind] || "出错了";
    els.stepContainer.innerHTML = ""; // 清掉骨架屏/旧卡片，只留错误卡片
    var html = '<section class="card step-error"><h2>⚠ ' + escapeHtml(kindText) + "</h2>" +
      "<p>" + escapeHtml(e.message || "") + "</p>" +
      '<p class="hint">请检查 API 配置（右上角"接口设置"），或点击"再试一次"。</p>' +
      '<button type="button" class="btn-retry">再试一次</button></section>';
    els.stepContainer.insertAdjacentHTML("beforeend", html);
  }

  function setBusy(bool) {
    els.btnGo.disabled = bool;
    els.btnGo.textContent = bool ? "讲解中…" : "开始讲解";
    els.codeInput.disabled = bool;
    if (bool) {
      els.stepContainer.innerHTML = renderSkeleton();
      updateIndicator(null);
    }
  }

  /* ===== 事件 ===== */

  function handleStepEvent(payload) {
    if (payload.type === "step") {
      if (payload.step === "overview") els.stepContainer.innerHTML = ""; // 清除骨架屏
      var data = payload.step === "quiz" ? mergeQuizPicks(payload.data) : payload.data;
      var html = renderStep(payload.step, data);
      // quiz/challenge 会被 state 重发（作答后 / 接受挑战后）：替换旧卡片而非追加
      var cardClass = { quiz: ".step-quiz", challenge: ".step-challenge" }[payload.step];
      var old = cardClass ? els.stepContainer.querySelector(cardClass) : null;
      if (old) old.outerHTML = html;
      else els.stepContainer.insertAdjacentHTML("beforeend", html);
      updateIndicator(payload.step);
      return;
    }
    if (payload.type === "reask") {
      var block = els.stepContainer.querySelector('.block[data-block="' + payload.blockIndex + '"]');
      if (block) {
        block.innerHTML = "<h3>重新讲解：" + escapeHtml(payload.data.title) + "</h3>" +
          "<p>" + escapeHtml(payload.data.text) + "</p>";
      }
      return;
    }
    if (payload.type === "error") {
      showError({ kind: payload.data.kind, message: payload.data.message });
      setBusy(false);
      return;
    }
    if (payload.type === "done") {
      setBusy(false);
      if (!doneShown) {
        els.stepContainer.insertAdjacentHTML("beforeend", renderStep("done", {}));
        doneShown = true;
      }
      updateIndicator("done");
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    if (typeof global.scrollTo === "function") {
      global.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  }

  function startLesson(code, ageLevel) {
    lastRequest = { code: code, ageLevel: ageLevel };
    picks = {};
    doneShown = false;
    setBusy(true);
    session = new stateMod.LessonState(code, ageLevel, handleStepEvent);
    session.start().catch(function () { /* 错误已由 error 事件渲染 */ });
  }

  function onGoClick() {
    var code = els.codeInput.value.trim();
    if (!code) {
      els.codeInput.focus();
      els.codeInput.placeholder = "请先粘贴一段代码…";
      return;
    }
    startLesson(code, currentAge());
  }

  function onSampleClick() {
    els.codeInput.value = SAMPLE_CODE;
    els.codeInput.placeholder = DEFAULT_PLACEHOLDER;
    els.codeInput.focus();
  }

  function currentAge() {
    return parseInt(els.ageSelect.value, 10);
  }

  function onAgeChange() {
    storage.setAgeLevel(currentAge());
    if (session && lastRequest) {
      // 切换年龄段：清空旧卡片，重估词表重新讲解
      picks = {};
      doneShown = false;
      setBusy(true);
      var p = session.setAgeLevel(currentAge());
      if (p && p.catch) p.catch(function () { /* 错误已由 error 事件渲染 */ });
    }
  }

  function onContainerClick(ev) {
    var t = ev.target;
    var retry = t.closest(".btn-retry");
    if (retry && lastRequest) { startLesson(lastRequest.code, lastRequest.ageLevel); return; }

    var reask = t.closest(".btn-reask");
    if (reask && session) {
      var bi = parseInt(reask.getAttribute("data-block"), 10);
      reask.disabled = true;
      reask.textContent = "讲解中…";
      session.reexplain(bi).catch(function () { reask.disabled = false; reask.textContent = "重新讲得更简单"; });
      return;
    }

    var opt = t.closest(".quiz-opt");
    if (opt && session) {
      var qi = parseInt(opt.getAttribute("data-quiz"), 10);
      var oi = parseInt(opt.getAttribute("data-opt"), 10);
      picks[qi] = oi;
      session.answerQuiz(qi);   // 触发该题 reveal
      return;
    }

    var ch = t.closest(".btn-challenge");
    if (ch && session) { session.acceptChallenge(); return; }
  }

  function initConfigPanel() {
    var cfg = storage.getConfig();
    var base = document.getElementById("cfg-base");
    var key = document.getElementById("cfg-key");
    var model = document.getElementById("cfg-model");
    base.value = cfg.apiBase;
    key.value = cfg.apiKey;
    model.value = cfg.model;
    document.getElementById("btn-save-config").addEventListener("click", function () {
      storage.setConfig({ apiBase: base.value.trim(), apiKey: key.value.trim(), model: model.value.trim() });
      var tip = document.getElementById("cfg-saved");
      tip.style.display = "inline";
      setTimeout(function () { tip.style.display = "none"; }, 1500);
    });
  }

  function init() {
    els.codeInput = document.getElementById(DOM.codeInput);
    els.ageSelect = document.getElementById(DOM.ageSelect);
    els.btnGo = document.getElementById(DOM.btnGo);
    els.stepContainer = document.getElementById(DOM.stepContainer);
    els.indicator = document.getElementById(DOM.indicator);
    els.btnSample = document.getElementById(DOM.btnSample);

    els.ageSelect.value = String(storage.getAgeLevel());
    els.btnGo.addEventListener("click", onGoClick);
    els.btnSample.addEventListener("click", onSampleClick);
    els.ageSelect.addEventListener("change", onAgeChange);
    els.stepContainer.addEventListener("click", onContainerClick);
    els.codeInput.addEventListener("keydown", function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") onGoClick();
    });
    els.codeInput.addEventListener("input", function () {
      if (els.codeInput.placeholder !== DEFAULT_PLACEHOLDER) els.codeInput.placeholder = DEFAULT_PLACEHOLDER;
    });
    initConfigPanel();
  }

  var api = {
    renderStep: renderStep,
    showError: showError,
    setBusy: setBusy,
    init: init,
    DOM: DOM,
    mergeQuizPicks: mergeQuizPicks,
    renderIndicator: renderIndicator,
    renderSkeleton: renderSkeleton,
    SAMPLE_CODE: SAMPLE_CODE,
    _render: { renderBlocks: renderBlocks, renderTerms: renderTerms, renderQuiz: renderQuiz, renderChallenge: renderChallenge }
  };

  global.CodeTutor = global.CodeTutor || {};
  global.CodeTutor.ui = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
