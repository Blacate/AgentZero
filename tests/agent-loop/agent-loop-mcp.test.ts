import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';
import { AgentLoop } from '../../src/agent-loop.js';
import type { ChatMessage, Model, ToolDefinition } from '../../src/model.js';
import { Tool, type ToolLike } from '../../src/tools/tool.js';

const mockServerPath = resolve('tests/fixtures/mock-mcp-server.mjs');

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(path)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

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

describe('AgentLoop MCP integration', () => {
  const agents: AgentLoop[] = [];

  afterEach(() => {
    for (const a of agents.splice(0)) {
      a.close();
    }
  });

  it('A1: MCP tools are registered after run()', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);
    const agent = new AgentLoop({
      model,
      mcpServers: { test: { command: 'node', args: [mockServerPath] } },
      skills: false,
      projectGuide: false,
      workspace: false,
    });
    agents.push(agent);
    await agent.run('Hi');

    const [, tools] = model.invoke.mock.calls[0];
    const names = tools.map((t: ToolDefinition) => t.function.name);
    expect(names).toContain('mcp__test__echo');
    expect(names).toContain('mcp__test__fail');
  });

  it('A2: end-to-end MCP tool call flow', async () => {
    const model = createMockModel([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'mcp__test__echo',
              arguments: JSON.stringify({ text: 'hello' }),
            },
          },
        ],
      },
      { role: 'assistant', content: 'Echoed: hello' },
    ]);

    const agent = new AgentLoop({
      model,
      mcpServers: { test: { command: 'node', args: [mockServerPath] } },
      skills: false,
      projectGuide: false,
      workspace: false,
    });
    agents.push(agent);
    const result = await agent.run('Echo hello');

    expect(result).toBe('Echoed: hello');
    expect(model.invoke).toHaveBeenCalledTimes(2);
    const [secondMessages] = model.invoke.mock.calls[1];
    const toolMessage = secondMessages.find(
      (m: ChatMessage) => m.role === 'tool',
    );
    expect(toolMessage?.content).toBe('hello');
  });

  it('A3: server startup failure is skipped with warning, local tools still work', async () => {
    const warnSpy = rs.fn();
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      const localTool = new Tool({
        name: 'ping',
        description: 'Ping',
        schema: z.object({}),
        run: () => 'pong',
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
                name: 'ping',
                arguments: '{}',
              },
            },
          ],
        },
        { role: 'assistant', content: 'Done' },
      ]);

      const agent = new AgentLoop({
        model,
        tools: [localTool],
        mcpServers: {
          broken: { command: 'nonexistent-command-xyz', args: [] },
        },
        skills: false,
        projectGuide: false,
        workspace: false,
      });
      agents.push(agent);
      const result = await agent.run('Ping');

      expect(result).toBe('Done');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMsg = warnSpy.mock.calls[0][0] as string;
      expect(warnMsg).toContain('broken');
    } finally {
      console.warn = originalWarn;
    }
  });

  it('A4: close() cleans up MCP child processes', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);
    const agent = new AgentLoop({
      model,
      mcpServers: { test: { command: 'node', args: [mockServerPath] } },
      skills: false,
      projectGuide: false,
      workspace: false,
    });
    await agent.run('Hi');
    expect(() => agent.close()).not.toThrow();
  });

  it('A5: init() is idempotent across multiple run() calls', async () => {
    const model = createMockModel([
      { role: 'assistant', content: 'First' },
      { role: 'assistant', content: 'Second' },
    ]);

    const agent = new AgentLoop({
      model,
      mcpServers: { test: { command: 'node', args: [mockServerPath] } },
      skills: false,
      projectGuide: false,
      workspace: false,
    });
    agents.push(agent);
    await agent.run('Hi');
    await agent.run('Again');

    const [firstTools] = model.invoke.mock.calls[0].slice(1);
    const [secondTools] = model.invoke.mock.calls[1].slice(1);
    const firstNames = firstTools.map((t: ToolDefinition) => t.function.name);
    const secondNames = secondTools.map((t: ToolDefinition) => t.function.name);

    expect(firstNames).toEqual(secondNames);
    const mcpCount = secondNames.filter((n: string) =>
      n.startsWith('mcp__'),
    ).length;
    expect(mcpCount).toBe(2);
  });

  it('A6: preToolUse hook intercepts MCP tool execution', async () => {
    const model = createMockModel([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'mcp__test__echo',
              arguments: JSON.stringify({ text: 'hello' }),
            },
          },
        ],
      },
      { role: 'assistant', content: 'Done' },
    ]);

    const agent = new AgentLoop({
      model,
      mcpServers: { test: { command: 'node', args: [mockServerPath] } },
      skills: false,
      projectGuide: false,
      workspace: false,
      hooks: [
        {
          preToolUse: async (ctx) => ({
            context: ctx,
            result: 'intercepted by hook',
          }),
        },
      ],
    });
    agents.push(agent);
    const result = await agent.run('Echo hello');

    expect(result).toBe('Done');
    const [secondMessages] = model.invoke.mock.calls[1];
    const toolMessage = secondMessages.find(
      (m: ChatMessage) => m.role === 'tool',
    );
    expect(toolMessage?.content).toBe('intercepted by hook');
  });

  it('A7: overlapping init() calls wait for the same initialization', async () => {
    const sentinel = join(
      mkdtempSync(join(tmpdir(), 'agent-zero-mcp-')),
      'ready',
    );
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);
    const agent = new AgentLoop({
      model,
      mcpServers: {
        test: {
          command: 'node',
          args: [mockServerPath],
          env: {
            MOCK_MCP_TOOLS_LIST_DELAY: '50',
            MOCK_MCP_TOOLS_LIST_SENTINEL: sentinel,
          },
        },
      },
      skills: false,
      projectGuide: false,
      workspace: false,
    });
    agents.push(agent);

    const firstInit = agent.init();
    const secondInit = agent.init();
    await secondInit;
    const secondWaitedForTools = existsSync(sentinel);
    await firstInit;

    expect(secondWaitedForTools).toBe(true);
  });

  it('A8: initialization does not mutate the provided tools array', async () => {
    const providedTools: ToolLike[] = [];
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);
    const agent = new AgentLoop({
      model,
      tools: providedTools,
      mcpServers: { test: { command: 'node', args: [mockServerPath] } },
      skills: false,
      projectGuide: false,
      workspace: false,
    });
    agents.push(agent);

    await agent.run('Hi');

    expect(providedTools).toHaveLength(0);
    const [, tools] = model.invoke.mock.calls[0];
    expect(tools).toHaveLength(2);
  });

  it('A9: a client is closed when tool discovery fails', async () => {
    const sentinel = join(
      mkdtempSync(join(tmpdir(), 'agent-zero-mcp-')),
      'exited',
    );
    const warnSpy = rs.fn();
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      const model = createMockModel([{ role: 'assistant', content: 'OK' }]);
      const agent = new AgentLoop({
        model,
        mcpServers: {
          broken: {
            command: 'node',
            args: [mockServerPath],
            env: {
              MOCK_MCP_FAIL_TOOLS_LIST: '1',
              MOCK_MCP_EXIT_SENTINEL: sentinel,
            },
          },
        },
        skills: false,
        projectGuide: false,
        workspace: false,
      });
      agents.push(agent);

      await agent.run('Hi');
      await waitForFile(sentinel);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      console.warn = originalWarn;
    }
  });
});
