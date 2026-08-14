#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中文代码教学器 — 本地轻量转发（可选）
解决浏览器直调 LLM API 的 CORS 问题，并保护 key（key 只从环境变量读取，不落盘、不出现在前端）。
用法：
    python server.py
    # 或
    set LLM_API_KEY=sk-xxx && python server.py
只转发 POST /api/chat（body: {"messages": [...], "model": "..."}），GET 静态服务本目录页面。
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen

API_BASE = os.environ.get("LLM_API_BASE", "https://api.deepseek.com/v1/chat/completions")
API_KEY = os.environ.get("LLM_API_KEY", "")
MODEL = os.environ.get("LLM_MODEL", "deepseek-chat")
PORT = int(os.environ.get("PORT", "8000"))
ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = ("index.html", "prompts.js", "storage.js", "llm.js", "state.js", "ui.js")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 静默访问日志（不记录请求内容）
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        name = self.path.split("?", 1)[0].lstrip("/") or "index.html"
        if name not in STATIC:
            self.send_error(404)
            return
        try:
            with open(os.path.join(ROOT, name), "rb") as f:
                body = f.read()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8" if name.endswith(".html") else "application/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/chat":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(n) or b"{}")
            messages = payload.get("messages")
            if not isinstance(messages, list) or not messages:
                raise ValueError("缺少 messages")
            model = payload.get("model") or MODEL
        except ValueError as e:
            self._json(400, {"error": str(e)})
            return
        if not API_KEY:
            self._json(500, {"error": "服务端未配置 LLM_API_KEY 环境变量"})
            return
        req = Request(
            API_BASE,
            data=json.dumps({"model": model, "messages": messages}, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + API_KEY},
            method="POST",
        )
        try:
            with urlopen(req, timeout=60) as r:
                body = r.read()
            self._json(200, json.loads(body.decode("utf-8")))
        except Exception as e:  # 转发失败：不落盘、不记录代码内容
            self._json(502, {"error": "转发 LLM 失败: %s" % e})

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("CodeTutor CN 本地代理已启动: http://127.0.0.1:%d （API: %s, 模型: %s）" % (PORT, API_BASE, MODEL))
    print("浏览器打开 http://127.0.0.1:%d 使用；Ctrl+C 退出" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
