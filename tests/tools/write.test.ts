import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { writeTool } from '../../src/tools/write.js';

describe('writeTool', () => {
  it('should write content to a file', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'write-test-'));
    const filePath = join(tmpDir, 'test.txt');

    const result = await writeTool.execute({
      path: filePath,
      content: 'hello',
    });
    expect(result).toBe(`File written: ${filePath}`);

    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('hello');

  });

  it('should create parent directories automatically', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'write-test-'));
    const filePath = join(tmpDir, 'nested', 'dir', 'test.txt');

    const result = await writeTool.execute({
      path: filePath,
      content: 'nested content',
    });
    expect(result).toBe(`File written: ${filePath}`);

    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('nested content');

  });

  it('should overwrite existing file', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'write-test-'));
    const filePath = join(tmpDir, 'test.txt');

    await writeTool.execute({ path: filePath, content: 'first' });
    await writeTool.execute({ path: filePath, content: 'second' });

    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('second');

  });
});
