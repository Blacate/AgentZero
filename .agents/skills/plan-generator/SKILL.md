---
name: plan-generator
description: Generate structured technical planning documents for features, refactors, or architectural changes. Use before implementing any non-trivial task to align on scope and approach.
---

# Plan Generator

Use this skill when you need to create a technical planning document before implementing a feature, refactor, or architectural change.

## Output Location

Save planning documents to `docs/plans/`.

## File Naming Convention

Use the format:

```
YYYYMMDD-HHmmss-<brief-title>.md
```

- `YYYYMMDD` — date
- `HHmmss` — time
- `<brief-title>` — lowercase, hyphen-separated summary (2–4 words)

Example: `20250601-143052-add-retry-logic.md`

## Document Structure

### Chapter 1: Core Changes & Clarification

This chapter must be completed before moving to technical details.

1. **Core Changes Review**
   - Use a table to list the key files or modules to be added, modified, or removed
   - Include a "Review" column for the user to flag issues (e.g., `-` = no issue, `❓` = has question)
   - Summarize the expected behavioral change in 1–3 sentences below the table

2. **Clarification Questions**
   - Identify any ambiguous requirements, missing context, or trade-offs
   - Present options when multiple valid approaches exist
   - Use a table to present questions and options, with a "Review Status" column for tracking
   - Allow the user to select an option or provide a direct answer
   - **Do not proceed to Chapter 2 until all questions are resolved**

3. **需求演进与 Review 历史**
   - 记录用户的原始需求描述（可概括，保持原意）
   - 记录 review 阶段提出的、与 plan **技术内容**相关的问题（只记录问题，不记录回答）
   - 不包含文档格式要求、流程指令、skill 更新等元问题
   - 不包含与 plan 无关的对话内容
   - 目的：方便后续回顾 plan 技术方案的演进过程

### Chapter 2+: Detailed Technical Plan

**Strict rule: Do NOT write Chapter 2 until Chapter 1 is fully finalized.**

"Fully finalized" means:
- All items in the Core Changes Review table are marked `-` (no issue) or the raised concerns are resolved
- All Clarification Questions are answered and marked ✅ in the "Review Status" column
- The user has explicitly confirmed that Chapter 1 is complete

Only after the above conditions are met, proceed to write Chapter 2. Cover the topics relevant to your task (skip irrelevant ones):

1. **Design Overview** — high-level architecture or data flow
2. **File Changes** — specific files to create, modify, or delete
3. **Interface / API Design** — new or changed function signatures, types, or public APIs
4. **Implementation Steps** — ordered checklist of concrete tasks
5. **Testing Strategy** — what to test and how (if applicable)
6. **Risks & Mitigations** — known risks and how to handle them (optional for MVP)

## Guidelines

- **Language**: Write planning documents in Chinese by default
- Keep the plan concise and actionable
- Follow the MVP principle from AGENTS.md: avoid over-engineering, focus on the simplest viable version
- Use code blocks for proposed interfaces or pseudocode
- Mark resolved questions as ✅ in the "Review Status" column after the user responds
- **Never start writing Chapter 2 while any Chapter 1 item is still pending or unresolved**
