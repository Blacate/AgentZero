import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { scanSkills } from '../../src/skills/scan.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agent-zero-skills-'));
}

function writeSkill(dir: string, name: string, content: string): string {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  const skillPath = join(skillDir, 'SKILL.md');
  writeFileSync(skillPath, content);
  return skillPath;
}

describe('scanSkills', () => {
  it('S1: returns valid skills with name/description/path', () => {
    const dir = makeTmpDir();
    const aPath = writeSkill(
      dir,
      'alpha',
      '---\nname: alpha\ndescription: Alpha skill\n---\nBody A',
    );
    const bPath = writeSkill(
      dir,
      'beta',
      '---\nname: beta\ndescription: Beta skill\n---\nBody B',
    );

    const skills = scanSkills(dir);

    expect(skills).toHaveLength(2);
    expect(skills[0]).toEqual({
      name: 'alpha',
      description: 'Alpha skill',
      path: aPath,
    });
    expect(skills[1]).toEqual({
      name: 'beta',
      description: 'Beta skill',
      path: bPath,
    });
  });

  it('S2: returns [] when dir does not exist', () => {
    expect(scanSkills(join(makeTmpDir(), 'not-exists'))).toEqual([]);
  });

  it('S3: skips subdirs without SKILL.md and ignores top-level .md files', () => {
    const dir = makeTmpDir();
    mkdirSync(join(dir, 'no-skill-file'));
    writeFileSync(join(dir, 'standalone.md'), '---\ndescription: x\n---\n');
    writeSkill(dir, 'ok', '---\ndescription: OK skill\n---\nBody');

    const skills = scanSkills(dir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('ok');
  });

  it('S4: skips skill with invalid YAML frontmatter', () => {
    const dir = makeTmpDir();
    writeSkill(dir, 'broken', '---\nname: [unclosed\n---\nBody');
    writeSkill(dir, 'good', '---\ndescription: Good skill\n---\nBody');

    const skills = scanSkills(dir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('good');
  });

  it('S5: skips skill without description', () => {
    const dir = makeTmpDir();
    writeSkill(dir, 'no-desc', '---\nname: no-desc\n---\nBody');
    writeSkill(
      dir,
      'bad-desc',
      '---\nname: bad-desc\ndescription:\n  - not-a-string\n---\nBody',
    );

    expect(scanSkills(dir)).toEqual([]);
  });

  it('S6: falls back to directory name when name is missing', () => {
    const dir = makeTmpDir();
    writeSkill(dir, 'dirname', '---\ndescription: No name\n---\nBody');

    const skills = scanSkills(dir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('dirname');
  });

  it('S7: frontmatter name wins over directory name', () => {
    const dir = makeTmpDir();
    writeSkill(
      dir,
      'dirname',
      '---\nname: real-name\ndescription: Mismatch\n---\nBody',
    );

    expect(scanSkills(dir)[0].name).toBe('real-name');
  });

  it('S8: parses folded multiline description', () => {
    const dir = makeTmpDir();
    writeSkill(
      dir,
      'folded',
      '---\nname: folded\ndescription: >\n  Line one\n  line two\n---\nBody',
    );

    expect(scanSkills(dir)[0].description).toBe('Line one line two');
  });

  it('S9: returns [] for empty dir', () => {
    expect(scanSkills(makeTmpDir())).toEqual([]);
  });
});
