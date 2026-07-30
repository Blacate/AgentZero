import { describe, expect, it, rs } from '@rstest/core';
import type { McpClient } from '../../src/mcp/client.js';
import { McpTool } from '../../src/mcp/mcp-tool.js';
import type { McpCallResult } from '../../src/mcp/types.js';

function createMockClient(
  callResult: McpCallResult,
): McpClient & { toolsCall: typeof rs.fn } {
  return {
    toolsCall: rs.fn(async () => callResult),
  } as unknown as McpClient & { toolsCall: typeof rs.fn };
}

describe('McpTool', () => {
  it('M1: definition name is mcp__<serverName>__<toolName>', () => {
    const client = createMockClient({
      content: [{ type: 'text', text: 'ok' }],
    });
    const tool = new McpTool({
      serverName: 'test',
      toolName: 'echo',
      description: 'Echo tool',
      inputSchema: { type: 'object' },
      client,
    });

    expect(tool.name).toBe('mcp__test__echo');
    expect(tool.definition.function.name).toBe('mcp__test__echo');
    expect(tool.definition.function.description).toBe('Echo tool');
    expect(tool.definition.function.parameters).toEqual({ type: 'object' });
  });

  it('M2: execute() calls client.toolsCall with original tool name', async () => {
    const client = createMockClient({
      content: [{ type: 'text', text: 'hi' }],
      isError: false,
    });
    const tool = new McpTool({
      serverName: 'test',
      toolName: 'echo',
      description: 'Echo',
      inputSchema: {},
      client,
    });

    const result = await tool.execute({ text: 'hi' });

    expect(result).toBe('hi');
    expect(client.toolsCall).toHaveBeenCalledWith('echo', { text: 'hi' });
  });

  it('M3: multiple text contents are concatenated, non-text ignored', async () => {
    const client = createMockClient({
      content: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
        { type: 'image', data: 'base64...' },
      ],
      isError: false,
    });
    const tool = new McpTool({
      serverName: 'test',
      toolName: 'echo',
      description: 'Echo',
      inputSchema: {},
      client,
    });

    const result = await tool.execute({});
    expect(result).toBe('ab');
  });

  it('M4: isError: true causes execute() to throw with content text', async () => {
    const client = createMockClient({
      content: [{ type: 'text', text: 'intentional failure' }],
      isError: true,
    });
    const tool = new McpTool({
      serverName: 'test',
      toolName: 'fail',
      description: 'Fail tool',
      inputSchema: {},
      client,
    });

    await expect(tool.execute({})).rejects.toThrow('intentional failure');
  });
});
