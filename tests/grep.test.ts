import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { grepTool } from '../src/tools/grep.js';

describe('grepTool', () => {
  it('should find matching lines in a file', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'grep-test-'));
    const filePath = join(tmpDir, 'sample.ts');
    await writeFile(filePath, 'const foo = 1;\nconst bar = 2;\n', 'utf-8');

    const result = await grepTool.execute({
      pattern: 'foo',
      path: filePath,
    });

    expect(result).toContain('foo');
    expect(result).toContain('1:');

  });

  it('should return no matches message for non-matching pattern', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'grep-test-'));
    const filePath = join(tmpDir, 'sample.ts');
    await writeFile(filePath, 'const foo = 1;\n', 'utf-8');

    const result = await grepTool.execute({
      pattern: 'baz',
      path: filePath,
    });

    expect(result).toBe('(no matches)');

  });

  it('should filter by glob pattern', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'grep-test-'));
    await writeFile(join(tmpDir, 'a.ts'), 'const x = 1;\n', 'utf-8');
    await writeFile(join(tmpDir, 'b.js'), 'const x = 2;\n', 'utf-8');

    const result = await grepTool.execute({
      pattern: 'const x',
      path: tmpDir,
      glob: '*.ts',
    });

    expect(result).toContain('a.ts');
    expect(result).not.toContain('b.js');

  });
});
