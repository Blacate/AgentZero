export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export class Model {
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  async invoke(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<ChatMessage> {
    const response = await fetch(
      `${this.config.baseURL.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          tools,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Model API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{ message: ChatMessage }>;
    };

    return data.choices[0].message;
  }
}
