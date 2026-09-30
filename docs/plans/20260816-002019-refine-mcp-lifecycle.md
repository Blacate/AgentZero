# MCP 生命周期实现优化

## Chapter 1: Core Changes & Clarification

### 1. Core Changes Review

| 变更 | 文件/模块 | 说明 | Review |
| --- | --- | --- | --- |
| 修改 | `src/agent-loop.ts` | 用单一初始化 Promise 表达 lazy init 状态，避免并发调用越过未完成的初始化；复制外部传入的 tools 数组，避免初始化过程修改调用方数据；失败 server 及时关闭 client | - |
| 修改 | `src/mcp/client.ts` | 收敛进程退出、启动失败和主动关闭的清理逻辑；确保退出后拒绝新请求并释放 pending 请求；消费 stderr，避免子进程因管道写满阻塞 | - |
| 修改 | `tests/agent-loop/agent-loop-mcp.test.ts` | 增加并发初始化只注册一次、失败 server 不泄漏资源、调用方 tools 数组不被修改的回归测试 | - |
| 修改 | `tests/mcp/client.test.ts` | 增加子进程退出后请求立即失败、初始化失败后可安全关闭的回归测试 | - |

**预期行为变化**：保留已确认的“裸写 JSON-RPC、stdio-only、lazy init、单 server 失败时跳过”方案和现有公开 API，只修正初始化竞态、资源泄漏及外部数组被意外修改的问题，并简化生命周期状态表达。

### 2. Clarification Questions

| # | 问题 | 选项 | 结论 | Review Status |
| --- | --- | --- | --- | --- |
| 1 | 是否推翻原方案并引入官方 MCP SDK | A. 保持裸写 JSON-RPC / B. 改用 SDK | **A**：原计划已明确选择裸写，本轮只做最小重构 | ✅ |
| 2 | `close()` 后是否支持重新 `run()` | A. 保持当前一次性生命周期 / B. 自动重连 | **A**：MVP 不新增重连语义；本轮仅保证关闭后不会留下可挂起的请求 | ✅ |
| 3 | 是否扩展到分页、超时、非文本 content 等新能力 | A. 不扩展 / B. 一并增加 | **A**：这些属于功能扩展，不混入本次优雅性重构 | ✅ |

### 3. 需求演进与 Review 历史

**原始需求**（用户描述，概括保持原意）：

Review 当前分支相对 main 的改动，先给出 review 建议，再优化不够优雅的实现。

**Review 阶段提出的技术问题**：

1. `AgentLoop.init()` 在异步工作完成前设置布尔状态，并发 `run()` 是否会提前进入模型调用？
2. MCP server 在握手或 `tools/list` 阶段失败时，已 spawn 的子进程由谁关闭？
3. 子进程退出后 `stdin` 仍被保留，新请求是否可能写入失效 stream 并永久 pending？
4. `config.tools` 被直接保存后再 push skill/MCP tool，是否应修改调用方持有的数组？
5. MCP stderr 使用 pipe 却无人消费，长时间运行时是否可能因背压阻塞子进程？
6. 本轮优化是否应改变已在原设计中确认的 SDK、协议范围和错误处理决策？

用户已确认 Chapter 1，可进入实现。

## Chapter 2: Detailed Technical Plan

### 1. Design Overview

`AgentLoop` 使用缓存的 `Promise<void>` 作为唯一初始化状态：首次 `init()` 创建初始化任务，后续调用返回同一个 Promise，因此所有调用方都会等待 MCP 工具注册完成。MCP client 的断开状态统一收敛到一个清理路径，进程 error/exit、stdin error 和主动 `close()` 都会清空 stream 引用并拒绝 pending 请求。

关键测试 case：

- A7：两个重叠的 `init()` 调用都等待同一次延迟的 `tools/list` 完成。
- A8：传入空 tools 数组，初始化后原数组仍为空，模型仍能看到 MCP 工具。
- A9：`tools/list` 失败时关闭已启动的 client，子进程退出。
- C7：server 退出后再次请求立即 reject，不留下 pending 请求。

### 2. File Changes

| 文件 | 变更 | 对应测试 |
| --- | --- | --- |
| `src/agent-loop.ts` | 复制 tools/hooks；配置选项收敛为对象；布尔初始化状态改为共享 Promise；失败 client 立即关闭 | A1–A9，既有 AgentLoop 回归测试 |
| `src/mcp/client.ts` | 统一 disconnect/pending 清理；监听 stdin error；消费 stderr；写入失败时移除 pending | C1–C7 |
| `tests/fixtures/mock-mcp-server.mjs` | 增加受环境变量控制的延迟、失败 `tools/list` 和初始化后退出行为 | A7、A9、C7 |
| `tests/agent-loop/agent-loop-mcp.test.ts` | 增加重叠初始化、tools 数组隔离与失败连接清理测试 | A7–A9 |
| `tests/mcp/client.test.ts` | 增加进程退出后的请求测试 | C7 |

### 3. Interface / API Design

公开接口保持不变：`AgentLoop.init(): Promise<void>`、`AgentLoop.close(): void`、`McpClient.initialize/toolsList/toolsCall/close` 的签名均不调整。

内部状态改为：

```ts
private initialization?: Promise<void>;

init(): Promise<void> {
  this.initialization ??= this.initialize();
  return this.initialization;
}
```

测试覆盖：正常首次初始化、重叠初始化共享完成时机、顺序多次调用不重复注册；子进程正常运行、异常退出、主动关闭后请求失败。

### 4. Implementation Steps

1. 扩展 mock server 的可控延迟/退出能力 → A7、C7。
2. 先新增 AgentLoop 生命周期回归测试 → A7、A8。
3. 重构 AgentLoop 初始化状态、配置存储和失败清理 → A1–A9。
4. 新增 McpClient 退出回归测试并统一断开清理 → C1–C7。
5. 运行 MCP 定向测试、全量测试、lint 和 build。

### 5. Testing Strategy

| 模块 | case | 类型 | 策略 |
| --- | --- | --- | --- |
| AgentLoop | A1–A9 | 集成测试 | 真实 mock stdio 子进程；通过 sentinel 文件验证延迟初始化与失败清理已完成，不依赖固定 sleep |
| McpClient | C1–C7 | 集成测试 | 真实 mock stdio 子进程；由环境变量触发 server 退出 |
| McpTool | M1–M4 | 单元测试 | 保持现有 mock client 测试 |
| 全库 | 既有测试 | 回归测试 | `pnpm run test`；依赖缺失时先恢复 workspace 依赖 |

### 6. Risks & Mitigations

- AgentLoop 本身的消息历史仍不支持并发 `run()`；本轮只保证并发触发初始化时不会提前越过初始化边界，不扩大为并发会话重构。
- stderr 本轮选择 drain 后丢弃，避免背压；日志转发策略属于新 API，暂不引入。
- 不增加请求 timeout、分页和自动重连，避免偏离本次最小重构范围。
