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
   - List the key files or modules to be added, modified, or removed
   - Summarize the expected behavioral change in 1–3 sentences

2. **Clarification Questions**
   - Identify any ambiguous requirements, missing context, or trade-offs
   - Present options when multiple valid approaches exist
   - Allow the user to select an option or provide a direct answer
   - Do not proceed to Chapter 2 until all questions are resolved

### Chapter 2+: Detailed Technical Plan

Write only after Chapter 1 is finalized. Cover the topics relevant to your task (skip irrelevant ones):

1. **Design Overview** — high-level architecture or data flow
2. **File Changes** — specific files to create, modify, or delete
3. **Interface / API Design** — new or changed function signatures, types, or public APIs
4. **Implementation Steps** — ordered checklist of concrete tasks
5. **Testing Strategy** — what to test and how (if applicable)
6. **Risks & Mitigations** — known risks and how to handle them (optional for MVP)

## Guidelines

- Keep the plan concise and actionable
- Follow the MVP principle from AGENTS.md: avoid over-engineering, focus on the simplest viable version
- Use code blocks for proposed interfaces or pseudocode
- Mark resolved questions as ✅ in Chapter 1 after the user responds
