import type { z } from 'zod';
import type { ChatMessage, Model } from './model.js';
import type { Tool } from './tools/tool.js';

export interface AgentLoopConfig {
  model: Model;
  systemPrompt?: string;
  tools?: Tool<z.ZodSchema>[];
}

export class AgentLoop {
  private model: Model;
  private systemPrompt?: string;
  private tools: Tool<z.ZodSchema>[];

  constructor(config: AgentLoopConfig) {
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools ?? [];
  }

  async run(userMessage: string): Promise<string> {
    const messages: ChatMessage[] = [];

    if (this.systemPrompt) {
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
            try {
              const args = JSON.parse(toolCall.function.arguments) as Record<
                string,
                unknown
              >;
              result = await tool.execute(args);
            } catch (error) {
              result = error instanceof Error ? error.message : String(error);
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

      return assistantMessage.content ?? '';
    }
  }
}
