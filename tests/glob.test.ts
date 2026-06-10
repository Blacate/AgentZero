import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { globTool } from '../src/tools/glob.js';

describe('globTool', () => {
  it('should match files in current directory', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'glob-test-'));
    await writeFile(join(tmpDir, 'a.txt'), '', 'utf-8');
    await writeFile(join(tmpDir, 'b.txt'), '', 'utf-8');
    await writeFile(join(tmpDir, 'c.js'), '', 'utf-8');

    const result = await globTool.execute({ pattern: '*.txt', cwd: tmpDir });
    const lines = result.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines).toContain('a.txt');
    expect(lines).toContain('b.txt');

  });

  it('should return no matches message when empty', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'glob-test-'));

    const result = await globTool.execute({ pattern: '*.md', cwd: tmpDir });
    expect(result).toBe('(no matches)');

  });
});
