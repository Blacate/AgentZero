import { describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';
import { AgentLoop } from '../../src/agent-loop.js';
import type { ChatMessage, Model, ToolDefinition } from '../../src/model.js';
import { Tool } from '../../src/tools/tool.js';

function createMockModel(
  responses: ChatMessage[],
): Model & { invoke: typeof rs.fn } {
  let index = 0;
  const invoke = rs.fn(
    async (_messages: ChatMessage[], _tools?: ToolDefinition[]) => {
      const res = responses[index];
      index += 1;
      return res;
    },
  );

  return {
    invoke,
  } as unknown as Model & { invoke: typeof rs.fn };
}

describe('AgentLoop', () => {
  it('should return assistant response without tools', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Hello!' }]);

    const agent = new AgentLoop({ model });
    const result = await agent.run('Hi');

    expect(result).toBe('Hello!');
    expect(model.invoke).toHaveBeenCalledTimes(1);
  });

  it('should prepend system prompt when provided', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: false,
    });

    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('should execute tool and continue loop', async () => {
    const toolExecute = rs.fn(async () => 'Sunny');

    const tool = new Tool({
      name: 'getWeather',
      description: 'Get weather',
      schema: z.object({ city: z.string() }),
      run: toolExecute,
    });

    const model = createMockModel([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'getWeather',
              arguments: JSON.stringify({ city: 'Beijing' }),
            },
          },
        ],
      },
      { role: 'assistant', content: 'It is Sunny in Beijing.' },
    ]);

    const agent = new AgentLoop({ model, tools: [tool] });
    const result = await agent.run('Weather in Beijing?');

    expect(result).toBe('It is Sunny in Beijing.');
    expect(model.invoke).toHaveBeenCalledTimes(2);
    expect(toolExecute).toHaveBeenCalledTimes(1);
    expect(toolExecute).toHaveBeenCalledWith({ city: 'Beijing' });
  });

  it('should handle tool not found', async () => {
    const model = createMockModel([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'missingTool',
              arguments: '{}',
            },
          },
        ],
      },
      { role: 'assistant', content: 'Sorry.' },
    ]);

    const agent = new AgentLoop({ model, tools: [] });
    const result = await agent.run('Try this');

    expect(result).toBe('Sorry.');
    const [secondMessages] = model.invoke.mock.calls[1];
    const toolMessage = secondMessages.find(
      (m: ChatMessage) => m.role === 'tool',
    );
    expect(toolMessage?.content).toBe('Tool "missingTool" not found');
  });

  it('should handle tool execution error', async () => {
    const tool = new Tool({
      name: 'badTool',
      description: 'Bad tool',
      schema: z.object({}),
      run: () => {
        throw new Error('Oops');
      },
    });

    const model = createMockModel([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'badTool',
              arguments: '{}',
            },
          },
        ],
      },
      { role: 'assistant', content: 'Failed.' },
    ]);

    const agent = new AgentLoop({ model, tools: [tool] });
    const result = await agent.run('Run bad tool');

    expect(result).toBe('Failed.');
    const [secondMessages] = model.invoke.mock.calls[1];
    const toolMessage = secondMessages.find(
      (m: ChatMessage) => m.role === 'tool',
    );
    expect(toolMessage?.content).toBe('Oops');
  });

  it('should pass tool definitions to model', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Done' }]);

    const tool = new Tool({
      name: 'echo',
      description: 'Echo',
      schema: z.object({}),
      run: (args) => String(args),
    });

    const agent = new AgentLoop({ model, tools: [tool], skills: false });
    await agent.run('Hello');

    const [, passedTools] = model.invoke.mock.calls[0];
    expect(passedTools).toEqual([tool.definition]);
  });
});
