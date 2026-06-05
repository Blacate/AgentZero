import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { Tool } from './tool.js';

export const readTool = new Tool({
  name: 'read',
  description:
    'Read a text file. Supports line-based slicing with offset and limit.',
  schema: z.object({
    path: z.string().describe('File path'),
    offset: z.number().optional().describe('Start line (1-based)'),
    limit: z.number().optional().describe('Max lines to read'),
  }),
  run: async ({ path, offset, limit }) => {
    const content = await readFile(path, 'utf-8');
    const lines = content.split('\n');
    const start = offset ? Math.max(0, offset - 1) : 0;
    const end = limit ? start + limit : lines.length;
    return lines.slice(start, end).join('\n');
  },
});
