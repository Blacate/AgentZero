import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { buildProjectGuidePrompt } from '../src/project-guide.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agent-zero-project-guide-'));
}

describe('buildProjectGuidePrompt', () => {
  it('PG1: returns wrapped content when file exists and has content', () => {
    const dir = makeTmpDir();
    const filePath = join(dir, 'AGENTS.md');
    writeFileSync(filePath, 'You are an expert coder.');

    const result = buildProjectGuidePrompt(filePath);

    expect(result).toBe(
      '<project_guide>\nYou are an expert coder.\n</project_guide>',
    );
  });

  it('PG2: returns empty string when file does not exist', () => {
    const dir = makeTmpDir();
    const filePath = join(dir, 'missing.md');

    const result = buildProjectGuidePrompt(filePath);

    expect(result).toBe('');
  });

  it('PG3: returns empty string when file content is only whitespace', () => {
    const dir = makeTmpDir();
    const filePath = join(dir, 'AGENTS.md');
    writeFileSync(filePath, '   \n\t\n  ');

    const result = buildProjectGuidePrompt(filePath);

    expect(result).toBe('');
  });

  it('PG4: preserves multiline content with only leading/trailing trim', () => {
    const dir = makeTmpDir();
    const filePath = join(dir, 'AGENTS.md');
    const body = 'Line 1\nLine 2\n\nLine 4';
    writeFileSync(filePath, `\n\n${body}\n\n`);

    const result = buildProjectGuidePrompt(filePath);

    expect(result).toBe(`<project_guide>\n${body}\n</project_guide>`);
  });

  it('PG5: result always starts with <project_guide> or is empty', () => {
    const dir = makeTmpDir();

    const nonEmptyPath = join(dir, 'AGENTS.md');
    writeFileSync(nonEmptyPath, 'Some guide');
    const missingPath = join(dir, 'missing.md');

    expect(buildProjectGuidePrompt(nonEmptyPath)).toMatch(/^<project_guide>/);
    expect(buildProjectGuidePrompt(missingPath)).toBe('');
  });
});
