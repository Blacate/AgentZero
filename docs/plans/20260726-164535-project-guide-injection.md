# Project Guide（AGENTS.md 注入）设计

## Chapter 1: Core Changes & Clarification

### 1. Core Changes Review

| 变更 | 文件/模块 | 说明 | Review |
| --- | --- | --- | --- |
| 新增 | `src/project-guide.ts` | `buildProjectGuidePrompt(path: string): string`：读取指定路径文件，包裹 `<project_guide>` XML 标签返回；文件不存在或为空返回 `''` | - |
| 修改 | `src/agent-loop.ts` | `AgentLoopConfig` 加 `projectGuide` 字段；构造时读取 `cwd/AGENTS.md` 并将 `<project_guide>` 段拼入 system prompt（位于 `config.systemPrompt` 与 skill prompt 之间） | - |
| 修改 | `src/index.ts` | 导出 `buildProjectGuidePrompt` | - |
| 新增 | `tests/project-guide.test.ts` | `buildProjectGuidePrompt` 单测 | - |
| 新增 | `tests/agent-loop/agent-loop-project-guide.test.ts` | AgentLoop 集成 project-guide 的测试 | - |

**预期行为变化**：默认情况下，`AgentLoop` 构造时自动读取 `<cwd>/AGENTS.md`，将其内容包裹在 `<project_guide>` XML 标签中注入 system prompt，位于用户 `systemPrompt` 与 skill prompt 之间。`projectGuide: false` 可关闭；`projectGuide: { path: '...' }` 可自定义文件路径（相对路径基于 `process.cwd()` resolve）。文件不存在或为空时静默跳过，行为与现状一致。

### 2. Clarification Questions

| # | 问题 | 选项 | 结论 | Review Status |
| --- | --- | --- | --- | --- |
| 1 | 配置 API 设计 | A. 独立选项 `projectGuide?: boolean \| { path?: string }` / B. 折叠进 `skills` 选项 / C. 始终开启无配置 | **A**：独立选项，默认 `true`，镜像 `skills` 选项模式，保持关注点分离 | ✅ |
| 2 | 默认文件路径与文件名 | A. 仅 `AGENTS.md`，相对 `process.cwd()` resolve / B. 多文件名回退 / C. 可配置 base dir | **A**：仅 `AGENTS.md`，MVP 最简；`{ path }` 配置已提供逃生门 | ✅ |
| 3 | `<project_guide>` 在 system prompt 中的位置 | A. `systemPrompt` -> `<project_guide>` -> skill prompt / B. `<project_guide>` 在最前 / C. `<project_guide>` 在最后 | **A**：项目指南紧邻基础身份，skills 在最后 | ✅ |
| 4 | 模块结构 | A. 单文件 `src/project-guide.ts` / B. 目录 `src/project-guide/` / C. 内联 `agent-loop.ts` | **A**：单个函数一个文件，MVP 粒度合适 | ✅ |
| 5 | `<project_guide>` 内容格式 | A. 仅包裹原始内容 / B. 添加指令性前导文本 | **A**：AGENTS.md 本身就是指令，无需 meta 指令 | ✅ |
| 6 | 最终确认 | 上述 5 项决策是否准确 | 确认无误，可进入 Chapter 2 | ✅ |

### 3. 需求演进与 Review 历史

**原始需求**（用户描述，概括保持原意）：

将项目根目录的 `agents.md` 加入 system prompt 中，用 XML 标签包裹：

```
<project_guide>
  <!-- Agents.md 的内容 -->
</project_guide>
```

**Review 阶段提出的技术问题**（只记录问题）：

1. AGENTS.md 加载功能的配置 API 如何设计？独立选项、折叠进现有 skills 选项、还是始终开启？
2. 默认从哪里读取文件？文件名是否需要多文件名回退？
3. `<project_guide>` 块在拼接后的 system prompt 中应处于什么位置（相对于 `config.systemPrompt` 和 skill prompt）？
4. 代码的模块结构如何组织？单文件、目录结构还是内联？
5. `<project_guide>` 标签内是否需要添加指令性前导文本？

