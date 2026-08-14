/* 中文代码教学器 — localStorage 存取（隐私：不存代码本身）
 * UMD 双模式。接口契约见 架构设计.md §2.5。 */
(function (global) {
  "use strict";

  var KEY_AGE = "codetutor.age";
  var KEY_HISTORY = "codetutor.history";
  var KEY_CONFIG = "codetutor.config";

  function safeGet(key, fallback) {
    try {
      var v = global.localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  var pref = {
    getAgeLevel: function () {
      var v = safeGet(KEY_AGE, 3);
      return typeof v === "number" && v >= 0 && v <= 3 ? v : 3;
    },
    setAgeLevel: function (v) {
      safeSet(KEY_AGE, v);
    },
    getHistory: function () {
      var h = safeGet(KEY_HISTORY, []);
      return Array.isArray(h) ? h : [];
    },
    /* 只存课程标签（标题 + 时间戳），不存代码 */
    addHistory: function (label) {
      var h = this.getHistory();
      h.push({ label: String(label), time: new Date().toISOString() });
      safeSet(KEY_HISTORY, h.slice(-50));
    },
    /* LLM 配置：apiKey 可为空（代理模式由 server.py 从环境变量取 key） */
    getConfig: function () {
      var c = safeGet(KEY_CONFIG, {});
      return {
        apiBase: c.apiBase || "https://api.deepseek.com/v1/chat/completions",
        apiKey: c.apiKey || "",
        model: c.model || "deepseek-chat"
      };
    },
    setConfig: function (cfg) {
      var c = this.getConfig();
      if (typeof cfg.apiBase === "string") c.apiBase = cfg.apiBase;
      if (typeof cfg.apiKey === "string") c.apiKey = cfg.apiKey;
      if (typeof cfg.model === "string") c.model = cfg.model;
      safeSet(KEY_CONFIG, c);
    }
  };

  global.CodeTutor = global.CodeTutor || {};
  global.CodeTutor.storage = pref;
  if (typeof module !== "undefined" && module.exports) module.exports = pref;
})(typeof globalThis !== "undefined" ? globalThis : this);
