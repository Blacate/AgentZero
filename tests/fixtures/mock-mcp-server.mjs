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
      return;
    }

    if (msg.method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { tools },
      });
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
