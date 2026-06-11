import type { ChatMessage } from '../model.js';

export interface UserPromptSubmitContext {
  userMessage: string;
  systemPrompt?: string;
  messages: ChatMessage[];
}

export interface PreToolUseContext {
  userMessage: string;
  toolName: string;
  args: Record<string, unknown>;
  toolCallId: string;
  messages: ChatMessage[];
}

export interface PostToolUseContext {
  userMessage: string;
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  toolCallId: string;
  messages: ChatMessage[];
}

export interface PostToolUseFailureContext {
  userMessage: string;
  toolName: string;
  args: Record<string, unknown>;
  error: Error;
  toolCallId: string;
  messages: ChatMessage[];
}

export interface StopContext {
  userMessage: string;
  result: string;
  messages: ChatMessage[];
}
