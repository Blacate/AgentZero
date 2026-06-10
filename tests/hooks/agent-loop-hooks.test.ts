import { describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';
import {
  AgentLoop,
  type AgentLoopHooks,
  type PostToolUseContext,
  type PostToolUseFailureContext,
  type PreToolUseContext,
  type StopContext,
  type UserPromptSubmitContext,
} from '../../src/agent-loop.js';
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

describe('AgentLoop hooks', () => {
  it('UserPromptSubmit short-circuits run() when returning result', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Hello!' }]);
    const hook: AgentLoopHooks = {
      userPromptSubmit: async (ctx: UserPromptSubmitContext) => ({
        context: ctx,
        result: 'short-circuited',
      }),
    };

    const agent = new AgentLoop({ model, hooks: [hook] });
    const result = await agent.run('Hi');

    expect(result).toBe('short-circuited');
    expect(model.invoke).toHaveBeenCalledTimes(0);
  });

  it('UserPromptSubmit does not short-circuit when not returning result', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Hello!' }]);
    const hook: AgentLoopHooks = {
      userPromptSubmit: async (ctx: UserPromptSubmitContext) => ({
        context: ctx,
      }),
    };

    const agent = new AgentLoop({ model, hooks: [hook] });
    const result = await agent.run('Hi');

    expect(result).toBe('Hello!');
    expect(model.invoke).toHaveBeenCalledTimes(1);
  });

  it('PreToolUse intercepts tool execution when returning result', async () => {
    const toolExecute = rs.fn(async () => 'Original');
    const tool = new Tool({
      name: 'echo',
      description: 'Echo',
      schema: z.object({ text: z.string() }),
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
              name: 'echo',
              arguments: JSON.stringify({ text: 'hello' }),
            },
          },
        ],
      },
      { role: 'assistant', content: 'Done.' },
    ]);

    const hook: AgentLoopHooks = {
      preToolUse: async (ctx: PreToolUseContext) => ({
        context: ctx,
        result: 'intercepted',
      }),
    };

    const agent = new AgentLoop({ model, tools: [tool], hooks: [hook] });
    const result = await agent.run('Test');

    expect(result).toBe('Done.');
    expect(toolExecute).toHaveBeenCalledTimes(0);
    const [secondMessages] = model.invoke.mock.calls[1];
    const toolMessage = secondMessages.find(
      (m: ChatMessage) => m.role === 'tool',
    );
    expect(toolMessage?.content).toBe('intercepted');
  });

  it('PreToolUse does not intercept when not returning result', async () => {
    const toolExecute = rs.fn(async () => 'Original');
    const tool = new Tool({
      name: 'echo',
      description: 'Echo',
      schema: z.object({ text: z.string() }),
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
              name: 'echo',
              arguments: JSON.stringify({ text: 'hello' }),
            },
          },
        ],
      },
      { role: 'assistant', content: 'Done.' },
    ]);

    const hook: AgentLoopHooks = {
      preToolUse: async (ctx: PreToolUseContext) => ({
        context: ctx,
      }),
    };

    const agent = new AgentLoop({ model, tools: [tool], hooks: [hook] });
    const result = await agent.run('Test');

    expect(result).toBe('Done.');
    expect(toolExecute).toHaveBeenCalledTimes(1);
  });

  it('PostToolUse is triggered after successful tool execution', async () => {
    const toolExecute = rs.fn(async () => 'ToolResult');
    const tool = new Tool({
      name: 'echo',
      description: 'Echo',
      schema: z.object({ text: z.string() }),
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
              name: 'echo',
              arguments: JSON.stringify({ text: 'hello' }),
            },
          },
        ],
      },
      { role: 'assistant', content: 'Done.' },
    ]);

    const postToolUse = rs.fn(async (ctx: PostToolUseContext) => ({
      context: ctx,
    }));

    const hook: AgentLoopHooks = {
      postToolUse,
    };

    const agent = new AgentLoop({ model, tools: [tool], hooks: [hook] });
    await agent.run('Test');

    expect(postToolUse).toHaveBeenCalledTimes(1);
    const [callCtx] = postToolUse.mock.calls[0];
    expect(callCtx.result).toBe('ToolResult');
    expect(callCtx.toolName).toBe('echo');
  });

  it('PostToolUseFailure repairs error when returning result', async () => {
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
      { role: 'assistant', content: 'Recovered.' },
    ]);

    const hook: AgentLoopHooks = {
      postToolUseFailure: async (ctx: PostToolUseFailureContext) => ({
        context: ctx,
        result: 'fixed',
      }),
    };

    const agent = new AgentLoop({ model, tools: [tool], hooks: [hook] });
    const result = await agent.run('Test');

    expect(result).toBe('Recovered.');
    const [secondMessages] = model.invoke.mock.calls[1];
    const toolMessage = secondMessages.find(
      (m: ChatMessage) => m.role === 'tool',
    );
    expect(toolMessage?.content).toBe('fixed');
  });

  it('PostToolUseFailure does not repair when not returning result', async () => {
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

    const hook: AgentLoopHooks = {
      postToolUseFailure: async (ctx: PostToolUseFailureContext) => ({
        context: ctx,
      }),
    };

    const agent = new AgentLoop({ model, tools: [tool], hooks: [hook] });
    const result = await agent.run('Test');

    expect(result).toBe('Failed.');
    const [secondMessages] = model.invoke.mock.calls[1];
    const toolMessage = secondMessages.find(
      (m: ChatMessage) => m.role === 'tool',
    );
    expect(toolMessage?.content).toBe('Oops');
  });

  it('Stop overrides return value when returning result', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Original' }]);
    const hook: AgentLoopHooks = {
      stop: async (ctx: StopContext) => ({
        context: ctx,
        result: 'overridden',
      }),
    };

    const agent = new AgentLoop({ model, hooks: [hook] });
    const result = await agent.run('Hi');

    expect(result).toBe('overridden');
  });

  it('Stop does not override when not returning result', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Original' }]);
    const hook: AgentLoopHooks = {
      stop: async (ctx: StopContext) => ({
        context: ctx,
      }),
    };

    const agent = new AgentLoop({ model, hooks: [hook] });
    const result = await agent.run('Hi');

    expect(result).toBe('Original');
  });

  it('multiple hooks chain execution, last non-undefined result wins', async () => {
    const toolExecute = rs.fn(async () => 'Original');
    const tool = new Tool({
      name: 'echo',
      description: 'Echo',
      schema: z.object({ text: z.string() }),
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
              name: 'echo',
              arguments: JSON.stringify({ text: 'hello' }),
            },
          },
        ],
      },
      { role: 'assistant', content: 'Done.' },
    ]);

    const hook1: AgentLoopHooks = {
      preToolUse: async (ctx: PreToolUseContext) => ({
        context: ctx,
        result: 'resultA',
      }),
    };

    const hook2: AgentLoopHooks = {
      preToolUse: async (ctx: PreToolUseContext) => ({
        context: ctx,
        result: 'resultB',
      }),
    };

    const agent = new AgentLoop({
      model,
      tools: [tool],
      hooks: [hook1, hook2],
    });
    await agent.run('Test');

    expect(toolExecute).toHaveBeenCalledTimes(0);
    const [secondMessages] = model.invoke.mock.calls[1];
    const toolMessage = secondMessages.find(
      (m: ChatMessage) => m.role === 'tool',
    );
    expect(toolMessage?.content).toBe('resultB');
  });

  it('hook throws error, run() rejects fail-fast', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Hello!' }]);
    const hook: AgentLoopHooks = {
      userPromptSubmit: async () => {
        throw new Error('Hook failed');
      },
    };

    const agent = new AgentLoop({ model, hooks: [hook] });

    await expect(agent.run('Hi')).rejects.toThrow('Hook failed');
    expect(model.invoke).toHaveBeenCalledTimes(0);
  });

  it('context messages can be modified by hook', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Hello!' }]);
    const hook: AgentLoopHooks = {
      userPromptSubmit: async (ctx: UserPromptSubmitContext) => {
        ctx.messages.push({ role: 'system', content: 'Injected' });
        return { context: ctx };
      },
    };

    const agent = new AgentLoop({ model, hooks: [hook] });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({ role: 'system', content: 'Injected' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });
});
