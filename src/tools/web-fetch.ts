import { z } from 'zod';
import { Tool } from './tool.js';

export const webFetchTool = new Tool({
  name: 'web_fetch',
  description: 'Fetch content from a URL. Large responses are truncated.',
  schema: z.object({
    url: z.string().describe('URL to fetch'),
    maxLength: z
      .number()
      .optional()
      .describe('Max characters to return (default 200000)'),
  }),
  run: async ({ url, maxLength }) => {
    const res = await fetch(url);
    let text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}\n\n${text}`);
    }
    const limit = maxLength ?? 200_000;
    if (text.length > limit) {
      text = `${text.slice(0, limit)}\n... (truncated, ${text.length} total)`;
    }
    return text;
  },
});
