import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { createSkillTool } from '../../src/skills/skill-tool.js';
import type { SkillInfo } from '../../src/skills/types.js';

function makeSkill(name: string, content: string): SkillInfo {
  const dir = mkdtempSync(join(tmpdir(), 'agent-zero-skill-tool-'));
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  const path = join(skillDir, 'SKILL.md');
  writeFileSync(path, content);
  return { name, description: `${name} skill`, path };
}

describe('createSkillTool', () => {
  it('T1: returns body without frontmatter on hit', async () => {
    const skill = makeSkill(
      'tdd',
      '---\nname: tdd\ndescription: TDD skill\n---\nFollow red-green-refactor.\n',
    );
    const tool = createSkillTool([skill]);

    const result = await tool.execute({ name: 'tdd' });

    const skillDir = dirname(skill.path);
    expect(result).toBe(
      `Base directory for this skill: ${skillDir}\n\nFollow red-green-refactor.`,
    );
    expect(result).not.toContain('---');
  });

  it('T2: returns error text with available skills on miss', async () => {
    const tool = createSkillTool([makeSkill('a', '---\nname: a\n---\nA')]);

    const result = await tool.execute({ name: 'missing' });

    expect(result).toBe('Skill "missing" not found. Available skills: a');
  });

  it('T3: exposes correct tool definition', () => {
    const tool = createSkillTool([]);

    expect(tool.definition.function.name).toBe('skill');
    const params = tool.definition.function.parameters as {
      type: string;
      required?: string[];
    };
    expect(params.type).toBe('object');
    expect(params.required).toEqual(['name']);
  });

  it('T4: throws on invalid args', async () => {
    const tool = createSkillTool([]);

    await expect(tool.execute({})).rejects.toThrow();
  });
});
