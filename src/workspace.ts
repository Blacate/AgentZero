/**
 * 构建工作区信息提示词，包含当前工作目录。
 * @returns 包裹为 <workspace> XML 标签的提示词字符串
 */
export function buildWorkspacePrompt(): string {
  const cwd = process.cwd();
  return `<workspace>\n  <cwd>${cwd}</cwd>\n</workspace>`;
}
