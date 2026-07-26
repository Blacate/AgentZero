import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, rs } from '@rstest/core';
import { AgentLoop } from '../../src/agent-loop.js';
import type { ChatMessage, Model, ToolDefinition } from '../../src/model.js';

function createMockModel(
  responses: ChatMessage[],
): Model & { invoke: typeof rs.fn } {
  let index = 0;
  const invoke = rs.fn(
    async (_messages: ChatMessage[], _tools?: ToolDefinition[]) => {
      const res = responses[index];
      index += 1;
      return res;
    },
  );

  return {
    invoke,
  } as unknown as Model & { invoke: typeof rs.fn };
}

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agent-zero-loop-pg-'));
}

function writeGuide(dir: string, content: string): string {
  const filePath = join(dir, 'AGENTS.md');
  writeFileSync(filePath, content);
  return filePath;
}

function makeSkillsDir(
  skills: { name: string; description: string; body: string }[],
): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-zero-loop-pg-skills-'));
  for (const skill of skills) {
    const skillDir = join(dir, skill.name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n${skill.body}\n`,
    );
  }
  return dir;
}

describe('AgentLoop project guide', () => {
  it('L1: injects <project_guide> after user systemPrompt by default', async () => {
    const dir = makeTmpDir();
    writeGuide(dir, 'Be a concise coder.');
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      projectGuide: { path: join(dir, 'AGENTS.md') },
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0].role).toBe('system');
    const content = messages[0].content as string;
    expect(content).toContain('You are helpful.');
    expect(content).toContain('<project_guide>');
    expect(content).toContain('Be a concise coder.');
    expect(content).toContain('</project_guide>');
    // <project_guide> appears after user systemPrompt
    expect(content.indexOf('You are helpful.')).toBeLessThan(
      content.indexOf('<project_guide>'),
    );
  });

  it('L2: projectGuide: false disables injection', async () => {
    const dir = makeTmpDir();
    writeGuide(dir, 'Be a concise coder.');
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: false,
      projectGuide: false,
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    });
  });

  it('L3: missing file is silently skipped', async () => {
    const dir = makeTmpDir();
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: false,
      projectGuide: { path: join(dir, 'AGENTS.md') },
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    });
  });

  it('L4: coexists with skills, order: systemPrompt -> project_guide -> skill-system', async () => {
    const guideDir = makeTmpDir();
    writeGuide(guideDir, 'Project rules here.');
    const skillsDir = makeSkillsDir([
      { name: 'tdd', description: 'TDD skill', body: 'TDD body' },
    ]);
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: { dir: skillsDir },
      projectGuide: { path: join(guideDir, 'AGENTS.md') },
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    const content = messages[0].content as string;
    expect(content).toContain('You are helpful.');
    expect(content).toContain('<project_guide>');
    expect(content).toContain('<skill-system>');

    const userIdx = content.indexOf('You are helpful.');
    const guideIdx = content.indexOf('<project_guide>');
    const skillIdx = content.indexOf('<skill-system>');
    expect(userIdx).toBeLessThan(guideIdx);
    expect(guideIdx).toBeLessThan(skillIdx);
  });

  it('L5: project_guide alone when no user systemPrompt', async () => {
    const dir = makeTmpDir();
    writeGuide(dir, 'Standalone guide.');
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      skills: false,
      projectGuide: { path: join(dir, 'AGENTS.md') },
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0].role).toBe('system');
    const content = messages[0].content as string;
    expect(content).toContain('<project_guide>');
    expect(content).toContain('Standalone guide.');
    // No leading double newline (project_guide is first segment)
    expect(content).not.toContain('\n\n<project_guide>');
  });

  it('L6: hook replacing systemPrompt drops project_guide section', async () => {
    const dir = makeTmpDir();
    writeGuide(dir, 'Guide content.');
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: false,
      projectGuide: { path: join(dir, 'AGENTS.md') },
      hooks: [
        {
          userPromptSubmit: async (ctx) => ({
            context: { ...ctx, systemPrompt: 'Replaced.' },
          }),
        },
      ],
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({ role: 'system', content: 'Replaced.' });
  });
});
