/* 中文代码教学器 — storage.js 测试（node:test，注入 fake localStorage） */
"use strict";
const test = require("node:test");
const assert = require("node:assert");

// 在 require 之前注入 fake localStorage
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};

const storage = require("../storage.js");

test("年龄偏好存取（key: codetutor.age）", () => {
  storage.setAgeLevel(0);
  assert.equal(storage.getAgeLevel(), 0);
  assert.equal(store["codetutor.age"], "0");
});

test("非法年龄回退默认 3", () => {
  store["codetutor.age"] = JSON.stringify(99);
  assert.equal(storage.getAgeLevel(), 3);
});

test("默认配置为 DeepSeek 兼容端点", () => {
  const c = storage.getConfig();
  assert.ok(c.apiBase.includes("deepseek"));
  assert.equal(c.model, "deepseek-chat");
});

test("配置存取：apiKey 可留空（代理模式）", () => {
  storage.setConfig({ apiBase: "http://127.0.0.1:8000/api/chat", model: "m2" });
  const c = storage.getConfig();
  assert.equal(c.apiBase, "http://127.0.0.1:8000/api/chat");
  assert.equal(c.model, "m2");
  assert.equal(c.apiKey, "");
});

test("学习历史只存标签不存代码", () => {
  storage.addHistory("讲解：print(1)");
  const h = storage.getHistory();
  assert.equal(h.length, 1);
  assert.equal(h[0].label, "讲解：print(1)");
  assert.ok(!JSON.stringify(h).includes("代码内容"));
});
