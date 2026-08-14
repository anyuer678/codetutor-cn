# -*- coding: utf-8 -*-
"""中文代码教学器 — 契约测试（pytest）
断言对象是真实 JS 代码（经 node 子进程执行），不依赖网络。
覆盖：年龄分级词表映射、kids 禁用词、JSON 契约字段、validateLesson 容错。
"""
import json
import subprocess

import pytest

ROOT = __import__("pathlib").Path(__file__).resolve().parent.parent


def run_js(expr):
    """在 node 中 require 真实模块并执行表达式，返回 JSON 结果。"""
    script = (
        "const prompts = require(%s);\n"
        "const llm = require(%s);\n"
        "console.log(JSON.stringify(%s));"
    ) % (
        json.dumps(str(ROOT / "prompts.js")),
        json.dumps(str(ROOT / "llm.js")),
        expr,
    )
    proc = subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, encoding="utf-8", timeout=30
    )
    assert proc.returncode == 0, "node 执行失败: %s" % proc.stderr
    return json.loads(proc.stdout.strip())


def js_bool(expr):
    return bool(run_js(expr))


# ---------- 年龄分级词表映射 ----------

def test_age_rules_four_levels():
    rules = run_js("prompts.AGE_RULES")
    assert set(rules.keys()) == {"0", "1", "2", "3"}
    assert rules["0"]["name"] == "幼儿园"
    assert rules["3"]["name"] == "成人"


def test_kids_ban_words_in_rules():
    rules = run_js("prompts.AGE_RULES")
    for banned in ["迭代器", "异步", "对象"]:
        assert banned in rules["0"]["ban"], "幼儿园词表必须禁用 %s" % banned
    assert "递归" in rules["1"]["ban"]


def test_kids_system_prompt_no_ban_words():
    """真实 buildSystemPrompt(0) 输出不含禁用词（架构设计.md §6 断言测试）。"""
    text = run_js("prompts.buildSystemPrompt(0)")
    for banned in ["迭代器", "异步", "对象", "递归"]:
        assert banned not in text, "kids 提示词含禁用词: %s" % banned


def test_teen_prompt_allows_terms():
    text = run_js("prompts.buildSystemPrompt(2)")
    assert "函数" in text and "循环" in text


def test_system_prompt_role_prefix():
    """prompt 结构：[角色]中文编程讲师，对象{年龄段}，词汇要求{限制}（开发规范.md §3）。"""
    text = run_js("prompts.buildSystemPrompt(0)")
    assert "中文编程讲师" in text and "词汇要求" in text and "幼儿园" in text


# ---------- JSON 契约 ----------

def test_llm_schema_contains_all_fields():
    schema = run_js("prompts.LLM_JSON_SCHEMA")
    for field in ["overview", "blocks", "terms", "quiz", "challenge", "options", "correct", "explain", "hint"]:
        assert field in schema, "契约缺少字段: %s" % field


def test_concat_prompt_structure():
    pair = run_js("prompts.concatPrompt('print(1)', 0)")
    assert pair["system"].startswith("你是中文编程讲师")
    assert "[代码]" in pair["user"] and "[输出要求]" in pair["user"]


# ---------- validateLesson 契约校验容错（真实 JS） ----------

def valid_lesson():
    return {
        "overview": "打印问候",
        "blocks": [{"title": "开头", "text": "打招呼"}],
        "terms": [{"term": "print", "def": "打印", "analogy": "喊话"}],
        "quiz": [{"q": "哪个对?", "correct": 0, "options": ["A", "B", "C"], "explain": "因为 A"}],
        "challenge": {"task": "改数字", "hint": "试试 3"},
    }


def test_validate_lesson_valid():
    assert js_bool("llm.validateLesson(%s).ok" % json.dumps(valid_lesson(), ensure_ascii=False))


def test_validate_lesson_missing_overview():
    data = valid_lesson()
    del data["overview"]
    result = run_js("llm.validateLesson(%s)" % json.dumps(data, ensure_ascii=False))
    assert result["ok"] is False
    assert any("overview" in e for e in result["errors"])


def test_validate_lesson_bad_quiz():
    """quiz options 长度、correct 越界必须报错（返回 errors 而非 throw）。"""
    data = valid_lesson()
    data["quiz"] = [{"q": "题", "correct": 5, "options": ["A", "B"], "explain": "x"}]
    result = run_js("llm.validateLesson(%s)" % json.dumps(data, ensure_ascii=False))
    assert result["ok"] is False
    joined = "".join(result["errors"])
    assert "options" in joined and "correct" in joined


def test_validate_lesson_not_object():
    result = run_js("llm.validateLesson(null)")
    assert result["ok"] is False and result["errors"]
