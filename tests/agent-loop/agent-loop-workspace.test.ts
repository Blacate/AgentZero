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

describe('AgentLoop workspace', () => {
  it('injects <workspace> with cwd by default', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: false,
      projectGuide: false,
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    const content = messages[0].content as string;
    expect(content).toContain('<workspace>');
    expect(content).toContain(`<cwd>${process.cwd()}</cwd>`);
    expect(content).toContain('</workspace>');
  });

  it('workspace: false disables injection', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: false,
      projectGuide: false,
      workspace: false,
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    });
  });

  it('workspace appears after systemPrompt, before project_guide', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      systemPrompt: 'You are helpful.',
      skills: false,
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    const content = messages[0].content as string;
    const userIdx = content.indexOf('You are helpful.');
    const workspaceIdx = content.indexOf('<workspace>');
    const guideIdx = content.indexOf('<project_guide>');
    expect(userIdx).toBeLessThan(workspaceIdx);
    expect(workspaceIdx).toBeLessThan(guideIdx);
  });

  it('workspace is the first segment when no user systemPrompt', async () => {
    const model = createMockModel([{ role: 'assistant', content: 'OK' }]);

    const agent = new AgentLoop({
      model,
      skills: false,
    });
    await agent.run('Hi');

    const [messages] = model.invoke.mock.calls[0];
    const content = messages[0].content as string;
    expect(content.startsWith('<workspace>')).toBe(true);
  });
});
