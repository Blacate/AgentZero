import type { z } from 'zod';
import type {
  AgentLoopHooks,
  PostToolUseContext,
  PostToolUseFailureContext,
  PreToolUseContext,
  StopContext,
  UserPromptSubmitContext,
} from './hooks/index.js';
import type { ChatMessage, Model } from './model.js';
import type { Tool } from './tools/tool.js';

export interface AgentLoopConfig {
  model: Model;
  systemPrompt?: string;
  tools?: Tool<z.ZodSchema>[];
  hooks?: AgentLoopHooks[];
}

async function executeHooks<TContext>(
  hooks: AgentLoopHooks[],
  method: keyof AgentLoopHooks,
  context: TContext,
): Promise<{ context: TContext; result?: string }> {
  let result: string | undefined;

  for (const hook of hooks) {
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
  private model: Model;
  private systemPrompt?: string;
  private tools: Tool<z.ZodSchema>[];
  private hooks: AgentLoopHooks[];

  constructor(config: AgentLoopConfig) {
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools ?? [];
    this.hooks = config.hooks ?? [];
  }

  async run(userMessage: string): Promise<string> {
    const messages: ChatMessage[] = [];

    // UserPromptSubmit hook
    if (this.hooks.length > 0) {
      const { context: ctx, result } = await executeHooks(
        this.hooks,
        'userPromptSubmit',
        {
          userMessage,
          systemPrompt: this.systemPrompt,
          messages,
        } as UserPromptSubmitContext,
      );

      if (result !== undefined) {
        return result;
      }

      userMessage = ctx.userMessage;

      if (ctx.systemPrompt) {
        messages.push({ role: 'system', content: ctx.systemPrompt });
      }
    } else if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }

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
                  await executeHooks(this.hooks, 'postToolUse', {
                    userMessage,
                    toolName: toolCall.function.name,
                    args,
                    result,
                    toolCallId: toolCall.id,
                    messages,
                  } as PostToolUseContext);
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
        const { result: stopResult } = await executeHooks(this.hooks, 'stop', {
          userMessage,
          result: finalResult,
          messages,
        } as StopContext);
        if (stopResult !== undefined) {
          finalResult = stopResult;
        }
      }

      return finalResult;
    }
  }
}
