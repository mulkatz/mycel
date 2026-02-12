# Plan: Conversation Quality Fix

## Summary

Three behavioral fixes to make conversations feel natural instead of like a form, plus three small housekeeping fixes. No architectural changes — same agent pipeline, same Firestore collections, same repository interfaces.

## Files to Modify

| File | Change |
|------|--------|
| `packages/core/src/agents/agent-output.schemas.ts` | Add `isTopicChange` to ClassifierResultSchema |
| `packages/shared/src/types/agent.types.ts` | Add `isTopicChange` to ClassifierOutput result type |
| `packages/core/src/agents/classifier.ts` | Always run classifier (remove follow-up skip); add session context to prompt for topic-change detection |
| `packages/core/src/orchestration/pipeline-state.ts` | Add `activeCategory` field to state (for classifier context) |
| `packages/core/src/orchestration/pipeline.ts` | Pass `activeCategory` into initial state |
| `packages/core/src/session/session-manager.ts` | Remove maxTurns hard limit; make autoComplete advisory; handle topic changes (finalize old entry, start new entry); stop passing saved classifierOutput to pipeline |
| `packages/core/src/agents/persona.ts` | Rewrite prompt for natural, conversational responses (max 1 follow-up question, no echo, no "Vielen Dank") |
| `packages/core/src/agents/gap-reasoning.ts` | Reduce MAX_FOLLOW_UP_QUESTIONS from 3 to 1 (persona only uses 1 anyway) |
| `packages/core/src/llm/llm-client.ts` | Read `MYCEL_GCP_PROJECT_ID` with `GCP_PROJECT_ID` fallback |
| `packages/core/src/llm/llm-client.ts` (mock) | Update mock classifier to return `isTopicChange` field; update mock persona to return natural responses |
| `infra/terraform/environments/dev/main.tf` | Add `aiplatform.googleapis.com` to required_apis |
| `scripts/run-session.ts` | Remove `while (!response.isComplete)` loop condition; use indefinite loop ending only on "done"/ctrl+C; remove auto-complete break |
| Test files (see below) | Update tests to match new behavior |

## Fix 1: Topic Change Detection

### 1a. Schema changes

**`agent-output.schemas.ts`** — Add `isTopicChange` to ClassifierResultSchema:
```typescript
export const ClassifierResultSchema = z.object({
  categoryId: z.string(),
  subcategoryId: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  isTopicChange: z.boolean().optional(),  // NEW
  reasoning: z.string().optional(),
  summary: z.string().optional(),
  suggestedCategoryLabel: z.string().optional(),
});
```

**`agent.types.ts`** — Add `isTopicChange` to ClassifierOutput result:
```typescript
export interface ClassifierOutput extends AgentOutput {
  readonly result: {
    readonly categoryId: string;
    readonly subcategoryId?: string | null;
    readonly confidence: number;
    readonly isTopicChange?: boolean;  // NEW
    readonly summary?: string;
    readonly suggestedCategoryLabel?: string;
  };
}
```

**`pipeline-state.ts`** — Add `activeCategory` to graph state:
```typescript
export const PipelineGraphAnnotation = Annotation.Root({
  // ... existing fields ...
  activeCategory: Annotation<string | undefined>,  // NEW: current topic for topic-change detection
});
```

### 1b. Classifier always runs

**`classifier.ts`** — Remove the follow-up early return. Instead, when it's a follow-up turn, add session context to the prompt:

```typescript
// REMOVE this block:
// if (state.turnContext?.isFollowUp && state.classifierOutput) {
//   log.info(..., 'Follow-up turn: reusing existing classification');
//   return {};
// }

// ADD context about current topic for follow-up turns:
let topicChangeContext = '';
if (state.turnContext?.isFollowUp && state.activeCategory) {
  const lastQuestion = state.turnContext.askedQuestions.at(-1) ?? '';
  topicChangeContext = `
[SESSION_CONTEXT]
The user is currently in a conversation about "${state.activeCategory}".
${lastQuestion ? `The last question asked was: "${lastQuestion}"` : ''}

IMPORTANT: Determine if the user is:
a) Responding to the current topic (even if saying "I don't know") → isTopicChange: false
b) Introducing a completely new subject → isTopicChange: true

