import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from '@rstest/core';
import { McpClient } from '../../src/mcp/client.js';

const mockServerPath = resolve('tests/fixtures/mock-mcp-server.mjs');

describe('McpClient', () => {
  const clients: McpClient[] = [];

  afterEach(() => {
    for (const c of clients.splice(0)) {
      c.close();
    }
  });

  it('C1: initialize() completes handshake without error', async () => {
    const client = new McpClient({
      command: 'node',
      args: [mockServerPath],
    });
    clients.push(client);
    await expect(client.initialize()).resolves.toBeUndefined();
  });

  it('C2: toolsList() returns tool array with correct info', async () => {
    const client = new McpClient({
      command: 'node',
      args: [mockServerPath],
    });
    clients.push(client);
    await client.initialize();
    const tools = await client.toolsList();

    expect(tools).toHaveLength(2);
    const echo = tools.find((t) => t.name === 'echo');
    expect(echo).toBeDefined();
    expect(echo?.description).toBe('Echo back the input text');
    expect(echo?.inputSchema).toEqual({
      type: 'object',
      properties: { text: { type: 'string' } },
    });

    const fail = tools.find((t) => t.name === 'fail');
    expect(fail).toBeDefined();
    expect(fail?.inputSchema).toEqual({ type: 'object' });
  });

  it('C3: toolsCall("echo") returns text content', async () => {
    const client = new McpClient({
      command: 'node',
      args: [mockServerPath],
    });
    clients.push(client);
    await client.initialize();
    const result = await client.toolsCall('echo', { text: 'hi' });

    expect(result.content).toEqual([{ type: 'text', text: 'hi' }]);
    expect(result.isError).toBe(false);
  });

  it('C4: toolsCall("fail") returns isError: true', async () => {
    const client = new McpClient({
      command: 'node',
      args: [mockServerPath],
    });
    clients.push(client);
    await client.initialize();
    const result = await client.toolsCall('fail', {});

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: 'intentional failure' },
    ]);
  });

  it('C5: close() terminates the child process', async () => {
    const client = new McpClient({
      command: 'node',
      args: [mockServerPath],
    });
    await client.initialize();
    client.close();

    await expect(client.toolsList()).rejects.toThrow();
  });

  it('C6: non-existent command causes initialize() to reject', async () => {
    const client = new McpClient({
      command: 'nonexistent-command-xyz',
      args: [],
    });
    clients.push(client);
    await expect(client.initialize()).rejects.toThrow();
  });
});
