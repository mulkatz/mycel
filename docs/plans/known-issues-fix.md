# Plan: Known Issues Fix (Conversation Quality)

## Summary

Five fixes to address conversation quality issues that make interactions feel unnatural. The key architectural change is adding **intent detection** to the classifier, which enables the pipeline to route differently for greetings, "ask me something" requests, "I don't know" responses, and actual content. No new packages, no Firestore schema changes, no API changes.

## Diagnosis

### Current State
- Pipeline: linear chain `Classifier → Context Dispatcher → Gap Reasoning → Persona → Structuring`
- Classifier runs on every turn (topic change detection already works)
- No concept of user **intent** — everything is treated as content to classify

### Root Causes
1. **Completeness**: "hi" creates a Knowledge Entry as `_uncategorized` with suggestedCategoryLabel + topicKeywords + content → 3/3 = 100%. Categories with no `requiredFields` (e.g., `nature`) also default to 100%.
2. **No intent detection**: Greetings, meta-requests ("frag mich was"), and "I don't know" all flow through the same content pipeline.
3. **No "don't know" tracking**: Gap reasoning keeps suggesting the same gaps regardless of whether the user already said they don't know.
4. **Zod warnings**: The LLM sometimes produces `suggestedCategoryLabel`/`topicKeywords` for non-uncategorized results. The `invokeAndValidate` logs these as Zod validation warnings during retries.

---

## Architecture: Intent-Aware Pipeline

Add `intent` to the classifier output. Use LangGraph conditional edges to route:

```
START → classifier → router
  ├── intent=greeting    → persona → END
  ├── intent=proactive   → contextDispatcher → gapReasoning → persona → END
  └── intent=content     → contextDispatcher → gapReasoning → persona → structuring → END
      (also handles dont_know)
```

The `dont_know` intent uses the same `content` path but enriches the turn context with `skippedFields` so gap reasoning avoids repeating the same questions.

---

## Files to Modify

