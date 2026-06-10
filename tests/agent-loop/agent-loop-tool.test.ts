import { describe, expect, it } from '@rstest/core';
import { z } from 'zod';
import { AgentLoop } from '../../src/agent-loop.js';
import { Model } from '../../src/model.js';
import { Tool } from '../../src/tools/tool.js';

describe('AgentLoop with real model and tool', () => {
  it('should invoke tool through real model call', async () => {
    const baseURL = process.env.API_BASE_URL;
    const apiKey = process.env.API_KEY;
    const modelName = process.env.MODEL;

    if (!baseURL || !apiKey || !modelName) {
      throw new Error('Skip: API_BASE_URL, API_KEY, or MODEL not set in .env');
    }

    const addTool = new Tool({
      name: 'add',
      description: 'Add two numbers and return the sum',
      schema: z.object({
        a: z.number().describe('First number'),
        b: z.number().describe('Second number'),
      }),
      run: ({ a, b }) => String(a + b),
    });

    const model = new Model({
      apiKey,
      baseURL,
      model: modelName,
    });

    const agent = new AgentLoop({
      model,
      tools: [addTool],
      systemPrompt:
        'You have access to tools. When asked a math question, you MUST use the add tool to calculate the answer. After receiving the tool result, respond with a single sentence containing the final number.',
    });

    const result = await agent.run('What is 11 plus 22?');

    expect(result).toBeTruthy();
    expect(result).toContain('33');
  });
});
