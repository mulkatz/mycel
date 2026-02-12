# ADR-009: Conversation Quality — Intent-Aware Pipeline

## Status

Accepted

## Date

2026-02-12

## Context

The initial multi-agent pipeline (ADR-003) processed every user input through the same linear chain: Classifier, Context Dispatcher, Gap Reasoning, Persona, Structuring. This treated all input as knowledge content, leading to several quality problems:

1. **Greetings create knowledge entries**: Saying "hi" got classified as `_uncategorized` and produced a Knowledge Entry with 100% completeness, polluting the knowledge base.
2. **No proactive questioning**: When a user said "ask me something" or "was fehlt noch?", the system had no way to switch from reactive (respond to input) to proactive (identify domain gaps and ask about them).
3. **Broken "I don't know" handling**: The system kept asking about the same gaps even after the user said they couldn't answer, creating an interrogation-like experience.
4. **Unnatural responses**: The Persona echoed back what the user said ("Die Kirche wurde also 1732 erbaut..."), asked multiple questions at once, and opened with formulaic acknowledgments ("Vielen Dank!").

These are not individual bugs but symptoms of a missing concept: the pipeline had no notion of user **intent**. Every input was assumed to be content.

## Decision

### Intent Detection in the Classifier

The Classifier agent gains an `intent` field in its output, with four possible values:

- **`content`**: The user is sharing knowledge or information (existing behavior)
- **`greeting`**: The user is greeting or making small talk ("hi", "hallo")
- **`proactive_request`**: The user is asking the system to ask them questions ("frag mich was", "was fehlt noch?")
- **`dont_know`**: The user is saying they can't answer ("weiß ich nicht", "keine Ahnung")

Intent detection happens in the same Classifier agent (not a separate agent) because it's a classification task that benefits from the same context the Classifier already has (domain schema, session history, category list).

Alternative considered: a dedicated Intent Agent before the Classifier. Rejected because it would add latency (another LLM call) and the Classifier's prompt already analyzes the input — adding intent detection is incremental, not a separate concern.

### Conditional Pipeline Routing

The LangGraph pipeline switches from a linear chain to a DAG with conditional edges based on intent:

```
START → Classifier → Router
  ├── greeting         → Persona → END
  ├── proactive_request → Context Dispatcher → Gap Reasoning → Persona → END
  └── content/dont_know → Context Dispatcher → Gap Reasoning → Persona → Structuring → END
```

Key routing decisions:
- **Greetings skip everything except Persona**: No context retrieval, no gap analysis, no structuring. The Persona generates a simple, warm response. No Knowledge Entry is created.
- **Proactive requests skip Structuring**: The system retrieves context (what's already known), analyzes domain-wide gaps, and generates a question — but doesn't try to structure the user's "frag mich was" as knowledge.
- **"Don't know" follows the content path** but enriches the turn context with `skippedFields` so Gap Reasoning avoids repeating questions the user already declined.

### Topic Change Detection

The Classifier runs on every turn (not skipped for follow-ups). It detects `isTopicChange` by comparing the user's input against the current active category. When a topic change is detected:
1. The current Knowledge Entry is finalized and persisted as-is
2. A new entry begins for the new topic
3. The session's `classifierResult` is updated

This ensures the pipeline always has fresh classification, even mid-conversation.

### Persona Design: Conversational, Not Formulaic

The Persona prompt was rewritten with explicit anti-patterns:
- Never echo back what the user just said
- Never start with "Vielen Dank!" or generic acknowledgments
- Ask at most one follow-up question, woven naturally into the response
- Keep responses to 1-3 sentences
- Show genuine curiosity, not interview-style questioning
- Graceful "don't know" handling: acknowledge and move on, never push

The persona behaves like a "knowledgeable local" having a real conversation, not a form-filling assistant.

### "Don't Know" Tracking via Skipped Fields

When the user says they don't know, the system tracks which gap fields were being asked about (derived from the previous turn's Gap Reasoning output). These `skippedFields` are passed to subsequent Gap Reasoning calls, which are instructed to never ask about them again.

If all gaps for the current category are skipped, Gap Reasoning suggests switching to a different topic entirely.

### Completeness Score Overhaul

The completeness calculation was fixed to prevent inflated scores:
- `_uncategorized` entries cap at 30% (they have no schema to be "complete" against)
- Categories with no `requiredFields` cap at 50-80% based on content richness
- `undefined` entries return 0% (previously crashed or returned misleading values)
- Completeness is advisory — it never auto-closes a session

## Consequences

### Positive

- Conversations feel natural — greetings get greetings, questions get questions, knowledge gets structured
- No more knowledge pollution from non-content inputs
- Proactive questioning makes the system useful even when the user doesn't know what to share
- "Don't know" tracking prevents frustrating repetition
- Completeness scores reflect actual knowledge quality, not incidental field presence
- Same 5 agents, same Firestore schema, same API contract — minimal blast radius

### Negative

- Conditional routing adds complexity to the pipeline graph (harder to visualize than a linear chain)
- Intent detection depends on LLM quality — ambiguous inputs may be misclassified (e.g., is "the church" a greeting or content?)
- `skippedFields` tracking adds state that accumulates across turns, increasing context size
- The Persona prompt is more prescriptive, which may reduce response variety
- Every turn now runs the full Classifier (no more short-circuit on follow-ups), adding ~1 second of latency per turn