A response like "I don't know" or "no" is NOT a topic change. Only set isTopicChange to true if the user is clearly talking about something different.
`;
}
```

Add `isTopicChange` to the prompt's expected JSON output description. Pass `activeCategory` from `state.activeCategory`.

### 1c. Session manager handles topic changes

**`session-manager.ts`** — In `continueSession()`:

1. **Remove the maxTurns hard check** (lines 175-179). Remove the throw entirely.
2. **Stop passing saved `classifierOutput`** into `pipeline.run()`. Instead, pass `activeCategory`:
   ```typescript
   const result = await pipeline.run(agentInput, {
     turnContext,
     activeCategory: session.classifierResult?.result.categoryId,
   });
   ```
3. **After pipeline.run()**, check for topic change:
   ```typescript
   const isTopicChange = result.classifierOutput?.result.isTopicChange === true;
   if (isTopicChange) {
     log.info({
       sessionId,
       oldCategory: session.classifierResult?.result.categoryId,
       newCategory: result.classifierOutput?.result.categoryId,
     }, 'Topic change detected');

     // Persist the old entry as-is before switching
     if (session.currentEntry) {
       await persistKnowledgeEntry(knowledgeRepo, ..., 'finalized by topic change');
     }
   }
   ```
4. **Update session** with new `classifierResult` when topic changes:
   ```typescript
   await sessionRepo.update(sessionId, {
     status: 'active',  // never auto-complete
     currentEntry: isTopicChange ? entry : (entry ?? session.currentEntry),
     ...(isTopicChange ? { classifierResult: result.classifierOutput } : {}),
   });
   ```

### 1d. Pipeline run options

**`pipeline.ts`** — Update `PipelineRunOptions` to accept `activeCategory` instead of `classifierOutput`:
```typescript
export interface PipelineRunOptions {
  readonly turnContext?: TurnContext;
  readonly activeCategory?: string;  // REPLACES classifierOutput
}
```

And pass it into the graph:
```typescript
const result = await graph.invoke({
  // ... existing ...
  classifierOutput: undefined,  // always run classifier
  activeCategory: options?.activeCategory,
});
```

## Fix 2: Natural Persona Response

### 2a. Persona prompt rewrite

**`persona.ts`** — Complete rewrite of the system prompt. Key changes:

1. **Remove** "Reflects back what you learned" instruction
2. **Remove** the multi-question instruction
3. **Change** MAX_GAPS_TO_PRESENT from 3 to 1 (only present the single most important gap)
4. **New prompt instructions**:

```
Generate a SHORT, natural conversational response (1-3 sentences max). You are having a real conversation, not conducting an interview.

Rules:
- NEVER start with "Vielen Dank für diese Information!" or similar generic acknowledgments
- NEVER repeat back what the user just said ("Die Kirche wurde also 1732 erbaut...")
- NEVER list multiple questions — ask AT MOST ONE follow-up question, woven naturally into your response
- Keep it SHORT — 1-3 sentences. Brevity shows you're listening, not performing.
- Show genuine curiosity — react like a real person would ("Oh, Barock! Das sieht man hier selten...")
- If the user says "I don't know" or similar — don't push. Gracefully move on: "Kein Problem! Was fällt dir sonst noch ein?"
- Use the persona's configured tone but prioritize naturalness over role-playing

The "followUpQuestions" array is for the UI to show as suggestions. Put 0-1 questions there.
The "response" text should feel like something a person would say in conversation.
```

5. **Still pass gap info** to the prompt so the Persona knows what's missing, but instruct it to only pick the most natural/interesting one to ask about.

### 2b. Gap-Reasoning stays mostly unchanged

