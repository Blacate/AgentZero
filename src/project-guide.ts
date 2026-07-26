import { readFileSync } from 'node:fs';

/**
 * 读取项目指南文件并包裹为 <project_guide> XML 标签。
 * @param path 文件路径（建议已 resolve 为绝对路径）
 * @returns 包裹后的提示词字符串；文件不存在或为空时返回 ''
 */
export function buildProjectGuidePrompt(path: string): string {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return '';
  }

  const content = raw.trim();
  if (!content) return '';

  return `<project_guide>\n${content}\n</project_guide>`;
}
