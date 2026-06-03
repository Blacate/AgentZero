import { describe, expect, it, rs } from '@rstest/core';
import { Model } from '../src/model.js';

describe('Model', () => {
  it('should construct with config', () => {
    const model = new Model({
      apiKey: 'test-key',
      baseURL: 'https://api.example.com',
      model: 'test-model',
    });
    expect(model).toBeInstanceOf(Model);
  });

  it('should invoke and return assistant message', async () => {
    const mockFetch = rs.fn<typeof fetch>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Hello!',
                },
              },
            ],
          }),
      } as Response),
    );

    rs.stubGlobal('fetch', mockFetch);

    const model = new Model({
      apiKey: 'test-key',
      baseURL: 'https://api.example.com/v1',
      model: 'test-model',
    });

    const result = await model.invoke([
      { role: 'user', content: 'Hi' },
    ]);

    expect(result).toEqual({
      role: 'assistant',
      content: 'Hello!',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)?.Authorization).toBe(
      'Bearer test-key',
    );
  });

  it('should strip trailing slash from baseURL', async () => {
    const mockFetch = rs.fn<typeof fetch>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'OK',
                },
              },
            ],
          }),
      } as Response),
    );

    rs.stubGlobal('fetch', mockFetch);

    const model = new Model({
      apiKey: 'test-key',
      baseURL: 'https://api.example.com/v1/',
      model: 'test-model',
    });

    await model.invoke([{ role: 'user', content: 'Hi' }]);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
  });

  it('should throw error when response is not ok', async () => {
    const mockFetch = rs.fn<typeof fetch>(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({}),
      } as Response),
    );

    rs.stubGlobal('fetch', mockFetch);

    const model = new Model({
      apiKey: 'bad-key',
      baseURL: 'https://api.example.com/v1',
      model: 'test-model',
    });

    await expect(
      model.invoke([{ role: 'user', content: 'Hi' }]),
    ).rejects.toThrow('Model API error: 401 Unauthorized');
  });

  it('should pass tools to the API', async () => {
    const mockFetch = rs.fn<typeof fetch>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Done',
                },
              },
            ],
          }),
      } as Response),
    );

    rs.stubGlobal('fetch', mockFetch);

    const model = new Model({
      apiKey: 'test-key',
      baseURL: 'https://api.example.com/v1',
      model: 'test-model',
    });

    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'getWeather',
          description: 'Get weather',
          parameters: { type: 'object', properties: {} },
        },
      },
    ];

    await model.invoke([{ role: 'user', content: 'Weather?' }], tools);

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.tools).toEqual(tools);
  });

  it('should make real API call', async () => {
    const baseURL = process.env.API_BASE_URL;
    const apiKey = process.env.API_KEY;
    const modelName = process.env.MODEL;

    if (!baseURL || !apiKey || !modelName) {
      rs.setConfig({ testTimeout: 5000 });
      throw new Error('Skip: API_BASE_URL, API_KEY, or MODEL not set in .env');
    }

    rs.setConfig({ testTimeout: 30000 });

    const model = new Model({
      apiKey,
      baseURL,
      model: modelName,
    });

    const result = await model.invoke([
      { role: 'user', content: 'Hello, say hi in one word.' },
    ]);

    expect(result.role).toBe('assistant');
    expect(result.content).toBeTruthy();
  });
});
