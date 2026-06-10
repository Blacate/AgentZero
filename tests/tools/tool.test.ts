import { describe, expect, it } from '@rstest/core';
import { z } from 'zod';
import { Tool } from '../../src/tools/tool.js';

describe('Tool', () => {
  it('should generate definition from zod schema', () => {
    const tool = new Tool({
      name: 'echo',
      description: 'Echo back the input',
      schema: z.object({
        message: z.string().describe('Message to echo'),
      }),
      run: ({ message }) => message,
    });

    const def = tool.definition;
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('echo');
    expect(def.function.description).toBe('Echo back the input');
    expect(def.function.parameters).toHaveProperty('type');
  });

  it('should execute run function with parsed args', async () => {
    const tool = new Tool({
      name: 'double',
      description: 'Double a number',
      schema: z.object({ n: z.number() }),
      run: ({ n }) => String(n * 2),
    });

    const result = await tool.execute({ n: 5 });
    expect(result).toBe('10');
  });

  it('should return error message on invalid args', async () => {
    const tool = new Tool({
      name: 'double',
      description: 'Double a number',
      schema: z.object({ n: z.number() }),
      run: ({ n }) => String(n * 2),
    });

    const result = await tool.execute({ n: 'five' });
    expect(result).toContain('Invalid input');
  });

  it('should catch run function errors', async () => {
    const tool = new Tool({
      name: 'fail',
      description: 'Always fails',
      schema: z.object({}),
      run: () => {
        throw new Error('Intentional failure');
      },
    });

    const result = await tool.execute({});
    expect(result).toBe('Intentional failure');
  });
});
