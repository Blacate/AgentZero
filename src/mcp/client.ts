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
      proc.kill();
      throw new Error('Failed to get MCP server stdio streams');
    }
    this.stdin = proc.stdin;
    proc.stderr?.resume();

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

    proc.stdin.on('error', (error: Error) => {
      this.handleDisconnect(proc, error);
    });

    proc.on('error', (error: Error) => {
      this.handleDisconnect(proc, error);
    });

    proc.on('exit', (code, signal) => {
      const detail = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      this.handleDisconnect(
        proc,
        new Error(`MCP server process exited with ${detail}`),
      );
    });

    try {
      await this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agent-zero', version: '1.0.0' },
      });

      this.notify('notifications/initialized', {});
    } catch (error) {
      this.close();
      throw error;
    }
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
    const proc = this.proc;
    this.proc = null;
    this.stdin = null;
    this.rejectPending(new Error('MCP client closed'));
    if (proc && !proc.killed) {
      proc.kill();
    }
  }

  private request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const stdin = this.stdin;
      if (!stdin?.writable || stdin.destroyed) {
        reject(new Error('MCP client not initialized'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      stdin.write(`${msg}\n`, (error?: Error | null) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    if (!this.stdin?.writable || this.stdin.destroyed) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.stdin.write(`${msg}\n`);
  }

  private handleDisconnect(proc: ReturnType<typeof spawn>, error: Error): void {
    if (this.proc !== proc) return;
    this.proc = null;
    this.stdin = null;
    this.rejectPending(error);
    if (!proc.killed) {
      proc.kill();
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
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
