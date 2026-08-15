# 交付清单 — 中文代码教学器（CodeTutor CN）

## 一、文件清单

```
index.html      单页骨架 + 样式（普通 script 顺序加载，file:// 可用）
prompts.js      年龄分级词表 + 角色卡 + JSON 契约（纯文本，无网络）
storage.js      localStorage（只存年龄偏好/配置/学习标签，不存代码）
llm.js          网络唯一出口：请求/超时/契约校验/容错重试
state.js        教学会话状态机（五步推进、重讲、练答判定）
ui.js           DOM 渲染与交互（renderStep 纯函数返回 HTML）
server.py       可选本地代理：CORS 转发 + key 保护（纯标准库，PORT 环境变量）
examples/       3 组演示用例（5 行 / 20 行 / 50 行含报错）
package.json    node --test 测试入口
tests/
  test_prompt.py   11 项（pytest）：词表映射、禁用词断言、JSON 契约
  test_*.js        32 项（node --test）：契约校验容错、渲染五步、答案隐藏、
                   状态机、mock fetch、浏览器全流程集成
```

## 二、验证结果（本机 Windows / Python 3.12.3）

- `node --test tests/` → **32 passed**（含浏览器全流程集成：示例填入/骨架屏/答题标色/挑战收尾/切龄重讲）
- `python -m pytest tests/test_prompt.py -q` → **11 passed**
- Web 端到端：`GET /` → 200；`llm.js` → 200；无 key 时 `/api/chat` 明确报错（不泄露）
- mock LLM 转发链路：`server.py` 收到请求 → 转发 OpenAI 兼容端点 → 教学 JSON 契约（overview/blocks/terms/quiz/challenge）正确返回
- 页面零依赖：`file://` 直接打开可用（无需服务器）

## 三、接口核对清单（架构设计 §2.2/§4，全部通过）

- [x] `validateLesson(raw)` 契约校验：畸形数据返回 errors 而非 throw
- [x] `requestLesson(code, ageLevel, opts)`：契约失败自动重试一次（附纠错指令）
- [x] `requestReexplain(blockTitle, opts)`：局部重讲纯文本返回
- [x] LLM 超时 30s（AbortController）+ 外部 signal 可取消
- [x] `server.py` 转发：key 仅从环境变量读取，不落盘、不记录请求内容

## 四、本轮交付（打磨 + 协议统一）

**打磨（index.html）**

- 装饰性 emoji 清理：logo「📚」→「讲」字、设置「⚙」/示例「✨」/保存「✓」→ 文字
- 保留功能性状态标记（答题 ✓/✗、错误 ⚠）——语义符号非装饰
- 保留原有暖色教学主题（单一主题，无多主题切换）

**协议**

- LICENSE 统一为 GPL-3.0（Copyright (C) 2026 anyuer678）；pyproject 补声明

## 五、安全与隐私

- 粘贴的代码只在本机浏览器内存处理；不上传除配置的 API 端点以外的任何地方
- localStorage 只存年龄偏好、接口配置与课程标签，**不存代码本身**
- 本地代理 `server.py` 不落盘、不记录请求内容；key 仅从环境变量读取

## 六、与文档的偏差

- `server.py` 端口由环境变量 `PORT` 控制（默认 8000），无 `--port` 参数（README 已注明）
- 纯自学习工具，非认证课程，无账号体系；LLM 响应超 30s 提示重试
