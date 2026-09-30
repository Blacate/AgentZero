import { writeFileSync } from 'node:fs';
import * as readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const tools = [
  {
    name: 'echo',
    description: 'Echo back the input text',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    },
  },
  {
    name: 'fail',
    description: 'Always returns an error',
    inputSchema: {
      type: 'object',
    },
  },
];

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.id !== undefined) {
    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'mock-mcp-server', version: '1.0.0' },
        },
      });
      if (process.env.MOCK_MCP_EXIT_AFTER_INITIALIZE === '1') {
        setImmediate(() => process.exit(0));
      }
      return;
    }

    if (msg.method === 'tools/list') {
      if (process.env.MOCK_MCP_FAIL_TOOLS_LIST === '1') {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32603, message: 'tools/list failed' },
        });
        return;
      }
      const respond = () => {
        if (process.env.MOCK_MCP_TOOLS_LIST_SENTINEL) {
          writeFileSync(process.env.MOCK_MCP_TOOLS_LIST_SENTINEL, 'ready');
        }
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { tools },
        });
      };
      const delay = Number(process.env.MOCK_MCP_TOOLS_LIST_DELAY ?? 0);
      if (delay > 0) {
        setTimeout(respond, delay);
      } else {
        respond();
      }
      return;
    }

    if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params;
      if (name === 'echo') {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: args.text }],
            isError: false,
          },
        });
        return;
      }
      if (name === 'fail') {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: 'intentional failure' }],
            isError: true,
          },
        });
        return;
      }
      send({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `Unknown tool: ${name}` },
      });
      return;
    }

    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `Unknown method: ${msg.method}` },
    });
    return;
  }

  // Notification (no id)
  if (msg.method === 'notifications/initialized') {
    return;
  }
});

process.on('exit', () => {
  if (process.env.MOCK_MCP_EXIT_SENTINEL) {
    writeFileSync(process.env.MOCK_MCP_EXIT_SENTINEL, 'exited');
  }
});

process.on('SIGTERM', () => process.exit(0));
