import { resolve } from 'node:path';
import type {
  AgentLoopHooks,
  PostToolUseContext,
  PostToolUseFailureContext,
  PreToolUseContext,
  StopContext,
  UserPromptSubmitContext,
} from './hooks/index.js';
import { McpClient } from './mcp/client.js';
import { McpTool } from './mcp/mcp-tool.js';
import type { McpServerConfig } from './mcp/types.js';
import type { ChatMessage, Model } from './model.js';
import { buildProjectGuidePrompt } from './project-guide.js';
import { buildSkillPrompt } from './skills/prompt.js';
import { scanSkills } from './skills/scan.js';
import { createSkillTool } from './skills/skill-tool.js';
import type { ToolLike } from './tools/tool.js';
import { buildWorkspacePrompt } from './workspace.js';

export interface AgentLoopConfig {
  model: Model;
  systemPrompt?: string;
  tools?: ToolLike[];
  hooks?: AgentLoopHooks[];
  /** 默认 true：读取 <cwd>/AGENTS.md；false 关闭；{ path } 自定义路径（相对路径基于 cwd resolve） */
  projectGuide?: boolean | { path?: string };
  /** 默认 true：扫描 <cwd>/.agents/skills；false 关闭；{ dir } 自定义目录（相对路径基于 cwd resolve） */
  skills?: boolean | { dir?: string };
  /** 默认 true：在 system prompt 中注入当前 cwd 信息 */
  workspace?: boolean;
  /** stdio MCP server 配置，key 为 server 名称 */
  mcpServers?: Record<string, McpServerConfig>;
}

type AgentLoopOptions = Omit<AgentLoopConfig, 'model' | 'tools' | 'hooks'>;

async function executeHooks<TContext>(
  hooks: AgentLoopHooks[],
  method: keyof AgentLoopHooks,
  context: TContext,
  reverse = false,
): Promise<{ context: TContext; result?: string }> {
  let result: string | undefined;

  const ordered = reverse ? [...hooks].reverse() : hooks;
  for (const hook of ordered) {
    const hookFn = hook[method];
    if (hookFn) {
      const hookResult = await (
        hookFn as (
          ctx: TContext,
        ) => Promise<{ context: TContext; result?: string }>
      )(context);
      context = hookResult.context;
      if (hookResult.result !== undefined) {
        result = hookResult.result;
      }
    }
  }

  return { context, result };
}

export class AgentLoop {
  private readonly model: Model;
  private readonly options: AgentLoopOptions;
  private readonly tools: ToolLike[];
  private readonly hooks: AgentLoopHooks[];
  private readonly messages: ChatMessage[] = [];
  private readonly mcpClients: McpClient[] = [];
  private systemPrompt?: string;
  private initialization?: Promise<void>;

  constructor(config: AgentLoopConfig) {
    const { model, tools = [], hooks = [], ...options } = config;
    this.model = model;
    this.options = options;
    this.tools = [...tools];
    this.hooks = [...hooks];
  }

  /** 初始化：构建 system prompt + 连接 MCP server。幂等。 */
  init(): Promise<void> {
    this.initialization ??= this.initialize();
    return this.initialization;
  }

  private async initialize(): Promise<void> {
    const workspacePrompt = this.resolveWorkspace(this.options.workspace);
    const projectGuidePrompt = this.resolveProjectGuide(
      this.options.projectGuide,
    );
    const skillPrompt = this.resolveSkills(this.options.skills);
    await this.initMcpServers();

    this.systemPrompt = [
      this.options.systemPrompt,
      workspacePrompt,
      projectGuidePrompt,
      skillPrompt,
    ]
      .filter(Boolean)
      .join('\n\n');

    if (this.systemPrompt) {
      this.messages.push({ role: 'system', content: this.systemPrompt });
    }
  }

