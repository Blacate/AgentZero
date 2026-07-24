import { describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';
import { AgentLoop } from '../../src/agent-loop.js';
import type {
  AgentLoopHooks,
  PostToolUseContext,
  PostToolUseFailureContext,
  PreToolUseContext,
  StopContext,
  UserPromptSubmitContext,
} from '../../src/hooks/index.js';
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

  it('userPromptSubmit can adjust userMessage', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Hello!' }]);
    const hook: AgentLoopHooks = {
      userPromptSubmit: async (ctx: UserPromptSubmitContext) => {
        ctx.userMessage = 'Modified';
        return { context: ctx };
      },
    };

    const agent = new AgentLoop({ model, hooks: [hook] });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({ role: 'user', content: 'Modified' });
  });

  it('userPromptSubmit can adjust systemPrompt', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Hello!' }]);
    const hook: AgentLoopHooks = {
      userPromptSubmit: async (ctx: UserPromptSubmitContext) => {
        ctx.systemPrompt = 'Custom system';
        return { context: ctx };
      },
    };

    const agent = new AgentLoop({ model, hooks: [hook] });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({ role: 'system', content: 'Custom system' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('userPromptSubmit can remove systemPrompt by setting undefined', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Hello!' }]);
    const hook: AgentLoopHooks = {
      userPromptSubmit: async (ctx: UserPromptSubmitContext) => {
        ctx.systemPrompt = undefined;
        return { context: ctx };
      },
    };

    const agent = new AgentLoop({
      model,
      systemPrompt: 'Original system',
      hooks: [hook],
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('system prompt is injected only once across multiple run() calls', async () => {
    const model = createMockModel([
      { role: 'assistant', content: 'First' },
      { role: 'assistant', content: 'Second' },
    ]);

    const agent = new AgentLoop({ model, systemPrompt: 'You are helpful' });
    await agent.run('Hi');
    await agent.run('Again');

    const [secondMessages] = model.invoke.mock.calls[1];
    const systemMessages = secondMessages.filter(
      (m: ChatMessage) => m.role === 'system',
    );
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0]).toEqual({
      role: 'system',
      content: 'You are helpful',
    });
  });

  it('postToolUse hooks execute in reverse order (onion model)', async () => {
    const tool = new Tool({
      name: 'echo',
      description: 'Echo',
      schema: z.object({ text: z.string() }),
      run: async () => 'ToolResult',
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

    const order: string[] = [];
    const hook1: AgentLoopHooks = {
      postToolUse: async (ctx: PostToolUseContext) => {
        order.push('hook1');
        return { context: ctx };
      },
    };
    const hook2: AgentLoopHooks = {
      postToolUse: async (ctx: PostToolUseContext) => {
        order.push('hook2');
        return { context: ctx };
      },
    };

    const agent = new AgentLoop({
      model,
      tools: [tool],
      hooks: [hook1, hook2],
    });
    await agent.run('Test');

    expect(order).toEqual(['hook2', 'hook1']);
  });

  it('postToolUseFailure hooks execute in reverse order (onion model)', async () => {
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

    const order: string[] = [];
    const hook1: AgentLoopHooks = {
      postToolUseFailure: async (ctx: PostToolUseFailureContext) => {
        order.push('hook1');
        return { context: ctx };
      },
    };
    const hook2: AgentLoopHooks = {
      postToolUseFailure: async (ctx: PostToolUseFailureContext) => {
        order.push('hook2');
        return { context: ctx };
      },
    };

    const agent = new AgentLoop({
      model,
      tools: [tool],
      hooks: [hook1, hook2],
    });
    await agent.run('Test');

    expect(order).toEqual(['hook2', 'hook1']);
  });

  it('stop hooks execute in reverse order, symmetric to userPromptSubmit', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'Original' }]);

    const order: string[] = [];
    const hook1: AgentLoopHooks = {
      userPromptSubmit: async (ctx: UserPromptSubmitContext) => {
        order.push('hook1.pre');
        return { context: ctx };
      },
      stop: async (ctx: StopContext) => {
        order.push('hook1.post');
        return { context: ctx, result: 'hook1' };
      },
    };
    const hook2: AgentLoopHooks = {
      userPromptSubmit: async (ctx: UserPromptSubmitContext) => {
        order.push('hook2.pre');
        return { context: ctx };
      },
      stop: async (ctx: StopContext) => {
        order.push('hook2.post');
        return { context: ctx, result: 'hook2' };
      },
    };

    const agent = new AgentLoop({ model, hooks: [hook1, hook2] });
    const result = await agent.run('Hi');

    expect(order).toEqual([
      'hook1.pre',
      'hook2.pre',
      'hook2.post',
      'hook1.post',
    ]);
    expect(result).toBe('hook1');
  });
});
