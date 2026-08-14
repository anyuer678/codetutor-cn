/* 中文代码教学器 — 教学会话状态机（核心纯逻辑）
 * UMD 双模式。接口契约见 架构设计.md §2.1。
 * 依赖：prompts.js / llm.js / storage.js。不读写 DOM。 */
(function (global) {
  "use strict";

  var deps;
  if (typeof module !== "undefined" && module.exports) {
    var path = require("path");
    deps = {
      prompts: require(path.join(__dirname, "prompts.js")),
      llm: require(path.join(__dirname, "llm.js")),
      storage: require(path.join(__dirname, "storage.js"))
    };
  } else {
    deps = { prompts: global.CodeTutor.prompts, llm: global.CodeTutor.llm, storage: global.CodeTutor.storage };
  }

  var AGE_LEVELS = { kids: 0, child: 1, teen: 2, adult: 3 };
  var STEPS = ["idle", "overview", "blocks", "terms", "quiz", "challenge", "done"];

  class LessonState {
    /**
     * @param {string} code       用户代码
     * @param {number} ageLevel   0-3
     * @param {(payload)=>void} onStep
     *   回报事件: {type:"step", step, data} / {type:"reask", blockIndex, data} / {type:"done"} / {type:"error", data}
     */
    constructor(code, ageLevel, onStep) {
      this.code = code;
      this.ageLevel = ageLevel;
      this.onStep = onStep;
      this.step = "idle";
      this.lesson = null;
      this.answered = [];
      this.accepted = false;
    }

    emit(type, extra) {
      var payload = { type: type };
      for (var k in extra) if (extra.hasOwnProperty(k)) payload[k] = extra[k];
      if (this.onStep) this.onStep(payload);
    }

    llmOpts() {
      return deps.storage.getConfig();
    }

    /* 发起完整讲解：成功则按序回报五步 + done */
    start() {
      this.step = "overview";
      var self = this;
      return deps.llm.requestLesson(this.code, this.ageLevel, this.llmOpts())
        .then(function (lesson) {
          self.lesson = lesson;
          self.answered = [];
          self.accepted = false;
          self.step = "overview";
          self.emit("step", { step: "overview", data: { overview: lesson.overview } });
          self.emit("step", { step: "blocks", data: { blocks: lesson.blocks } });
          self.emit("step", { step: "terms", data: { terms: lesson.terms } });
          self.emit("step", { step: "quiz", data: { quiz: lesson.quiz, answered: [] } });
          self.emit("step", { step: "challenge", data: { challenge: lesson.challenge, accepted: false } });
          self.step = "done";
          self.emit("done", {});
          deps.storage.addHistory(self.summaryLabel());
        })
        .catch(function (err) {
          self.emit("error", { data: { kind: err.kind, message: err.detail || err.message } });
          throw err;
        });
    }

    summaryLabel() {
      var first = this.code.replace(/\s+/g, " ").trim().slice(0, 24);
      return first ? "讲解：" + first : "讲解：一段代码";
    }

    /* 只重讲某块（kid 词表），回报 {type:"reask", blockIndex, data} */
    reexplain(blockIndex) {
      var self = this;
      var block = this.lesson && this.lesson.blocks[blockIndex];
      if (!block) return Promise.resolve();
      return deps.llm.requestReexplain(block.title, this.llmOpts())
        .then(function (text) {
          self.emit("reask", { blockIndex: blockIndex, data: { title: block.title, text: text } });
        })
        .catch(function (err) {
          self.emit("error", { data: { kind: err.kind, message: err.detail || err.message } });
          throw err;
        });
    }

    /* 练答判定：记录答案并触发该题答案展示 */
    answerQuiz(answerIndex) {
      if (!this.lesson || this.answered.indexOf(answerIndex) >= 0) return;
      this.answered.push(answerIndex);
      this.emit("step", { step: "quiz", data: { quiz: this.lesson.quiz, answered: this.answered.slice() } });
    }

    /* 公布挑战参考思路（hint）并完成会话 */
    acceptChallenge() {
      if (!this.lesson) return;
      this.accepted = true;
      this.emit("step", { step: "challenge", data: { challenge: this.lesson.challenge, accepted: true } });
      this.step = "done";
      this.emit("done", {});
    }

    /* 中途切换年龄分级：重估词表并重新讲解 */
    setAgeLevel(level) {
      if (level === this.ageLevel || level < 0 || level > 3) return;
      this.ageLevel = level;
      if (this.lesson) return this.start();
    }
  }

  var api = { LessonState: LessonState, AGE_LEVELS: AGE_LEVELS, STEPS: STEPS };

  global.CodeTutor = global.CodeTutor || {};
  global.CodeTutor.state = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