  /** 连接所有 MCP server，注册工具 */
  private async initMcpServers(): Promise<void> {
    if (!this.options.mcpServers) return;
    for (const [name, config] of Object.entries(this.options.mcpServers)) {
      let client: McpClient | undefined;
      try {
        client = new McpClient(config);
        await client.initialize();
        const tools = await client.toolsList();
        this.mcpClients.push(client);
        for (const tool of tools) {
          this.tools.push(
            new McpTool({
              serverName: name,
              toolName: tool.name,
              description: tool.description ?? '',
              inputSchema: tool.inputSchema ?? {},
              client,
            }),
          );
        }
      } catch (e) {
        client?.close();
        console.warn(
          `[agent-zero] MCP server "${name}" failed to start: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  /** 清理 MCP 子进程 */
  close(): void {
    for (const client of this.mcpClients.splice(0)) {
      client.close();
    }
  }

  private resolveWorkspace(option: boolean | undefined): string {
    const opt = option ?? true;
    if (opt === false) return '';
    return buildWorkspacePrompt();
  }

  private resolveProjectGuide(
    option: boolean | { path?: string } | undefined,
  ): string {
    const opt = option ?? true;
    if (opt === false) return '';
    const guidePath =
      typeof opt === 'object' && opt.path ? opt.path : 'AGENTS.md';
    return buildProjectGuidePrompt(resolve(guidePath));
  }

  private resolveSkills(
    option: boolean | { dir?: string } | undefined,
  ): string {
    const opt = option ?? true;
    if (opt === false) return '';
    const dir = typeof opt === 'object' && opt.dir ? opt.dir : '.agents/skills';
    const skills = scanSkills(dir);
    if (skills.length === 0) return '';
    this.tools.push(createSkillTool(skills));
    return buildSkillPrompt(skills);
  }

  private syncSystemPrompt(systemPrompt?: string): void {
    const index = this.messages.findIndex((m) => m.role === 'system');
    if (systemPrompt) {
      if (index >= 0) {
        this.messages[index] = { role: 'system', content: systemPrompt };
      } else {
        this.messages.unshift({ role: 'system', content: systemPrompt });
      }
    } else if (index >= 0) {
      this.messages.splice(index, 1);
    }
    this.systemPrompt = systemPrompt;
  }

  async run(userMessage: string): Promise<string> {
    await this.init();

    // UserPromptSubmit hook
    if (this.hooks.length > 0) {
      const { context: ctx, result } = await executeHooks(
        this.hooks,
        'userPromptSubmit',
        {
          userMessage,
          systemPrompt: this.systemPrompt,
          messages: this.messages,
        } as UserPromptSubmitContext,
      );

      if (result !== undefined) {
        return result;
      }

      userMessage = ctx.userMessage;

      if (ctx.systemPrompt !== this.systemPrompt) {
        this.syncSystemPrompt(ctx.systemPrompt);
      }
    }

    const messages = this.messages;
    messages.push({ role: 'user', content: userMessage });

    const toolDefinitions = this.tools.map((t) => t.definition);

    while (true) {
      const assistantMessage = await this.model.invoke(
        messages,
        toolDefinitions.length > 0 ? toolDefinitions : undefined,
      );

      if (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
      ) {
        messages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const tool = this.tools.find(
            (t) => t.definition.function.name === toolCall.function.name,
          );

          let result: string;

          if (!tool) {
            result = `Tool "${toolCall.function.name}" not found`;
          } else {
            const args = JSON.parse(toolCall.function.arguments) as Record<
              string,
              unknown
            >;

            // PreToolUse hook
            let hookResult: string | undefined;
            if (this.hooks.length > 0) {
              const { result: preResult } = await executeHooks(
                this.hooks,
                'preToolUse',
                {
                  userMessage,
                  toolName: toolCall.function.name,
                  args,
                  toolCallId: toolCall.id,
                  messages,
                } as PreToolUseContext,
              );
              hookResult = preResult;
            }

            if (hookResult !== undefined) {
              result = hookResult;
            } else {
              try {
                result = await tool.execute(args);

                // PostToolUse hook
                if (this.hooks.length > 0) {
                  await executeHooks(
                    this.hooks,
                    'postToolUse',
                    {
                      userMessage,
                      toolName: toolCall.function.name,
                      args,
                      result,
                      toolCallId: toolCall.id,
                      messages,
                    } as PostToolUseContext,
                    true,
                  );
                }
              } catch (error) {
                // PostToolUseFailure hook
                let failureResult: string | undefined;
                if (this.hooks.length > 0) {
                  const { result: failureHookResult } = await executeHooks(
                    this.hooks,
                    'postToolUseFailure',
                    {
                      userMessage,
                      toolName: toolCall.function.name,
                      args,
                      error:
                        error instanceof Error
                          ? error
                          : new Error(String(error)),
                      toolCallId: toolCall.id,
                      messages,
                    } as PostToolUseFailureContext,
                    true,
                  );
                  failureResult = failureHookResult;
                }

                if (failureResult !== undefined) {
                  result = failureResult;
                } else {
                  result =
                    error instanceof Error ? error.message : String(error);
                }
              }
            }
          }

          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });
        }

        continue;
      }

      // Stop hook
      let finalResult = assistantMessage.content ?? '';
      if (this.hooks.length > 0) {
        const { result: stopResult } = await executeHooks(
          this.hooks,
          'stop',
          {
            userMessage,
            result: finalResult,
            messages,
          } as StopContext,
          true,
        );
        if (stopResult !== undefined) {
          finalResult = stopResult;
        }
      }

      return finalResult;
    }
  }
}
