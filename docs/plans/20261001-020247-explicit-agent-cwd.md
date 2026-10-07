# AgentLoop 显式工作目录支持

## Chapter 1: Core Changes & Clarification

### 1. Core Changes Review

| 变更 | 文件或模块 | 最终行为 | Review |
| --- | --- | --- | --- |
| 修改 | `src/agent-loop.ts` | 增加可选 `AgentLoopConfig.cwd`；构造时解析并保存绝对路径，未配置时捕获当时的 `process.cwd()`；提示词、工具执行和 MCP 启动统一使用实例目录 | - |
| 修改 | `src/workspace.ts`、AgentLoop 指南与 skills 加载 | workspace 提示词包含实例 cwd；默认 `AGENTS.md`、`.agents/skills` 和自定义相对路径均以实例 cwd 解析；绝对路径保持自身含义；`workspace: false` 只关闭 workspace 提示词注入 | - |
| 修改 | `src/tools/tool.ts`、`src/tools/index.ts`、`src/index.ts` | 为工具增加包含 cwd 的执行上下文并导出对应类型；保留单参数 `execute(args)` 和单参数 `run(args)` 的使用方式，自定义工具可读取执行上下文 | - |
| 修改 | `src/tools/read.ts`、`write.ts`、`grep.ts`、`glob.ts` | Read、Write、Grep 的相对路径以实例 cwd 为基准；Glob 默认使用实例 cwd，显式相对 cwd 也以实例 cwd 解析；绝对路径不重新定位 | - |
| 修改 | `src/mcp/client.ts`、AgentLoop MCP 初始化 | MCP 子进程使用所属 AgentLoop 的 cwd 启动；独立使用 McpClient 且未指定目录时，保留启动时继承进程 cwd 的行为 | - |
| 补充 | `tests/agent-loop/`、`tests/tools/`、`tests/mcp/`、`tests/workspace.test.ts`、MCP fixture | 验证默认兼容、显式目录、构造后目录稳定、绝对路径、自定义工具兼容、双实例隔离、MCP 实际启动目录和既有 hook 洋葱顺序；测试临时目录不主动删除 | - |
| 补充 | `README.md` | 提供 cwd 配置和自定义工具读取 cwd 的最小示例，说明相对路径、默认行为与 workspace 开关的语义 | - |

每个 AgentLoop 以构造时确定的绝对目录作为稳定的工作目录。目录信息通过实例状态和执行上下文传递；库不调用 `process.chdir()`，同一进程中的多个实例可以共享工具对象并分别操作各自目录。

### 2. Clarification Questions

| # | 问题或取舍 | 选项 | 明确结论 | Review Status |
| --- | --- | --- | --- | --- |
| 1 | 未配置 cwd 或配置相对 cwd 时，何时确定目录？ | A. 构造时 / B. 初始化或每次运行时 | A：构造时相对进程 cwd 解析为绝对路径；后续全局 cwd 变化不影响实例 | ✅ |
| 2 | `workspace: false` 是否禁用工作目录语义？ | A. 仅关闭提示词 / B. 同时禁用路径解析 | A：指南、skills、文件工具和 MCP 仍使用实例 cwd | ✅ |
| 3 | 自定义绝对路径是否限制在实例目录内？ | A. 保留绝对路径含义 / B. 重新定位到实例目录 | A：保留绝对路径；cwd 是相对路径基准，不作为路径访问边界 | ✅ |
| 4 | 如何使自定义工具获取 cwd 并保持兼容？ | A. 扩展工具执行上下文 / B. 修改全局 cwd | A：增加执行上下文，兼容已有 Tool/ToolLike 的单参数实现；不使用 `process.chdir()` | ✅ |
| 5 | 是否改变独立使用 McpClient 的默认行为？ | A. 保持 / B. 构造时固定目录 | A：仅 AgentLoop 显式传入实例 cwd；独立客户端默认继承启动时的进程 cwd | ✅ |
| 6 | 实现及验证范围是否扩展？ | A. 限定为 cwd 支持 / B. 扩展其他 Agent 能力 | A：不扩展 session、resume、LLM 日志、ACP、图片、工具并行或 Edit，不修复最终 assistant 回答未存入历史的问题；不提交或推送 | ✅ |

需求已覆盖上述取舍，无待补充的业务问题。核心变更表中 `-` 表示未发现待解决问题；Chapter 1 等待用户明确确认完成后，才能撰写 Chapter 2 和开始源码实现。

### 3. 需求演进与 Review 历史

**原始需求**：为 AgentLoop 增加显式 cwd，使每个实例拥有独立且稳定的绝对工作目录；项目提示词、指南、skills、内置文件工具和 MCP 子进程统一使用该目录。保持默认行为、绝对路径和自定义工具兼容，验证从目录 A 启动而配置目录 B 的行为，以及两个实例在同一进程中的隔离。

**技术 Review 问题**：无新增问题。
