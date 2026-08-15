import type { ToolDefinition } from '../model.js';
import type { ToolLike } from '../tools/tool.js';
import type { McpClient } from './client.js';

export class McpTool implements ToolLike {
  readonly name: string;
  private readonly toolName: string;
  private readonly descriptionValue: string;
  private readonly inputSchema: Record<string, unknown>;
  private readonly client: McpClient;

  constructor(opts: {
    serverName: string;
    toolName: string;
    description: string;
    inputSchema: Record<string, unknown>;
    client: McpClient;
  }) {
    this.name = `mcp__${opts.serverName}__${opts.toolName}`;
    this.toolName = opts.toolName;
    this.descriptionValue = opts.description;
    this.inputSchema = opts.inputSchema;
    this.client = opts.client;
  }

  get definition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.descriptionValue,
        parameters: this.inputSchema,
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const result = await this.client.toolsCall(this.toolName, args);
    const text = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    if (result.isError) {
      throw new Error(text);
    }
    return text;
  }
}
