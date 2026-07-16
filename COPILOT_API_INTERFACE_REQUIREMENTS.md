# Overleaf Copilot 接口设计文档

## 1. 文档目的

本文档用于定义 Overleaf Copilot 前端所需的后端接口，为后续 `services/llm` 与 `services/web` 的接口设计、路由拆分、Agent 化实现和前后端联调提供统一依据。

本文档基于 [COPILOT_FRONTEND_REQUIREMENTS.md](COPILOT_FRONTEND_REQUIREMENTS.md) 编写，并采用已确认的接口方案：

## 保留接口
- `POST /api/v1/llm/completion`
- `POST /api/v1/llm/llm`

## 新增接口
- `POST /api/v1/copilot/chat`
- `POST /api/v1/copilot/compile-diagnose`
- `POST /api/v1/copilot/checks/run`
- `POST /api/v1/copilot/checks/explain`
- `GET /api/v1/copilot/conversations/:conversationId`（可选）

该方案对应前端 5 个入口：

1. 行内补全
2. 选区 AI 圆球
3. 右侧 Copilot Panel
4. Compile Log 主动诊断入口
5. Checks 检查中心

明确不提供：
- slash command 相关接口

---

## 2. 设计原则

### 2.1 快路径与 Agent 路径分离

接口按职责分为两类：

#### A. 快路径接口
- `POST /api/v1/llm/completion`
- `POST /api/v1/llm/llm`

特点：
- 面向低延迟交互；
- 单轮请求/响应；
- 适合行内补全、选区改写、短文本生成。

#### B. Agent 路径接口
- `POST /api/v1/copilot/chat`
- `POST /api/v1/copilot/compile-diagnose`
- `POST /api/v1/copilot/checks/run`
- `POST /api/v1/copilot/checks/explain`
- `GET /api/v1/copilot/conversations/:conversationId`

特点：
- 面向项目级上下文；
- 可引入会话记忆；
- 可返回结构化结果；
- 适合 LangGraph Agent、工具调用、记忆管理与检查类任务。

### 2.2 统一响应外壳

除特殊下载类接口外，所有 Copilot 接口统一使用如下返回格式：

