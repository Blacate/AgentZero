# AGENTS.md

You are an expert in JavaScript, Rspack, Rsbuild, Rslib, and library development. You write maintainable, performant, and accessible code.

## Commands

本项目使用 **pnpm** 作为包管理器。

- `pnpm run build` - Build the library for production
- `pnpm run dev` - Turn on watch mode, watch for changes and rebuild the library
- `pnpm run test` - Run unit tests with Rstest

## Docs

- Rslib: https://rslib.rs/llms.txt
- Rsbuild: https://rsbuild.rs/llms.txt
- Rspack: https://rspack.rs/llms.txt
- Rstest: https://rstest.rs/llms.txt

## Tools

### Biome

- Run `pnpm run lint` to lint your code
- Run `pnpm run format` to format your code

### Testing

- Use **Rstest** (`rstest`) as the unit test framework
- Use **`@rstest/adapter-rslib`** to integrate with Rslib config
- Write test files in `tests/` directory with `.test.ts` suffix
- **修改 `src/` 代码时，必须同步更新或补充对应的单元测试，确保测试通过后再提交**
- 测试用例中创建的临时目录（通常在系统 `tmp` 目录下）**不需要手动清理**，避免在测试中使用删除目录的操作

## Principles

### MVP First

实现代码时，请遵循最简原则（MVP）：

- 优先实现最小可用版本，聚焦核心逻辑
- 不需要考虑各种边界情况和异常处理
- 避免过度设计，保持代码简洁易懂
- 当前阶段以学习和验证思路为主，后续再逐步完善

### Hook 执行顺序（洋葱模型）

AgentLoop 的 hook 遵循洋葱模型：pre 类 hook（`userPromptSubmit`、`preToolUse`）按注册顺序正序执行，post 类 hook（`postToolUse`、`postToolUseFailure`、`stop`）按注册顺序倒序执行，与对应的 pre hook 形成对称。新增 hook 时应明确其归属并遵循该约定。

## Directory Conventions

- `docs/plans/` — 用于存放相关的规划和设计文档
- 当某个模块的类型定义较多时，应将类型拆分到单独的目录中，按模块分文件保存（如 `src/hooks/`）
