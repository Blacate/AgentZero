import { describe, expect, it } from '@rstest/core';
import { buildSkillPrompt } from '../../src/skills/prompt.js';
import type { SkillInfo } from '../../src/skills/types.js';

describe('buildSkillPrompt', () => {
  it('P1: returns empty string for empty skills', () => {
    expect(buildSkillPrompt([])).toBe('');
  });

  it('P2: builds prompt with skill-system and available-skills', () => {
    const skills: SkillInfo[] = [
      {
        name: 'tdd',
        description: 'Test-driven development',
        path: '/abs/tdd/SKILL.md',
      },
    ];

    const prompt = buildSkillPrompt(skills);

    expect(prompt).toContain('<skill-system>');
    expect(prompt).toContain('</skill-system>');
    expect(prompt).toContain('<available-skills>');
    expect(prompt).toContain('</available-skills>');
    expect(prompt).toContain(
      '<skill name="tdd" path="/abs/tdd/SKILL.md">Test-driven development</skill>',
    );
  });

  it('P3: lists multiple skills in order', () => {
    const skills: SkillInfo[] = [
      { name: 'a', description: 'Skill A', path: '/abs/a/SKILL.md' },
      { name: 'b', description: 'Skill B', path: '/abs/b/SKILL.md' },
    ];

    const prompt = buildSkillPrompt(skills);

    const indexA = prompt.indexOf('<skill name="a"');
    const indexB = prompt.indexOf('<skill name="b"');
    expect(indexA).toBeGreaterThan(-1);
    expect(indexB).toBeGreaterThan(-1);
    expect(indexA).toBeLessThan(indexB);
  });
});