#### 成功
```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

#### 失败
```json
{
  "success": false,
  "error": {
    "code": "COPILOT_TIMEOUT",
    "message": "request timed out"
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

要求：
- 不再混用 `message`、裸字符串、`data: string` 等多种格式；
- 前端只依赖 `success / data / error / meta` 四个一级字段；
- `meta.requestId` 建议在所有接口中统一提供，便于日志追踪。

### 2.3 统一上下文对象

为减少接口之间字段风格漂移，建议统一定义以下上下文对象：

#### ProjectContext
```json
{
  "projectId": "project_123",
  "rootDocId": "doc_main",
  "fileList": ["main.tex", "sections/intro.tex"],
  "outline": ["Introduction", "Method", "Experiments"]
}
```

#### EditorContext
```json
{
  "currentFile": "main.tex",
  "language": "tex",
  "cursorOffset": 1024,
  "selection": {
    "text": "selected text",
    "from": 100,
    "to": 130
  }
}
```

#### ConversationContext
```json
{
  "conversationId": "conv_xxx",
  "source": "selection",
  "tab": "write"
}
```

其中：
- `source` 枚举建议为：`completion | selection | panel | compile | checks`
- `tab` 枚举建议为：`ask | write | fix | check`

---

## 3. 接口总览

| 接口 | 用途 | 对应前端入口 | 类型 |
|---|---|---|---|
| `POST /api/v1/llm/completion` | 行内补全 | 入口 1 | 保留 |
| `POST /api/v1/llm/llm` | 选区 AI 编辑/生成 | 入口 2 | 保留 |
| `POST /api/v1/copilot/chat` | Copilot Panel 多轮对话/写作/问答 | 入口 3 | 新增 |
| `POST /api/v1/copilot/compile-diagnose` | 编译错误解释与修复建议 | 入口 4 | 新增 |
| `POST /api/v1/copilot/checks/run` | 运行项目级检查 | 入口 5 | 新增 |
| `POST /api/v1/copilot/checks/explain` | 对单 issue 进行解释或修复建议 | 入口 5 | 新增 |
| `GET /api/v1/copilot/conversations/:conversationId` | 获取对话历史 | 入口 3/4/5 | 可选 |

---

## 4. 认证与网关约束

### 4.1 Web 代理层

当前 `services/web` 已存在对 LLM 服务的代理入口：
- [services/web/app/src/Features/Llm/LlmController.js](services/web/app/src/Features/Llm/LlmController.js)

建议后续对 Copilot 新接口也通过 Web 层统一代理，保持：
- Cookie 透传；
- Authorization 透传；
- 统一超时；
- 统一错误包装。

### 4.2 用户身份

Copilot 后端继续复用现有用户身份体系：
- 由 Web 层透传 Cookie / Auth 头；
- `services/llm` 内部继续通过现有用户解析逻辑识别用户；
- 前端请求体中不额外传递 `userId`。

---

## 5. 通用数据结构

## 5.1 SuccessMeta
```json
{
  "requestId": "req_xxx",
  "model": "model_id",
  "latencyMs": 320
}
```

## 5.2 ErrorObject
```json
{
  "code": "COPILOT_BAD_REQUEST",
  "message": "missing projectId"
}
```

## 5.3 MessageBlock

为适配 Panel / Fix / Checks 的统一渲染，建议 Agent 路径接口支持 `blocks`：

```json
{
  "type": "text",
  "text": "..."
}
```

支持的 `type` 建议包括：
- `text`
- `markdown`
- `code`
- `file_refs`
- `diagnostic`
- `issue_list`
- `suggested_fix`
- `actions`

示例：
```json
{
  "role": "assistant",
  "content": "human readable summary",
  "blocks": [
    { "type": "text", "text": "..." },
    { "type": "code", "language": "latex", "text": "\\begin{table}..." },
    {
      "type": "file_refs",
      "items": [
        { "path": "main.tex", "line": 12, "label": "Possible main file" }
      ]
    }
  ]
}
```

---

## 6. 接口详细设计

## 6.1 `POST /api/v1/llm/completion`

### 用途
用于编辑器行内补全，要求低延迟，不走复杂 Agent Loop。

### 请求体
```json
{
  "projectId": "project_123",
  "rootDocId": "doc_main",
  "currentFile": "main.tex",
  "language": "tex",
  "cursorOffset": 1024,
  "leftContext": "\\section{Introduction}\nThis paper proposes",
  "rightContext": "\n\\subsection{Method}",
  "maxLength": 128,
  "fileList": [
    "main.tex",
    "sections/intro.tex",
    "sections/method.tex",
    "references.bib"
  ],
  "outline": [
    "Introduction",
    "Method",
    "Experiments",
    "Conclusion"
  ]
}
```

### 字段说明
- `projectId`：项目 ID
- `rootDocId`：主文档 ID
- `currentFile`：当前编辑文件路径
- `language`：文件语言，当前通常为 `tex`
- `cursorOffset`：光标偏移
- `leftContext`：光标左侧上下文
- `rightContext`：光标右侧上下文
- `maxLength`：最大补全文本长度
- `fileList`：项目文件列表
- `outline`：项目大纲

### 成功响应
```json
{
  "success": true,
  "data": {
    "completion": " a novel framework for ...",
    "displayText": " a novel framework for ...",
    "replaceRange": {
      "from": 1024,
      "to": 1024
    }
  },
  "meta": {
    "requestId": "req_xxx",
    "model": "model_id",
    "latencyMs": 320
  }
}
```

### 响应字段说明
- `completion`：完整建议文本，接受后写入文档
- `displayText`：用于 ghost text 展示，可与 `completion` 相同
- `replaceRange`：保留扩展能力，支持未来中间补全

### 设计说明
- 该接口继续作为 **快路径**；
- 不建议直接走复杂 Agent、多工具调用、多轮记忆；
- 后端仍可复用现有 `LlmClient.completion(...)` 能力。

---

## 6.2 `POST /api/v1/llm/llm`

### 用途
用于选区 AI 圆球触发的单轮编辑/改写/生成请求。

### 请求体
```json
{
  "project": {
    "projectId": "project_123",
    "rootDocId": "doc_main",
    "fileList": [
      "main.tex",
      "sections/intro.tex",
      "references.bib"
    ],
    "outline": [
      "Introduction",
      "Method",
      "Experiments"
    ]
  },
  "editor": {
    "currentFile": "sections/intro.tex",
    "language": "tex",
    "selection": {
      "text": "In this paper, we study ...",
      "from": 120,
      "to": 180
    }
  },
  "action": {
    "type": "paraphrase",
    "prompt": "",
    "mode": "selection"
  },
  "conversation": {
    "conversationId": "conv_sel_001",
    "source": "selection"
  }
}
```

### `action.type` 枚举建议
- `paraphrase`
- `style_scientific`
- `style_concise`
- `style_punchy`
- `split`
- `join`
- `summarize`
- `explain`
- `generate_title`
- `generate_abstract`
- `generate_table`
- `generate_formula`
- `generate_algorithm`
- `custom`

说明：
- 当 `type = custom` 时，`prompt` 必填。

### 成功响应示例：改写类
```json
{
  "success": true,
  "data": {
    "resultType": "rewrite",
    "content": "This study investigates ...",
    "title": "Paraphrased Result",
    "operations": [
      "replace",
      "copy",
      "regenerate",
      "edit"
    ],
    "diff": {
      "before": "In this paper, we study ...",
      "after": "This study investigates ..."
    }
  },
  "meta": {
    "requestId": "req_xxx",
    "model": "model_id"
  }
}
```

### 成功响应示例：生成类
```json
{
  "success": true,
  "data": {
    "resultType": "insertable_block",
    "content": "\\begin{table} ... \\end{table}",
    "format": "latex",
    "operations": [
      "insert",
      "copy",
      "regenerate",
      "edit"
    ]
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

### 设计说明
- 该接口主要面向选区短流程；
- 可先兼容现有前端实现；
- 后续若需要，也可以逐步迁移为更语义化的 `/api/v1/copilot/edit`，但本方案当前不要求改名。

---

## 6.3 `POST /api/v1/copilot/chat`

### 用途
用于右侧 Copilot Panel 的主对话接口，承接：
- 项目级问答
- 结构化写作
- Fix / Check 场景中的深入追问
- 多轮会话

### 请求体
```json
{
  "conversation": {
    "conversationId": "conv_panel_001",
    "source": "panel",
    "tab": "ask"
  },
  "project": {
    "projectId": "project_123",
    "rootDocId": "doc_main"
  },
  "context": {
    "currentFile": "main.tex",
    "selectedText": "",
    "attachedFiles": [],
    "recentCompileErrorId": null
  },
  "message": {
    "role": "user",
    "content": "总结一下这个项目的结构，并告诉我 main 文件可能是哪一个"
  }
}
```

### 成功响应
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_panel_001",
    "message": {
      "role": "assistant",
      "content": "这个项目主要由 ...",
      "blocks": [
        {
          "type": "text",
          "text": "这个项目主要由 ..."
        },
        {
          "type": "file_refs",
          "items": [
            { "path": "main.tex", "label": "Possible main file" },
            { "path": "sections/intro.tex", "label": "Introduction section" }
          ]
        }
      ]
    },
    "suggestedActions": [
      {
        "type": "followup",
        "label": "总结 related work"
      },
      {
        "type": "open_file",
        "label": "打开 main.tex",
        "path": "main.tex"
      }
    ]
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

### 设计说明
- `conversationId` 是 Panel 记忆能力的关键字段；
- `tab` 有助于后端根据 Ask / Write / Fix / Check 采用不同 prompt 或 graph 分支；
- `blocks` 支持 Panel 多类型渲染。

---

## 6.4 `POST /api/v1/copilot/compile-diagnose`

### 用途
用于 Compile Log 主动诊断入口，在编译失败后返回结构化错误解释与修复建议。

### 请求体
```json
{
  "conversation": {
    "conversationId": "conv_fix_001",
    "source": "compile"
  },
  "project": {
    "projectId": "project_123",
    "rootDocId": "doc_main"
  },
  "compile": {
    "compileId": "compile_456",
    "status": "failed",
    "logText": "Undefined control sequence ...",
    "annotations": [
      {
        "file": "main.tex",
        "line": 128,
        "severity": "error",
        "message": "Undefined control sequence \\abc"
      }
    ]
  },
  "editor": {
    "currentFile": "main.tex"
  }
}
```

### 成功响应
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_fix_001",
    "summary": "编译失败的主要原因是未定义命令 \\abc。",
    "diagnostics": [
      {
        "id": "diag_1",
        "title": "Undefined control sequence",
        "whatHappened": "LaTeX 遇到了未定义命令 \\abc。",
        "likelyCause": "可能缺少宏包，或命令名拼写错误。",
        "suggestedFix": "检查是否需要引入对应宏包，或将 \\abc 改为正确命令。",
        "location": {
          "file": "main.tex",
          "line": 128
        },
        "actions": [
          "jump_to_line",
          "copy",
          "regenerate"
        ]
      }
    ]
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

### 设计说明
- 该接口建议独立，不复用普通 chat；
- 输入结构化 compile log，输出结构化 diagnostic；
- 后续适合接入日志解析、文件片段读取、编译错误分类等工具。

---

## 6.5 `POST /api/v1/copilot/checks/run`

### 用途
运行项目级检查，返回结构化 issue list。

### 请求体
```json
{
  "conversation": {
    "conversationId": "conv_check_001",
    "source": "checks"
  },
  "project": {
    "projectId": "project_123",
    "rootDocId": "doc_main"
  },
  "checks": [
    "citations",
    "references",
    "figures_tables",
    "terminology"
  ],
  "options": {
    "includeSuggestions": true
  }
}
```

### `checks` 枚举建议
- `citations`
- `references`
- `figures_tables`
- `terminology`

### 成功响应
```json
{
  "success": true,
  "data": {
    "runId": "checkrun_001",
    "summary": {
      "total": 5,
      "byType": {
        "citations": 2,
        "references": 1,
        "terminology": 2
      }
    },
    "issues": [
      {
        "id": "issue_1",
        "type": "citations",
        "severity": "warning",
        "title": "Undefined citation: foo2024",
        "description": "正文中引用了 foo2024，但 bibliography 中未找到。",
        "location": {
          "file": "sections/related.tex",
          "line": 45
        },
        "actions": [
          "view_details",
          "jump_to_file",
          "explain_with_copilot",
          "suggest_fix"
        ]
      }
    ]
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

### 设计说明
- checks 本质是扫描任务，不适合直接复用纯文本 chat；
- 返回 issue list 后，前端可在 Check tab 中进行结构化展示。

---

## 6.6 `POST /api/v1/copilot/checks/explain`

### 用途
对单条 check issue 进行解释、修复建议或进一步分析。

### 请求体
```json
{
  "conversation": {
    "conversationId": "conv_check_001",
    "source": "checks"
  },
  "project": {
    "projectId": "project_123"
  },
  "issue": {
    "id": "issue_1",
    "type": "citations",
    "title": "Undefined citation: foo2024",
    "description": "正文中引用了 foo2024，但 bibliography 中未找到。",
    "location": {
      "file": "sections/related.tex",
      "line": 45
    }
  }
}
```

### 成功响应
```json
{
  "success": true,
  "data": {
    "message": {
      "role": "assistant",
      "content": "这个问题表示正文中的 cite key 在 bib 文件中不存在 ...",
      "blocks": [
        {
          "type": "text",
          "text": "这个问题表示正文中的 cite key 在 bib 文件中不存在 ..."
        },
        {
          "type": "suggested_fix",
          "text": "请检查 references.bib 中是否存在 foo2024，或修正 cite key。"
        }
      ]
    }
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

### 设计说明
- `checks/run` 负责批量扫描；
- `checks/explain` 负责单问题深挖；
- 两者拆开有利于性能和前端交互清晰度。

---

## 6.7 `GET /api/v1/copilot/conversations/:conversationId`（可选）

### 用途
获取 Panel / Fix / Check 相关的历史消息，用于会话恢复。

### 路径参数
- `conversationId`：对话 ID

### 成功响应
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_panel_001",
    "messages": [
      {
        "role": "user",
        "content": "总结一下这个项目结构"
      },
      {
        "role": "assistant",
        "content": "这个项目主要由 ..."
      }
    ]
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

### 设计说明
- 该接口不是第一阶段必需项；
- 但如果 Panel 需要跨关闭/刷新恢复会话，则很有帮助。

---

## 7. 前端入口与接口映射

| 前端入口 | 功能 | 主接口 | 备注 |
|---|---|---|---|
| 入口 1：行内补全 | ghost text 补全 | `POST /api/v1/llm/completion` | 快路径 |
| 入口 2：选区 AI 圆球 | 改写/生成/自由描述 | `POST /api/v1/llm/llm` | 兼容现有实现 |
| 入口 3：Copilot Panel | Ask / Write / Fix / Check | `POST /api/v1/copilot/chat` | Agent 主入口 |
| 入口 4：Compile Log CTA | 编译错误诊断 | `POST /api/v1/copilot/compile-diagnose` | 结构化输出 |
| 入口 5：Checks | 项目级检查 | `POST /api/v1/copilot/checks/run` | issue list |
| 入口 5 子操作 | issue 解释/修复建议 | `POST /api/v1/copilot/checks/explain` | 单问题深挖 |

---

## 8. 错误码建议

建议统一错误码前缀：`COPILOT_*`

示例：
- `COPILOT_BAD_REQUEST`
- `COPILOT_UNAUTHORIZED`
- `COPILOT_FORBIDDEN`
- `COPILOT_TIMEOUT`
- `COPILOT_UPSTREAM_ERROR`
- `COPILOT_CONTEXT_TOO_LARGE`
- `COPILOT_UNSUPPORTED_ACTION`
- `COPILOT_CHECK_RUN_FAILED`
- `COPILOT_COMPILE_LOG_MISSING`

要求：
- code 给前端做分支；
- message 给用户展示；
- 详细内部错误仍记录在服务端日志中。

---

## 9. 与当前 `services/llm` 的映射建议

### 9.1 保留现有 Controller/Service 能力
当前已有：
- `completion(...)`
- `chat(...)`

可继续用于：
- `/api/v1/llm/completion`
- `/api/v1/llm/llm`

### 9.2 新增 Copilot 路由层
建议新增：
- `services/llm/app/controllers/copilot.controller.js`
- `services/llm/app/routes/copilot.routes.js`
- `services/llm/app/services/copilot.service.js`

内部再细分：
- `chat`
- `compileDiagnose`
- `runChecks`
- `explainCheckIssue`
- `getConversation`

### 9.3 Web 层代理
建议在 `services/web` 中增加对 `/api/v1/copilot/*` 的代理入口，风格与现有 LLM 代理保持一致。

---

## 10. 第一阶段最小闭环

如果要先做最小可落地版本，建议优先实现：

### 必需
- `POST /api/v1/llm/completion`
- `POST /api/v1/llm/llm`
- `POST /api/v1/copilot/chat`
- `POST /api/v1/copilot/compile-diagnose`
- `POST /api/v1/copilot/checks/run`

### 第二阶段补充
- `POST /api/v1/copilot/checks/explain`
- `GET /api/v1/copilot/conversations/:conversationId`

---

## 11. 结论

本文档确认采用如下接口方案：

## 保留
- `POST /api/v1/llm/completion`
- `POST /api/v1/llm/llm`

## 新增
- `POST /api/v1/copilot/chat`
- `POST /api/v1/copilot/compile-diagnose`
- `POST /api/v1/copilot/checks/run`
- `POST /api/v1/copilot/checks/explain`
- `GET /api/v1/copilot/conversations/:conversationId`（可选）

该方案兼顾：
- 当前前端兼容性；
- 后续 LangGraph Agent 化；
- 项目级 Panel / Fix / Checks 的结构化需求；
- 快路径与复杂路径分离。

后续若进入后端详细设计阶段，可以在此基础上继续补充：
- OpenAPI 文档；
- TS/JS 类型定义；
- Controller/Service/Mapper 分层；
- conversationId、memory、tool call 的实现细节。
