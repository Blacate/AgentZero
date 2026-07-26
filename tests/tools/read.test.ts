import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { readTool } from '../../src/tools/read.js';

describe('readTool', () => {
  it('should read entire file', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'read-test-'));
    const filePath = join(tmpDir, 'test.txt');
    await writeFile(filePath, 'line1\nline2\nline3', 'utf-8');

    const result = await readTool.execute({ path: filePath });
    expect(result).toBe('line1\nline2\nline3');
  });

  it('should slice with offset (1-based)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'read-test-'));
    const filePath = join(tmpDir, 'test.txt');
    await writeFile(filePath, 'a\nb\nc\nd', 'utf-8');

    const result = await readTool.execute({ path: filePath, offset: 2 });
    expect(result).toBe('b\nc\nd');
  });

  it('should slice with limit', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'read-test-'));
    const filePath = join(tmpDir, 'test.txt');
    await writeFile(filePath, 'a\nb\nc\nd', 'utf-8');

    const result = await readTool.execute({ path: filePath, limit: 2 });
    expect(result).toBe('a\nb');
  });

  it('should slice with offset and limit together', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'read-test-'));
    const filePath = join(tmpDir, 'test.txt');
    await writeFile(filePath, 'a\nb\nc\nd\ne', 'utf-8');

    const result = await readTool.execute({
      path: filePath,
      offset: 2,
      limit: 2,
    });
    expect(result).toBe('b\nc');
  });
});