---

## Chapter 2: Detailed Technical Plan

### 1. Design Overview

```
AgentLoop 构造
  ├─ resolveProjectGuide(config.projectGuide)      // false -> 关闭；undefined/true -> 默认 'AGENTS.md'；{ path } -> 自定义
  ├─ buildProjectGuidePrompt(absPath)               // 读文件 -> 包裹 <project_guide> -> 返回字符串（不存在/空 -> ''）
  └─ system message 内容 = [config.systemPrompt, projectGuidePrompt, skillPrompt]
       .filter(Boolean).join('\n\n')
```

注入只发生在构造时一次，与 skill prompt 注入逻辑一致。`syncSystemPrompt` 保持现有整体替换语义不变：hook 在 `userPromptSubmit` 中改写 `ctx.systemPrompt` 时，整条 system message（含 `<project_guide>` 段）被替换，属可接受的边界行为。

核心数据流：构造时 `readFileSync(cwd/AGENTS.md, 'utf-8')` -> 内容非空则包裹为 `<project_guide>\n{content}\n</project_guide>` -> 作为中间段拼入 system message。

关键测试 case：

- **正常流转**：`cwd` 下存在 `AGENTS.md` -> system message 含 `<project_guide>` 段，位于 `config.systemPrompt` 之后、skill prompt 之前
- **异常分支**：`AGENTS.md` 不存在 -> system message 不含 `<project_guide>` 段，其余部分不受影响
- **边界条件**：`AGENTS.md` 存在但内容为空 -> 同"不存在"处理；`projectGuide: false` -> 完全不读取

### 2. File Changes

| 文件 | 变更 | 对应单测 |
| --- | --- | --- |
| `src/project-guide.ts` | 新增 `buildProjectGuidePrompt(path: string): string` | `tests/project-guide.test.ts`：case PG1–PG5 |
| `src/agent-loop.ts` | config 加 `projectGuide` 字段；构造时读取并注入 | `tests/agent-loop/agent-loop-project-guide.test.ts`：case L1–L6 |
| `src/index.ts` | 导出 `buildProjectGuidePrompt` | 通过集成测试间接覆盖 |

### 3. Interface / API Design

**`src/project-guide.ts`**

```ts
/**
 * 读取项目指南文件并包裹为 <project_guide> XML 标签。
 * @param path 文件路径（建议已 resolve 为绝对路径）
 * @returns 包裹后的提示词字符串；文件不存在或为空时返回 ''
 */
export function buildProjectGuidePrompt(path: string): string;
```

实现逻辑：
1. `readFileSync(path, 'utf-8')` 读取文件，catch 异常返回 `''`
2. 内容 `trim()` 后为空 -> 返回 `''`
3. 否则返回 `<project_guide>\n${content.trim()}\n</project_guide>`

测试 case：

- PG1（正常）：文件存在且有内容 -> 返回 `<project_guide>\n{content}\n</project_guide>`
- PG2（边界）：文件不存在 -> 返回 `''`，不抛错
- PG3（边界）：文件内容仅空白 -> `trim()` 后为空 -> 返回 `''`
- PG4（正常）：内容含多行 -> 原样保留在标签内，仅首尾 trim
- PG5（契约）：返回值始终以 `<project_guide>` 开头或为空字符串

**`src/agent-loop.ts`** - config 扩展

```ts
export interface AgentLoopConfig {
  model: Model;
  systemPrompt?: string;
  tools?: Tool<z.ZodSchema>[];
  hooks?: AgentLoopHooks[];
  /** 默认 true：读取 <cwd>/AGENTS.md；false 关闭；{ path } 自定义路径（相对路径基于 cwd resolve） */
  projectGuide?: boolean | { path?: string };
  /** 默认 true：扫描 <cwd>/.agents/skills；false 关闭；{ dir } 自定义目录（相对路径基于 cwd resolve） */
  skills?: boolean | { dir?: string };
}
```