The Gap-Reasoning agent keeps generating multiple gaps (it's analyzing the knowledge structure). But the Persona only uses the top 1. No changes to gap-reasoning.ts needed beyond what the persona selects.

Actually — reduce `MAX_FOLLOW_UP_QUESTIONS` in `gap-reasoning.ts` from 3 to 2. Gap-Reasoning should still identify multiple gaps but limit the question suggestions. The Persona will further reduce to 1.

## Fix 3: Flexible Session End

### 3a. Session manager changes

**`session-manager.ts`**:

1. **Remove maxTurns enforcement** — delete the `turnNumber > maxTurns` throw block entirely.
2. **autoCompleteThreshold becomes advisory** — don't set `status: 'complete'` when threshold is reached. Instead, keep `status: 'active'` always (during continueSession). The completeness score is still calculated and returned (it's useful info), but it doesn't change session status.
3. **startSession** — same change: don't auto-set status to 'complete'.
4. **SessionResponse.isComplete** — keep returning it as a signal, but rename its meaning: it indicates "knowledge entry is complete" not "session is over". The session never auto-closes.

### 3b. Run-session script changes

**`scripts/run-session.ts`**:

1. Change the while loop from `while (!response.isComplete)` to `while (true)` (or `for (;;)`)
2. Remove the `if (followUp.isComplete) break;` inside the loop
3. When `isComplete` is true, show a message like "Knowledge entry looks complete!" but don't break — continue the loop
4. Only break on "done"/"fertig"/"tschüss" or Ctrl+C
5. Add "fertig" and "tschüss" as exit keywords alongside "done"

## Fix 4: Env Variable Standardization

**`packages/core/src/llm/llm-client.ts`** — In `createVertexClient()`:

```typescript
const projectId = process.env['MYCEL_GCP_PROJECT_ID'] ?? process.env['GCP_PROJECT_ID'];
// ...
if (!projectId) {
  throw new ConfigurationError(
    'MYCEL_GCP_PROJECT_ID environment variable is required for Vertex AI LLM client',
  );
}
```

## Fix 5: .gitignore

`.idea/` is already in `.gitignore` — no change needed.

## Fix 6: Terraform API

**`infra/terraform/environments/dev/main.tf`** — Add to required_apis:
```hcl
required_apis = [
  "firestore.googleapis.com",
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "iam.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "aiplatform.googleapis.com",
]
```

## Test Updates

### `classifier.test.ts`
- Remove or update the test "should reuse classification on follow-up" (this behavior is removed)
- Add test: "should detect topic change when user changes subject"
- Add test: "should not detect topic change for 'I don't know' responses"
- Add test: "should classify on every turn including follow-ups"
- Add test: "should include session context in prompt for follow-up turns"

### `session-manager.test.ts`
- **Remove** "should enforce max turns" test (maxTurns no longer enforced)
- **Update** "should reuse turn-1 classification on follow-up" — classifier now runs every turn, update assertion
- **Update** "should auto-complete when threshold is reached" — session status stays 'active', completenessScore still 1.0, but `isComplete` is advisory
- **Add** test: "should handle topic change and create new entry"
- **Add** test: "should allow more turns than maxTurns without error"

### `persona.test.ts`
- **Update** "should generate warm closing when no gaps exist" — prompt text changed
- **Update** prompt content assertions to match new prompt structure
- Existing tests for gap truncation still valid but numbers change (1 instead of 3)

### `pipeline.test.ts`
- Update to reflect new `PipelineRunOptions` (activeCategory instead of classifierOutput)

### Mock LLM client
- Update mock classifier to include `isTopicChange: false` in default responses
- Add mock branch for topic-change scenarios (detect "lake"/"See" → different category)
- Update mock persona to return short, natural responses

## Implementation Order

1. Schema changes (agent-output.schemas.ts, agent.types.ts, pipeline-state.ts) — foundation
2. Classifier changes (classifier.ts) — always run, topic-change detection
3. Pipeline changes (pipeline.ts, PipelineRunOptions) — pass activeCategory
4. Session manager changes (session-manager.ts) — topic change handling, remove maxTurns, advisory autoComplete
5. Persona prompt rewrite (persona.ts) — natural responses
6. Gap-reasoning tweak (gap-reasoning.ts) — reduce max questions
7. LLM client env var fix (llm-client.ts)
8. Mock LLM updates (llm-client.ts mock section)
9. Terraform API (main.tf)
10. Run-session script (run-session.ts)
11. Test updates (all test files)
12. Build + lint + typecheck + test verification

## What This Does NOT Change

- Agent pipeline order (Classifier → Context → Gap → Persona → Structuring)
- Firestore collection design
- Repository interfaces
- Ingestion layer
- No new agents added
- No dynamic schema creation
