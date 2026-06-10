import { glob } from 'node:fs/promises';
import { z } from 'zod';
import { Tool } from './tool.js';

export const globTool = new Tool({
  name: 'glob',
  description: 'Find files matching a glob pattern',
  schema: z.object({
    pattern: z.string().describe('Glob pattern'),
    cwd: z.string().optional().describe('Working directory'),
  }),
  run: async ({ pattern, cwd }) => {
    const results: string[] = [];
    for await (const file of glob(pattern, { cwd })) {
      results.push(file);
    }
    return results.join('\n') || '(no matches)';
  },
});
