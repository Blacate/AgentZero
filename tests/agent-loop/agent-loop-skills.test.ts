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

function makeSkillsDir(
  skills: { name: string; description: string; body: string }[],
): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-zero-loop-skills-'));
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

describe('AgentLoop skills', () => {
  it('L1: injects skill prompt and skill tool by default', async () => {
    const dir = makeSkillsDir([
      { name: 'tdd', description: 'TDD skill', body: 'TDD body' },
    ]);
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: { dir },
      projectGuide: false,
    });
    await agent.run('Hi');

    const [messages, tools] = model.invoke.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('You are helpful.');
    expect(messages[0].content).toContain('<available-skills>');
    expect(messages[0].content).toContain('<skill name="tdd"');
    expect(tools.map((t: ToolDefinition) => t.function.name)).toContain(
      'skill',
    );
  });

  it('L2: skills: false disables skill injection and tool', async () => {
    const dir = makeSkillsDir([
      { name: 'tdd', description: 'TDD skill', body: 'TDD body' },
    ]);
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: false,
      projectGuide: false,
    });
    await agent.run('Hi');

    const [messages, tools] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    });
    expect(tools).toBeUndefined();
    expect(dir).toBeTruthy();
  });

  it('L3: empty skills dir behaves like no skills', async () => {
    const dir = makeSkillsDir([]);
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: { dir },
      projectGuide: false,
    });
    await agent.run('Hi');

    const [messages, tools] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    });
    expect(tools).toBeUndefined();
  });

  it('L4: hook replacing systemPrompt drops skill section', async () => {
    const dir = makeSkillsDir([
      { name: 'tdd', description: 'TDD skill', body: 'TDD body' },
    ]);
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: { dir },
      projectGuide: false,
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

  it('L5: skill prompt alone when no user systemPrompt', async () => {
    const dir = makeSkillsDir([
      { name: 'tdd', description: 'TDD skill', body: 'TDD body' },
    ]);
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      skills: { dir },
      projectGuide: false,
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('<skill-system>');
    expect(messages[0].content).not.toContain('\n\n<skill-system>');
  });

  it('L6: end-to-end skill tool call flow', async () => {
    const dir = makeSkillsDir([
      { name: 'tdd', description: 'TDD skill', body: 'Follow TDD.' },
    ]);
    const model = createMockModel([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'skill',
              arguments: JSON.stringify({ name: 'tdd' }),
            },
          },
        ],
      },
      { role: 'assistant', content: 'Loaded.' },
    ]);

    const agent = new AgentLoop({
      model,
      skills: { dir },
      projectGuide: false,
    });
    const result = await agent.run('Use tdd');

    expect(result).toBe('Loaded.');
    expect(model.invoke).toHaveBeenCalledTimes(2);
    const [secondMessages] = model.invoke.mock.calls[1];
    const toolMessage = secondMessages.find(
      (m: ChatMessage) => m.role === 'tool',
    );
    expect(toolMessage?.content).toBe('Follow TDD.');
  });
});
