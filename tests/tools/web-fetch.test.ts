import { describe, expect, it, rs } from '@rstest/core';
import { webFetchTool } from '../../src/tools/web-fetch.js';

describe('webFetchTool', () => {
  it('should fetch and return content', async () => {
    const mockFetch = rs.fn<typeof fetch>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('Hello World'),
      } as Response),
    );

    rs.stubGlobal('fetch', mockFetch);

    const result = await webFetchTool.execute({ url: 'https://example.com' });
    expect(result).toBe('Hello World');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com');
  });

  it('should return error with response body on HTTP error', async () => {
    const mockFetch = rs.fn<typeof fetch>(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Page not found'),
      } as Response),
    );

    rs.stubGlobal('fetch', mockFetch);

    const result = await webFetchTool.execute({
      url: 'https://example.com/missing',
    });
    expect(result).toBe('HTTP 404 Not Found\n\nPage not found');
  });

  it('should truncate large responses', async () => {
    const largeContent = 'a'.repeat(300_000);
    const mockFetch = rs.fn<typeof fetch>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(largeContent),
      } as Response),
    );

    rs.stubGlobal('fetch', mockFetch);

    const result = await webFetchTool.execute({
      url: 'https://example.com/big',
    });
    expect(result.length).toBeLessThan(largeContent.length);
    expect(result).toContain('... (truncated, 300000 total)');
  });

  it('should respect custom maxLength', async () => {
    const content = 'b'.repeat(1000);
    const mockFetch = rs.fn<typeof fetch>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(content),
      } as Response),
    );

    rs.stubGlobal('fetch', mockFetch);

    const result = await webFetchTool.execute({
      url: 'https://example.com',
      maxLength: 100,
    });
    expect(result).toBe(`${'b'.repeat(100)}\n... (truncated, 1000 total)`);
  });
});
