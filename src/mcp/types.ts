/** stdio MCP server 配置 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** tools/list 返回的单个工具信息 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** tools/call 返回的单条 content */
export interface McpCallContent {
  type: string;
  text?: string;
}

/** tools/call 返回结果 */
export interface McpCallResult {
  content: McpCallContent[];
  isError?: boolean;
}
