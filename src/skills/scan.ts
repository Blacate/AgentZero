import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import matter from 'gray-matter';
import type { SkillInfo } from './types.js';

export function scanSkills(dir: string): SkillInfo[] {
  const absDir = resolve(dir);

  let entries: Dirent[];
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    // 目录不存在等情况一律视为无 skill
    return [];
  }

  const skills: SkillInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(absDir, entry.name, 'SKILL.md');
    try {
      const raw = readFileSync(skillPath, 'utf-8');
      const { data } = matter(raw);
      const description =
        typeof data.description === 'string' ? data.description.trim() : null;
      if (!description) continue;

      skills.push({
        name:
          typeof data.name === 'string' && data.name ? data.name : entry.name,
        description,
        path: skillPath,
      });
    } catch {
      // 读取失败或 frontmatter 非法：静默跳过
    }
  }

  return skills;
}