| File | Change |
|------|--------|
| `packages/core/src/agents/agent-output.schemas.ts` | Add `intent` to ClassifierResultSchema |
| `packages/shared/src/types/agent.types.ts` | Add `intent` to ClassifierOutput result type |
| `packages/shared/src/types/session.types.ts` | Add `skippedFields` to TurnContext |
| `packages/core/src/agents/classifier.ts` | Add intent detection logic to prompt |
| `packages/core/src/orchestration/pipeline.ts` | Conditional routing based on intent |
| `packages/core/src/orchestration/pipeline-state.ts` | No changes needed (structuringOutput is already optional) |
| `packages/core/src/agents/gap-reasoning.ts` | Handle `proactive` intent (domain-wide gaps); respect `skippedFields` |
| `packages/core/src/agents/persona.ts` | Handle `greeting` intent; improve `dont_know` response |
| `packages/core/src/agents/structuring.ts` | No changes (it simply won't run for greeting/proactive intents) |
| `packages/core/src/session/completeness.ts` | Fix scoring for categories with no required fields; handle null entry |
| `packages/core/src/session/session-manager.ts` | Build `skippedFields` in TurnContext; handle missing structuringOutput; no entry persistence for non-content intents |
| Test files | New tests for each issue + update existing tests |

---

## Issue 1: Completeness Score Unreliable

### 1a. Non-content input detection via intent

Add `intent` field to classifier output:

```typescript
// agent-output.schemas.ts
export const ClassifierResultSchema = z.object({
  categoryId: z.string(),
  subcategoryId: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  intent: z.enum(['content', 'greeting', 'proactive_request', 'dont_know']),
  isTopicChange: z.boolean().optional(),
  reasoning: z.string().optional(),
  summary: z.string().optional(),
  suggestedCategoryLabel: z.string().optional(),
});
```

The classifier prompt will include intent detection instructions:

```
Before classifying into a category, first determine the user's INTENT:
- "content": The user is sharing knowledge, information, or facts (classify normally)
- "greeting": The user is greeting or making small talk ("hi", "hallo", "hey", "guten Tag")
- "proactive_request": The user is asking YOU to ask THEM questions ("frag mich was", "ask me something", "was willst du wissen?", "was fehlt noch?", "worüber willst du reden?")
- "dont_know": The user is saying they don't know ("weiß ich nicht", "keine Ahnung", "I don't know", "no idea", "not sure") — only on follow-up turns responding to a question

For "greeting" and "proactive_request": set categoryId to "_meta", confidence to 1.0.
For "dont_know": keep the current category and set isTopicChange to false.
For "content": classify normally into existing categories.
```

**Intent `_meta`** is used for non-content classifications. This avoids polluting existing categories. It won't be validated against the category list (special-cased like `_uncategorized`).

### 1b. Pipeline skips structuring for non-content intents

When `intent` is `greeting` or `proactive_request`, the pipeline routes to persona directly (greeting) or through context+gap+persona (proactive), both skipping structuring. No Knowledge Entry is created.

### 1c. Fix completeness calculation

```typescript
// completeness.ts
export function calculateCompleteness(
  entry: KnowledgeEntry | undefined,
  domainConfig: DomainConfig,
): number {
  if (!entry) return 0;

  if (entry.categoryId === '_uncategorized') {
    // Uncategorized entries: base score is low (30%).
    // Having suggestedCategoryLabel and topicKeywords is the minimum, not completeness.
    const hasLabel = entry.structuredData['suggestedCategoryLabel'] !== undefined;
    const hasKeywords =
      Array.isArray(entry.structuredData['topicKeywords']) &&
      (entry.structuredData['topicKeywords'] as unknown[]).length > 0;
    const hasContent = entry.content.length > 0;
    const filled = [hasLabel, hasKeywords, hasContent].filter(Boolean).length;
    // Max 30% for uncategorized — we don't know what fields matter yet
    return (filled / 3) * 0.3;
  }

  const category = domainConfig.categories.find((c) => c.id === entry.categoryId);
  if (!category) return 0;

  const requiredFields = category.requiredFields ?? [];
  const optionalFields = category.optionalFields ?? [];

  if (requiredFields.length === 0 && optionalFields.length === 0) {
    // No schema fields at all — base on content richness
    // Has title + has content > 50 chars = 50%, otherwise 30%
    return entry.content.length > 50 ? 0.5 : 0.3;
  }

  if (requiredFields.length === 0) {
    // Only optional fields — use them but cap at 80% (never "complete" without required fields)
    const filledCount = optionalFields.filter(
      (field) =>
        entry.structuredData[field] !== undefined &&
        entry.structuredData[field] !== null &&
        entry.structuredData[field] !== '',
    ).length;
    return Math.min((filledCount / optionalFields.length) * 0.8, 0.8);
  }

  // Normal: required fields determine completeness
  const filledCount = requiredFields.filter(
    (field) =>
      entry.structuredData[field] !== undefined &&
      entry.structuredData[field] !== null &&
      entry.structuredData[field] !== '',
  ).length;
  return filledCount / requiredFields.length;
}
```

### 1d. Session manager handles missing entry

In `buildSessionResponse` and `persistKnowledgeEntry`, handle the case where `structuringOutput` is undefined (non-content intents):

```typescript
// buildSessionResponse: if no entry, completeness = 0, isComplete = false
// persistKnowledgeEntry: already handles missing entry (returns early)
// continueSession: only update session.currentEntry if entry exists
```

---

## Issue 2: "Ask Me Something" → Proactive Questions

### 2a. Classifier detects `intent: 'proactive_request'`

The prompt includes examples in both German and English:
- "frag mich was", "frag mich etwas"
- "ask me something", "ask me a question"
- "was willst du wissen?", "was fehlt noch?"
- "worüber willst du reden?"

### 2b. Gap Reasoning: proactive mode

When `intent === 'proactive_request'`, gap reasoning switches to domain-wide analysis:

```typescript
if (intent === 'proactive_request') {
  systemPrompt = `You are analyzing which knowledge areas need more coverage.

Available categories:
${categoryList}

## What Is Already Known
${contextSummary}

Based on what is already known (above), identify which categories have the LEAST coverage.
Generate 1-2 natural questions about the weakest areas. These should be conversational
and specific — not generic "tell me about X" but "Gibt es in der Gegend eigentlich
Vereine? Einen Sportverein oder eine Freiwillige Feuerwehr vielleicht?"

Rules:
- Focus on categories with ZERO or very few entries
- If all categories have coverage, ask about depth/details in the weakest one
- Questions should feel natural, like a curious local would ask
- Maximum 2 questions

Respond with JSON: { gaps, followUpQuestions, reasoning }`;
}
```

### 2c. Persona: proactive mode

The persona receives the proactive gaps and generates a natural response:

```
If the user asked you to ask them something ("frag mich was"):
- Pick ONE question from the gap analysis
- Frame it naturally and enthusiastically
- Reference what you already know if applicable ("Über die Kirche weiß ich schon einiges — aber gibt es hier auch Vereine?")
```

### 2d. Pipeline routing

For `proactive_request`: classifier → contextDispatcher → gapReasoning → persona → END (skip structuring).

---

## Issue 3: "I Don't Know" Handling

### 3a. Classifier detects `intent: 'dont_know'`

On follow-up turns, responses like "weiß ich nicht", "keine Ahnung", "no idea" get `intent: 'dont_know'` with `isTopicChange: false`.

### 3b. Track skipped fields in TurnContext

```typescript
// session.types.ts
export interface TurnContext {
  readonly turnNumber: number;
  readonly isFollowUp: boolean;
  readonly previousTurns: readonly TurnSummary[];
  readonly previousEntry?: KnowledgeEntry;
  readonly askedQuestions: readonly string[];
  readonly skippedFields: readonly string[];  // NEW: fields user said "don't know" to
}
```

In `session-manager.ts`, when building TurnContext:

```typescript
// Collect skipped fields: gaps from turns where intent was 'dont_know'
const skippedFields = collectSkippedFields(session);

function collectSkippedFields(session: Session): readonly string[] {
  const skipped: string[] = [];
  for (const turn of session.turns) {
    const intent = turn.pipelineResult.classifierOutput?.result.intent;
    if (intent === 'dont_know') {
      // The gaps from the PREVIOUS turn's gap-reasoning are what the user declined
      const turnIndex = session.turns.indexOf(turn);
      if (turnIndex > 0) {
        const prevTurn = session.turns[turnIndex - 1];
        const prevGaps = prevTurn.pipelineResult.gapReasoningOutput?.result.gaps ?? [];
        skipped.push(...prevGaps.map((g) => g.field));
      }
    }
  }
  return [...new Set(skipped)];
}
```

### 3c. Gap Reasoning: respect skipped fields

```typescript
// In gap-reasoning.ts, add to the prompt:
if (skippedFields.length > 0) {
  prompt += `\n\nThe user has already said they don't know about these topics — do NOT ask about them again:\n${skippedFields.map(f => `- ${f}`).join('\n')}\n\nInstead, ask about something completely different.`;
}
```

If all gaps for the current category are skipped, gap reasoning should suggest switching to a different category (similar to proactive mode).

### 3d. Persona: graceful "don't know" response

The persona prompt already has: "If the user says 'I don't know' — don't push. Gracefully move on."

Strengthen with intent awareness:

```
If the user's intent is "dont_know":
- Acknowledge warmly: "Kein Problem!" or "Macht nichts!"
- Do NOT ask another question about the same topic
- If there are gaps in a different category, ask about that instead
- If no other gaps: "Kein Problem! Fällt dir sonst noch was ein — vielleicht zu einem ganz anderen Thema?"
```

---

## Issue 4: Topic Change Detection (Already Implemented — Verify & Fix Edge Case)

Topic change detection is already implemented in the current codebase. The specific issue "topic change from lake back to church" suggests the session might incorrectly keep the old `classifierResult` even after detecting a topic change.

Looking at `session-manager.ts` lines 295-301, the current logic is:
```typescript
classifierResult: isTopicChange
  ? result.classifierOutput
  : (session.classifierResult ?? result.classifierOutput),
