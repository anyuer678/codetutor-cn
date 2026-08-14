/* 中文代码教学器 — LLM 调用（网络唯一出口）
 * UMD 双模式。接口契约见 架构设计.md §2.2 / §4。
 * 依赖：prompts.js（LLM_JSON_SCHEMA / concatPrompt）。禁止读写 DOM。 */
(function (global) {
  "use strict";

  var prompts;
  if (typeof module !== "undefined" && module.exports) {
    var path = require("path");
    prompts = require(path.join(__dirname, "prompts.js"));
  } else {
    prompts = global.CodeTutor.prompts;
  }

  var LLM_JSON_SCHEMA = prompts.LLM_JSON_SCHEMA;
  var REQUEST_TIMEOUT_MS = 30000;

  class LlmError extends Error {
    constructor(kind, detail) {
      super(detail || kind);
      this.name = "LlmError";
      this.kind = kind;   // "timeout" | "http" | "parse" | "config"
      this.detail = detail;
    }
  }

  /* 契约校验（架构设计.md §4）：畸形数据返回 errors 而非 throw */
  function validateLesson(raw) {
    var errors = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, errors: ["响应不是对象"] };
    }
    if (typeof raw.overview !== "string" || !raw.overview.trim()) {
      errors.push("overview 缺失或非字符串");
    }
    if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) {
      errors.push("blocks 必须为非空数组");
    } else {
      raw.blocks.forEach(function (b, i) {
        if (!b || typeof b.title !== "string" || typeof b.text !== "string") {
          errors.push("blocks[" + i + "] 缺 title/text");
        }
      });
    }
    if (raw.terms == null) {
      errors.push("terms 缺失");
    } else if (!Array.isArray(raw.terms)) {
      errors.push("terms 必须为数组");
    } else {
      raw.terms.forEach(function (t, i) {
        if (!t || typeof t.term !== "string" || typeof t.def !== "string" || typeof t.analogy !== "string") {
          errors.push("terms[" + i + "] 缺 term/def/analogy");
        }
      });
    }
    if (!Array.isArray(raw.quiz) || raw.quiz.length === 0) {
      errors.push("quiz 必须为非空数组");
    } else {
      raw.quiz.forEach(function (q, i) {
        if (!q || typeof q.q !== "string") errors.push("quiz[" + i + "] 缺题干");
        if (!Array.isArray(q.options) || q.options.length !== 3) errors.push("quiz[" + i + "] options 必须恰好 3 项");
        if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 2) errors.push("quiz[" + i + "] correct 必须为 0-2 整数");
        if (typeof q.explain !== "string") errors.push("quiz[" + i + "] 缺 explain");
      });
    }
    if (!raw.challenge || typeof raw.challenge !== "object" ||
        typeof raw.challenge.task !== "string" || typeof raw.challenge.hint !== "string") {
      errors.push("challenge 缺 task/hint");
    }
    return errors.length === 0 ? { ok: true, data: raw } : { ok: false, errors: errors };
  }

  /* 从 OpenAI 兼容响应中取出 content 文本 */
  function extractContent(payload) {
    if (payload && payload.choices && payload.choices[0] && payload.choices[0].message) {
      var c = payload.choices[0].message.content;
      return typeof c === "string" ? c : JSON.stringify(c);
    }
    return JSON.stringify(payload);
  }

  /* 容错 JSON 解析：剥 ```json 围栏 / 截取首尾大括号 */
  function parseJSONStrict(text) {
    if (!text || typeof text !== "string") throw new LlmError("parse", "空响应");
    var s = text.trim();
    var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    var start = s.indexOf("{");
    var end = s.lastIndexOf("}");
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
    try {
      return JSON.parse(s);
    } catch (e) {
      throw new LlmError("parse", "JSON 解析失败: " + e.message);
    }
  }

  /* 单次 HTTP 调用；30s 超时；外部 signal 可取消 */
  function doFetch(apiBase, apiKey, model, system, user, externalSignal, rawText) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort(new DOMException("请求超时(30s)", "TimeoutError"));
    }, REQUEST_TIMEOUT_MS);
    var onExternalAbort = null;
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(new DOMException("已取消", "AbortError"));
      } else {
        onExternalAbort = function () {
          controller.abort(new DOMException("已取消", "AbortError"));
        };
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }
    var headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = "Bearer " + apiKey;
    return fetch(apiBase, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.4
      }),
      signal: controller.signal
    }).then(function (res) {
      if (!res.ok) throw new LlmError("http", "HTTP " + res.status + " " + res.statusText);
      return res.text();
    }).then(function (text) {
      var payload = parseJSONStrict(text);
      var content = extractContent(payload);
      return rawText ? content : parseJSONStrict(content);
    }).catch(function (err) {
      if (err instanceof LlmError) throw err;
      if (err && err.name === "TimeoutError") throw new LlmError("timeout", "请求超时，请再试一次或缩小代码篇幅");
      if (err && err.name === "AbortError") throw new LlmError("timeout", "请求已取消");
      throw new LlmError("http", "网络错误: " + (err && err.message ? err.message : String(err)));
    }).finally(function () {
      clearTimeout(timer);
      if (onExternalAbort) externalSignal.removeEventListener("abort", onExternalAbort);
    });
  }

  /* 主入口：请求完整讲解。校验失败自动重试一次（附纠错指令），仍败抛 LlmError */
  async function requestLesson(code, ageLevel, opts) {
    opts = opts || {};
    var apiBase = opts.apiBase, apiKey = opts.apiKey, model = opts.model, signal = opts.signal;
    if (!apiBase) throw new LlmError("config", "未配置 API 地址");
    if (!model) throw new LlmError("config", "未配置模型名");
    var p = prompts.concatPrompt(code, ageLevel);
    return doFetch(apiBase, apiKey, model, p.system, p.user, signal).then(function (raw) {
      var first = validateLesson(raw);
      if (first.ok) return first.data;
      var correction = p.user + "\n\n【纠错】上次输出不符合 JSON 契约：" +
        first.errors.join("；") + "。请严格按契约重新输出，只输出 JSON。";
      return doFetch(apiBase, apiKey, model, p.system, correction, signal).then(function (raw2) {
        var second = validateLesson(raw2);
        if (second.ok) return second.data;
        throw new LlmError("parse", "两次尝试均不符合契约: " + second.errors.join("；"));
      });
    });
  }

  /* 局部重讲（"我没听懂"）：纯文本返回 */
  async function requestReexplain(blockTitle, opts) {
    opts = opts || {};
    if (!opts.apiBase) throw new LlmError("config", "未配置 API 地址");
    if (!opts.model) throw new LlmError("config", "未配置模型名");
    return doFetch(opts.apiBase, opts.apiKey, opts.model,
      prompts.buildSystemPrompt(0),
      prompts.buildReexplainPrompt(blockTitle), opts.signal, true);
  }

  var api = {
    requestLesson: requestLesson,
    requestReexplain: requestReexplain,
    validateLesson: validateLesson,
    LlmError: LlmError,
    LLM_JSON_SCHEMA: LLM_JSON_SCHEMA
  };

  global.CodeTutor = global.CodeTutor || {};
  global.CodeTutor.llm = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
