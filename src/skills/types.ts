export interface SkillInfo {
  /** skill 名，frontmatter name 缺失时以目录名兜底 */
  name: string;
  /** frontmatter description（缺此字段的 skill 被跳过） */
  description: string;
  /** SKILL.md 的绝对路径 */
  path: string;
}
