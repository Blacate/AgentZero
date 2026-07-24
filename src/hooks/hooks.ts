import type {
  PostToolUseContext,
  PostToolUseFailureContext,
  PreToolUseContext,
  StopContext,
  UserPromptSubmitContext,
} from './context.js';
import type { HookResult } from './result.js';

export interface AgentLoopHooks {
  userPromptSubmit?(
    ctx: UserPromptSubmitContext,
  ): Promise<HookResult<UserPromptSubmitContext>>;
  preToolUse?(ctx: PreToolUseContext): Promise<HookResult<PreToolUseContext>>;
  postToolUse?(
    ctx: PostToolUseContext,
  ): Promise<HookResult<PostToolUseContext>>;
  postToolUseFailure?(
    ctx: PostToolUseFailureContext,
  ): Promise<HookResult<PostToolUseFailureContext>>;
  stop?(ctx: StopContext): Promise<HookResult<StopContext>>;
}
