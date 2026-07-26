import { describe, expect, it } from '@rstest/core';
import { buildWorkspacePrompt } from '../src/workspace.js';

describe('buildWorkspacePrompt', () => {
  it('returns <workspace> block with current cwd', () => {
    const result = buildWorkspacePrompt();
    expect(result).toContain('<workspace>');
    expect(result).toContain('</workspace>');
    expect(result).toContain(`<cwd>${process.cwd()}</cwd>`);
  });

  it('uses 2-space indentation for <cwd> tag', () => {
    const result = buildWorkspacePrompt();
    expect(result).toContain('\n  <cwd>');
    expect(result).toContain('</cwd>\n');
  });
});
