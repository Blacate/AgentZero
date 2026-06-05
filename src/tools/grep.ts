import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { Tool } from './tool.js';

const execFileAsync = promisify(execFile);

export const grepTool = new Tool({
  name: 'grep',
  description: 'Search file contents using ripgrep (rg)',
  schema: z.object({
    pattern: z.string().describe('Regex pattern'),
    path: z.string().describe('File or directory to search'),
    glob: z.string().optional().describe('Glob filter for files'),
  }),
  run: async ({ pattern, path, glob: globFilter }) => {
    const rgArgs = ['-n', '-e', pattern];
    if (globFilter) rgArgs.push('--glob', globFilter);
    rgArgs.push(path);
    const { stdout } = await execFileAsync('rg', rgArgs);
    return stdout || '(no matches)';
  },
});
