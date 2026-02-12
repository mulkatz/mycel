# Plan: Integrate Adaptive Schema Evolution (ADR-004)

## Context

The agent pipeline currently treats the domain schema as a rigid checklist: the Classifier forces every input into a known category, Gap-Reasoning asks about every missing schema field, and the Structuring agent throws on unknown categories. This task brings the pipeline in line with ADR-004's philosophy of "curious, adaptive conversation partner."

## What Changes

### 1. ClassifierOutput type — add `summary` field

**Modify**: `packages/shared/src/types/agent.types.ts`

Add an optional `summary` field to `ClassifierOutput.result`. When input is classified as `_uncategorized`, the Classifier still extracts a short summary of what the input is about.

```typescript
readonly result: {
  readonly categoryId: string;
  readonly subcategoryId?: string;
  readonly confidence: number;
  readonly summary?: string;  // NEW: short summary for _uncategorized entries
};
```

### 2. ClassifierResultSchema — add `summary`, accept `_uncategorized`

**Modify**: `packages/core/src/agents/agent-output.schemas.ts`

Add optional `summary` string field to `ClassifierResultSchema`.

### 3. Classifier Agent — `_uncategorized` fallback

**Modify**: `packages/core/src/agents/classifier.ts`

- Update prompt: instruct model that if no category matches with high confidence, classify as `_uncategorized`. Emphasize honesty over forcing a fit.
- Accept `_uncategorized` as a valid categoryId — skip the `categoryIds.includes` check for it.
- Include `result.summary` in the output when present.

### 4. Gap-Reasoning Agent — adaptive questioning

**Modify**: `packages/core/src/agents/gap-reasoning.ts`

This is the most important change. Two modes:

**Categorized input** (existing category found):
- Use schema fields as guidance, but rank questions by likelihood user can answer them.
- If input is rich and detailed, return fewer or zero gaps.
- Limit `followUpQuestions` to max 3.

**Uncategorized input** (`_uncategorized`):
- Skip category lookup entirely — no `throw AgentError('Unknown category')`.
- Don't reference schema fields; instead generate exploratory questions to understand the topic.
- Prompt guides LLM to ask about what the user seems to know based on their input.

### 5. Persona Agent — conversational warmth

**Modify**: `packages/core/src/agents/persona.ts`

- When passing gaps to the prompt, take only the top 3 (highest priority first, then by order).
- When passing followUpQuestions, take only the first 3.
- Update prompt: if there are no gaps, generate a warm closing message rather than forcing questions.
- Response must reflect back what the system learned — make user feel heard.

### 6. Structuring Agent — handle `_uncategorized` and sparse data

**Modify**: `packages/core/src/agents/structuring.ts`

- For `_uncategorized` categoryId: skip category lookup, don't reference required/optional fields, instruct LLM to store the entry with whatever structure it can extract.
- For categorized entries: behavior unchanged.
- Completeness: for `_uncategorized`, base on whether summary + content exist, not on schema fields.

### 7. Mock LLM client — handle `_uncategorized` flow

**Modify**: `packages/core/src/llm/llm-client.ts`

Add mock response branch for `_uncategorized` classifier output (triggered when input doesn't match known mock patterns). Update gap-reasoning, persona, and structuring mock branches to handle `_uncategorized` in follow-up prompts.

### 8. Tests

**Modify**: `packages/core/src/agents/classifier.test.ts`
- Input that doesn't match any category → `_uncategorized` with confidence < 0.6 and a summary
- Input that matches well → normal classification (regression)
- `_uncategorized` is not rejected by categoryId validation

**Modify**: `packages/core/src/agents/gap-reasoning.test.ts`
- `_uncategorized` input → exploratory questions, no throw
- Rich detailed input → few or zero gaps (via mock LLM)

**Modify**: `packages/core/src/agents/persona.test.ts`
- More than 3 gaps from reasoning → only top 3 in prompt
- Zero gaps → response still generated (warm closing)

**Modify**: `packages/core/src/agents/structuring.test.ts`
- `_uncategorized` entry → valid KnowledgeEntry, no throw

**Modify**: `packages/core/src/orchestration/pipeline.test.ts`
- Full pipeline with `_uncategorized` input flows without errors

## Files Changed

| File | Action |
|------|--------|
| `packages/shared/src/types/agent.types.ts` | Modify — add `summary` to ClassifierOutput |
| `packages/core/src/agents/agent-output.schemas.ts` | Modify — add `summary` to ClassifierResultSchema |
| `packages/core/src/agents/classifier.ts` | Modify — `_uncategorized` fallback, prompt update |
| `packages/core/src/agents/gap-reasoning.ts` | Modify — adaptive questioning, handle `_uncategorized` |
| `packages/core/src/agents/persona.ts` | Modify — top 3 questions, warm closing |
| `packages/core/src/agents/structuring.ts` | Modify — handle `_uncategorized`, sparse data |
| `packages/core/src/llm/llm-client.ts` | Modify — mock responses for `_uncategorized` |
| `packages/core/src/agents/classifier.test.ts` | Modify — add tests |
| `packages/core/src/agents/gap-reasoning.test.ts` | Modify — add tests |
| `packages/core/src/agents/persona.test.ts` | Modify — add tests |
| `packages/core/src/agents/structuring.test.ts` | Modify — add tests |
| `packages/core/src/orchestration/pipeline.test.ts` | Modify — add test |

0 new files, 12 modified files. No new dependencies.

## Verification

```bash
npm run build
npm run typecheck
npm run lint
npm run test
```