构造时注入逻辑（伪代码）：

```ts
// 1. 读取 project guide
let projectGuidePrompt = '';
const projectGuideOption = config.projectGuide ?? true;
if (projectGuideOption !== false) {
  const guidePath =
    typeof projectGuideOption === 'object' && projectGuideOption.path
      ? projectGuideOption.path
      : 'AGENTS.md';
  projectGuidePrompt = buildProjectGuidePrompt(resolve(guidePath));
}

// 2. 读取 skills（现有逻辑不变）
// ...

// 3. 拼接 system prompt
this.systemPrompt = [
  config.systemPrompt,
  projectGuidePrompt,
  skillPrompt,  // 已有逻辑产出
]
  .filter(Boolean)
  .join('\n\n');
```

集成测试 case（`tests/agent-loop/agent-loop-project-guide.test.ts`，用 `createMockModel` + 临时目录，通过 `projectGuide: { path }` 注入绝对路径避免依赖 cwd）：

- L1（默认开启+有 AGENTS.md）：system message 同时含用户段与 `<project_guide>` 段；`<project_guide>` 位于用户段之后
- L2（`projectGuide: false`）：system message 仅用户段，不含 `<project_guide>`
- L3（文件不存在）：system message 仅用户段（静默跳过，行为与 `projectGuide: false` 一致）
- L4（与 skills 共存）：system message 三段拼接：用户段 -> `<project_guide>` -> `<skill-system>`，顺序正确
- L5（边界）：无 `systemPrompt` 但有 AGENTS.md -> system message 存在且含 `<project_guide>` 段
- L6（hook 整体替换）：`userPromptSubmit` hook 改写 `ctx.systemPrompt` -> system message 被整体替换（`<project_guide>` 段随之移除，`syncSystemPrompt` 语义不变）

### 4. Implementation Steps

1. 实现 `src/project-guide.ts` -> 测试 case PG1–PG5
2. 修改 `src/agent-loop.ts`：config 扩展 `projectGuide` 字段、构造时读取注入 -> 测试 case L1–L6，并确认既有 `agent-loop.test.ts` / `agent-loop-skills.test.ts` / hooks 测试不回归
3. 修改 `src/index.ts`：导出 `buildProjectGuidePrompt`
4. 全量验证：`pnpm run test`、`pnpm run lint`、`pnpm run build`

### 5. Testing Strategy

| 模块 | case | 类型 | mock 策略 |
| --- | --- | --- | --- |
| project-guide | PG1–PG5 | 单元 | 真实临时目录（`fs.mkdtemp`）写 fixture 文件；临时目录不手动清理 |
| agent-loop 集成 | L1–L6 | 集成 | `createMockModel`（既有工厂）；project-guide 文件用临时目录 + `projectGuide: { path }` 显式传入绝对路径，避免依赖 `process.cwd()` |

### 6. Risks & Mitigations

- **cwd 语义**：默认路径基于 `process.cwd()`，库被嵌入其他进程时 cwd 可能非用户预期 -> 已通过 `{ path }` 配置提供逃生门；集成测试一律显式传 `path`，避免测试受 cwd 影响。
- **hook 改写 `systemPrompt` 会移除 `<project_guide>` 段**：使用者若在 `userPromptSubmit` hook 中替换 systemPrompt，`<project_guide>` 段随之丢失。MVP 接受该行为（与 skill prompt 段一致），有此需求的使用者可在 hook 中自行拼接。回归测试：L6。
- **与 host 应用重复注入**：若 host 应用已将 AGENTS.md 内容拼入 `config.systemPrompt`，启用此功能会导致内容重复。使用者应选择其一：由 host 注入（`projectGuide: false`）或由库注入（host 不再拼入）。
