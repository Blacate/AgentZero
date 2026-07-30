import { spawn } from 'node:child_process';
import type { Writable } from 'node:stream';
import type { McpCallResult, McpServerConfig, McpToolInfo } from './types.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export class McpClient {
  private proc: ReturnType<typeof spawn> | null = null;
  private stdin: Writable | null = null;
  private nextId = 0;
  private pending = new Map<number, PendingRequest>();
  private buffer = '';

  constructor(private config: McpServerConfig) {}

  async initialize(): Promise<void> {
    const proc = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc = proc;

    if (!proc.stdout || !proc.stdin) {
      throw new Error('Failed to get MCP server stdio streams');
    }
    this.stdin = proc.stdin;

    proc.stdout.setEncoding('utf-8');
    proc.stdout.on('data', (data: string) => {
      this.buffer += data;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          this.handleMessage(msg);
        } catch {
          // Ignore non-JSON lines
        }
      }
    });

    proc.on('error', (err: Error) => {
      for (const pending of this.pending.values()) {
        pending.reject(err);
      }
      this.pending.clear();
    });

    proc.on('exit', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('MCP server process exited'));
      }
      this.pending.clear();
    });

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'agent-zero', version: '1.0.0' },
    });

    this.notify('notifications/initialized', {});
  }

  async toolsList(): Promise<McpToolInfo[]> {
    const result = (await this.request('tools/list', {})) as {
      tools: McpToolInfo[];
    };
    return result.tools;
  }

  async toolsCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpCallResult> {
    const result = (await this.request('tools/call', {
      name,
      arguments: args,
    })) as McpCallResult;
    return result;
  }

  close(): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this.stdin = null;
    for (const pending of this.pending.values()) {
      pending.reject(new Error('MCP client closed'));
    }
    this.pending.clear();
  }

  private request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.stdin) {
        reject(new Error('MCP client not initialized'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.stdin.write(`${msg}\n`);
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    if (!this.stdin) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.stdin.write(`${msg}\n`);
  }

  private handleMessage(msg: {
    id?: number;
    result?: unknown;
    error?: { message: string };
  }): void {
    if (msg.id === undefined) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(msg.error.message));
    } else {
      pending.resolve(msg.result);
    }
  }
}
