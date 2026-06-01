# Plan: Model 层与 Agent Loop

## Chapter 1: 核心变更与澄清

### 1. 核心变更回顾

**文件变更清单：**

| 文件路径 | 变更类型 | 说明 | Review |
|---------|---------|------|:------:|
| `src/model.ts` | 新增 | Model 层，封装大模型调用逻辑，对外暴露 `invoke(messages, tools)` 方法 | - |
| `src/agent-loop.ts` | 新增 | Agent Loop 核心循环逻辑，负责组装提示词、调用 Model、处理工具调用 | - |
| `src/index.ts` | 修改 | 修改入口文件，导出 Model 和 AgentLoop | - |
| `package.json` | 修改 | 不引入 `openai` SDK，直接用原生 `fetch` 手写 HTTP 请求 | - |

**预期行为变更：**

引入一个最小可用的 Agent 执行框架。`Model.invoke()` 负责将消息和工具描述发送到 LLM 并返回响应；`AgentLoop` 持续调用 `Model.invoke()`，当响应中包含工具调用时将其结果追加回对话上下文，直到模型返回纯文本回复为止。

### 2. 澄清问题

| 序号 | 问题 | 选项 | 评审状态 |
|:---:|------|------|:-------:|
| 1 | **LLM Provider & API 格式** | A. 基于 OpenAI SDK（兼容 OpenAI / DeepSeek / 其他 OpenAI-compatible 服务）<br>B. 基于 Anthropic Claude SDK<br>C. 抽象一个通用接口，暂时只实现 OpenAI-compatible 版本（推荐） | A |
| 2 | **工具调用的数据格式** | A. 使用 OpenAI 标准的 `tool_calls` 格式（推荐，与问题 1 联动）<br>B. 使用自定义简化格式 | A |
| 3 | **MVP 是否支持流式输出（streaming）？** | A. 不支持，MVP 只支持一次性完整返回（推荐）<br>B. 支持流式，但 Agent Loop 内部等待完整响应后再处理工具调用 | A |

### 3. 需求演进与 Review 历史

**原始需求：**

- 生成最基本的 Model 以及 AgentLoop
- Model 主要处理模型层，对外暴露一个 `invoke` 方法，用于发起大模型的请求
- Agent Loop 就是一个循环，将用户的提示词组装之后，去循环调用大模型，直到模型返回的 response 里面没有工具调用

**Review 阶段提出的问题：**

1. `package.json` 能否不依赖 openai 的 sdk，直接手写 HTTP 请求
2. `tools` 是否在 `new AgentLoop` 时注入比 `run()` 传参更合适

---

## Chapter 2: 详细技术方案

### 1. 设计概述

**数据流：**

```
用户输入 → AgentLoop.run(userMessage)
              ↓
        组装消息数组 [system?, user]
              ↓
        Model.invoke(messages, toolDefinitions)
              ↓
        fetch POST → OpenAI-compatible API
              ↓
        返回 assistant 消息
              ↓
        包含 tool_calls?
           ├─ 是 → 遍历执行工具 → 结果追加为 tool 消息 → 再次 invoke
           └─ 否 → 返回 content 给调用方
```

核心逻辑：一个 `while` 循环，每次调用 LLM，检查响应中是否有 `tool_calls`。有则执行工具并将结果塞回上下文，无则退出循环返回最终文本。

### 2. 文件变更

| 文件路径 | 变更类型 | 说明 |
|---------|---------|------|
| `src/model.ts` | 新增 | Model 层，封装 `fetch` HTTP 请求 |
| `src/agent-loop.ts` | 新增 | Agent Loop，管理多轮对话与工具调用 |
| `src/index.ts` | 修改 | 导出 `Model`、`AgentLoop` 及类型 |
| `package.json` | 无需修改 | 不引入任何新依赖，使用原生 `fetch` |

### 3. 接口设计

```typescript
// src/model.ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface ModelConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export class Model {
  constructor(config: ModelConfig);
  async invoke(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatMessage>;
}

// src/agent-loop.ts
export interface Tool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

export interface AgentLoopConfig {
  model: Model;
  systemPrompt?: string;
  tools?: Tool[];
}

export class AgentLoop {
  constructor(config: AgentLoopConfig);
  async run(userMessage: string): Promise<string>;
}
```

### 4. 实现步骤

- [ ] **Step 1**: 创建 `src/model.ts`
  - 定义 `ChatMessage`、`ToolCall`、`ToolDefinition`、`ModelConfig` 类型
  - 实现 `Model` 类，`invoke()` 方法用 `fetch` 发送 POST 到 `/v1/chat/completions`
  - 请求体格式：`{ model, messages, tools }`
  - 解析响应 `choices[0].message` 并返回

- [ ] **Step 2**: 创建 `src/agent-loop.ts`
  - 定义 `Tool`、`AgentLoopConfig` 类型
  - 实现 `AgentLoop` 类，`tools` 在构造函数中注入
  - `run()` 方法逻辑：
    1. 初始化消息数组：`systemPrompt ? [system, user] : [user]`
    2. `while (true)` 调用 `model.invoke(messages, toolDefinitions)`（toolDefinitions 来自构造函数注入的 tools）
    3. 如果 `assistantMessage.tool_calls` 存在：
       - 将 `assistantMessage` 追加到消息数组
       - 遍历 `tool_calls`，找到对应工具执行，解析 `arguments` JSON
       - 将每个结果以 `{ role: 'tool', content: result, tool_call_id }` 追加到消息数组
       - `continue`
    4. 如果不存在 `tool_calls`，返回 `assistantMessage.content`

- [ ] **Step 3**: 修改 `src/index.ts`
  - 导出 `Model`、`AgentLoop` 及所有类型

- [ ] **Step 4**: 本地手动测试
  - 编写临时测试脚本验证无工具对话
  - 编写临时测试脚本验证含工具调用的多轮对话

### 5. 测试策略

MVP 阶段采用**手动测试**，不写自动化单元测试：

| 测试场景 | 输入 | 预期结果 |
|---------|------|---------|
| 无工具调用 | 普通问答（如"你好"） | AgentLoop 返回一次模型回复的纯文本 |
| 有工具调用 | 提供 `getCurrentTime` 工具，问"现在几点" | AgentLoop 循环两次：第一次模型返回 tool_calls，执行工具后第二次模型返回包含时间信息的文本 |

### 6. 风险与缓解

| 风险 | 影响 | 缓解措施（MVP） |
|------|------|----------------|
| `fetch` 请求失败（网络/API Key 错误） | 调用中断，程序抛异常 | 直接 `throw error`，不添加重试逻辑 |
| 工具参数 JSON 解析失败 | 工具执行中断 | `try-catch` 包裹 `JSON.parse`，错误信息作为 `tool` 消息返回给模型 |
| LLM 返回非预期格式 | 可能访问 undefined | MVP 阶段不防御，假设模型返回格式正确 |

---

**Chapter 1 状态：✅ 已完成**  
**Chapter 2 状态：✅ 已撰写，等待确认或直接进入实现**