```

This looks correct. The issue might be an LLM classification problem rather than a code bug. Adding `intent` to the classifier will also improve topic change detection by providing more context.

**No additional code changes needed** — the existing implementation handles this correctly. Will verify in tests.

---

## Issue 5: Zod Validation Warnings

### Root cause

The LLM sometimes outputs `suggestedCategoryLabel` and summary fields even for non-uncategorized classifications. While these are `.optional()` in the Zod schema and pass validation, the LLM might also output fields NOT in the schema (like `topicKeywords` in classifier output), which triggers the Zod `safeParse` → strip → retry cycle logged as warnings in `invokeAndValidate.ts`.

### Fix

1. **Classifier prompt**: Explicitly state which fields to include per intent/category:
```
IMPORTANT: Only include "summary" and "suggestedCategoryLabel" when categoryId is "_uncategorized".
For all other categories, do NOT include these fields.
```

2. **Schema validation**: The `ClassifierResultSchema` already uses `z.object()` which strips unknown keys by default. The warnings come from Zod's own validation of known fields. Since `suggestedCategoryLabel` and `summary` are already `.optional()`, they won't cause errors — but the LLM producing them is wasteful. The prompt fix (above) should eliminate this.

3. **Session manager**: Stop defaulting `suggestedCategoryLabel` to `entry.categoryId` for non-uncategorized entries:
```typescript
// Before (always provides a value):
suggestedCategoryLabel: classifierResult?.suggestedCategoryLabel ?? entry.categoryId,

