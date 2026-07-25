import { readFile } from 'node:fs/promises';
import matter from 'gray-matter';
import { z } from 'zod';
import { Tool } from '../tools/tool.js';
import type { SkillInfo } from './types.js';

export function createSkillTool(
  skills: SkillInfo[],
): Tool<z.ZodObject<{ name: z.ZodString }>> {
  return new Tool({
    name: 'skill',
    description:
      'Load a skill when the user request matches its purpose. Pass the skill name to get its full instructions.',
    schema: z.object({
      name: z.string().describe('Skill name from <available-skills>'),
    }),
    run: async ({ name }) => {
      const skill = skills.find((s) => s.name === name);
      if (!skill) {
        const available = skills.map((s) => s.name).join(', ');
        return `Skill "${name}" not found. Available skills: ${available}`;
      }

      const raw = await readFile(skill.path, 'utf-8');
      const { content } = matter(raw);
      return content.trim();
    },
  });
}
