import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { Tool } from './tool.js';

export const writeTool = new Tool({
  name: 'write',
  description: 'Write content to a file. Creates parent directories if needed.',
  schema: z.object({
    path: z.string().describe('File path'),
    content: z.string().describe('Content to write'),
  }),
  run: async ({ path, content }) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf-8');
    return `File written: ${path}`;
  },
});
