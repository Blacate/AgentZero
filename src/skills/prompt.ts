import type { SkillInfo } from './types.js';

export function buildSkillPrompt(skills: SkillInfo[]): string {
  if (skills.length === 0) return '';

  const index = skills
    .map(
      (s) =>
        `<skill name="${s.name}" path="${s.path}">${s.description}</skill>`,
    )
    .join('\n');

  return `<skill-system>
You have access to the following skills, loaded progressively:
- When the user's request matches a skill's purpose, call the skill() tool with its name to load its full instructions before proceeding.
- A skill's SKILL.md may reference additional resources in its own directory; use the path below to read them with the read tool.
- Load skills on demand only; do not load skills you do not need.
- Once loaded, follow the skill's instructions strictly.
</skill-system>

<available-skills>
${index}
</available-skills>`;
}
