import type { z } from 'zod';
import type { ToolDefinition } from '../model.js';

export class Tool<T extends z.ZodSchema> {
  readonly name: string;
  readonly description: string;
  readonly schema: T;
  private readonly runFn: (args: z.infer<T>) => Promise<string> | string;

  constructor(config: {
    name: string;
    description: string;
    schema: T;
    run: (args: z.infer<T>) => Promise<string> | string;
  }) {
    this.name = config.name;
    this.description = config.description;
    this.schema = config.schema;
    this.runFn = config.run;
  }

  get definition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.schema.toJSONSchema() as Record<string, unknown>,
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = this.schema.parse(args);
    const result = await this.runFn(parsed);
    return result;
  }
}