// After (only for uncategorized):
suggestedCategoryLabel: entry.categoryId === '_uncategorized'
  ? (classifierResult?.suggestedCategoryLabel ?? 'unknown')
  : undefined,
```

---

## Implementation Order

1. **Schema changes** — `agent-output.schemas.ts`, `agent.types.ts`, `session.types.ts`
2. **Classifier** — Add intent detection to prompt
3. **Pipeline routing** — Conditional edges based on intent
4. **Gap Reasoning** — Proactive mode + skippedFields
5. **Persona** — Intent-aware responses (greeting, proactive, dont_know)
6. **Completeness** — Fix scoring
7. **Session Manager** — Build skippedFields, handle missing entry, fix suggestedCategoryLabel
8. **Tests** — New tests for all issues + update existing tests
9. **Build/lint/typecheck verification**

---

## Test Plan

### New Tests

**`classifier.test.ts`:**
- `should detect greeting intent for "hi"/"hallo"/"hey"`
- `should detect proactive_request intent for "frag mich was"`
- `should detect dont_know intent for "weiß ich nicht" on follow-up`
- `should set categoryId to "_meta" for greeting intent`
- `should detect content intent for actual information`

**`completeness.test.ts`:**
- `should return 0 when entry is undefined`
- `should return low score (≤0.3) for _uncategorized entries`
- `should return 0.3-0.5 for categories with no required fields`
- `should return reasonable score for partial content (40-60% range)`
- `should return high score for rich content (80-90% range)`

**`gap-reasoning.test.ts`:**
- `should generate domain-wide gaps for proactive_request intent`
- `should exclude skippedFields from gap analysis`
- `should suggest different category when all current gaps are skipped`
- `should return empty gaps for greeting intent`

**`persona.test.ts`:**
- `should generate simple greeting for greeting intent`
- `should generate proactive question for proactive_request intent`
- `should acknowledge gracefully for dont_know intent`

**`pipeline.test.ts`:**
- `should skip structuring for greeting intent`
- `should skip structuring for proactive_request intent`
- `should run full pipeline for content intent`

**`session-manager.test.ts`:**
- `should not create Knowledge Entry for "hi"`
- `should not persist entry for greeting intent`
- `should build skippedFields from previous dont_know turns`
- `should return completenessScore 0 for non-content turns`

### Updated Tests

- Completeness tests: update expected values for categories without required fields (1.0 → 0.3-0.5)
- Pipeline tests: update LLM call count expectations (greeting path = 2 calls: classifier + persona)
- Session manager mock LLM: add intent field to all classifier mock responses

---

## What This Does NOT Change

- Agent pipeline structure (still same 5 agents, but now with conditional routing)
- Firestore collection design
- Repository interfaces
- API endpoints or request/response contracts
- Terraform or deployment
- No new packages or dependencies
- No new agents (intent detection is in the classifier, not a separate agent)

---

## Risk Assessment

- **LangGraph conditional edges**: Well-documented feature, low risk. The existing linear chain becomes a DAG.
- **Intent detection accuracy**: Depends on LLM quality. Clear prompt examples mitigate this. The classifier already handles complex logic (topic change), adding intent is incremental.
- **Backward compatibility**: `SessionResponse.entry` is already optional (`entry?: KnowledgeEntry`). Consumers that check for `entry` before using it will work. The `completenessScore` changing values is a behavior change — but the old values were wrong.
- **Test changes**: Existing tests need `intent: 'content'` in mock classifier responses. This is mechanical and low risk.
