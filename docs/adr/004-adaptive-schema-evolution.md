# ADR-004: Adaptive Schema Evolution

## Status

Accepted

## Date

2025-02-11

## Context

The original design treats the Domain Schema as a static configuration: an admin defines categories and fields upfront, and the system asks questions to fill those fields. This creates two problems:

1. **Rigidity**: Users may share valuable knowledge that doesn't fit any predefined category or field. A static schema forces the system to ignore or misclassify this input, losing exactly the kind of organic, unexpected knowledge that makes Mycel valuable.

2. **Admin burden**: Someone has to design the schema upfront, which requires knowing what knowledge exists before collecting it – a chicken-and-egg problem. The whole point of Mycel is that we *don't* know what's out there.

The desired behavior is:
- The system starts with a minimal or even empty schema
- As users contribute knowledge, the system identifies emerging patterns and proposes new categories and fields
- The schema grows organically based on actual input, not assumptions
- The system adapts its questioning strategy based on what it learns about each user's expertise – it pushes on topics where the user seems knowledgeable, and backs off gracefully on topics where they don't have answers

## Decision

Mycel's Domain Schema becomes a **living document** that evolves through three mechanisms:

### 1. Open Knowledge Capture

The system always accepts free-form input, even if it doesn't match any existing category. Unstructured contributions are stored as raw knowledge entries and periodically analyzed for patterns.

- Every input is valuable, whether it fits the schema or not
- The Classifier Agent gets a fallback: if no category matches with sufficient confidence, classify as `_uncategorized` rather than forcing a bad fit
- Uncategorized entries accumulate and become candidates for new categories

### 2. Schema Suggestion Agent (new agent)

A new agent (or periodic batch process) analyzes accumulated knowledge and proposes schema modifications:

- **New categories**: "You've received 12 entries about local recipes – should 'Culinary Heritage' become a category?"
- **New fields**: "Multiple history entries mention specific people – should 'relatedPersons' become a standard field for the History category?"
- **Field retirement**: "The field 'constructionMaterial' has been asked 40 times and answered 3 times – consider making it optional or removing it"

Schema changes are always *proposed*, never auto-applied. An admin (or the system owner) approves or rejects suggestions.

### 3. Adaptive Questioning Strategy

The Gap-Reasoning and Persona agents adapt their behavior based on signals:

- **User expertise detection**: If a user confidently provides detailed historical dates and sources, push deeper on history. If they struggle with "what year was this?", pivot to what they *do* know ("can you describe what it looked like?").
- **Field difficulty tracking**: Track per-field answer rates across sessions. If a field is rarely answered (e.g. "original architect"), lower its priority in follow-up questions. Don't remove it – just ask less aggressively.
- **Conversational flow**: If a user is telling a story, don't interrupt with structured questions. Let them finish, extract what you can, then ask about gaps naturally.
- **Never dead-end**: If the user can't answer a question, acknowledge it gracefully and move on. Never make the user feel like they've failed.

## Schema Lifecycle

```
Phase 1: Seed Schema (minimal, maybe just 2-3 broad categories)
    │
    ▼
Phase 2: Knowledge Accumulation (system collects, classifies, stores)
    │
    ▼
Phase 3: Pattern Detection (system notices clusters in uncategorized entries)
    │
    ▼
Phase 4: Schema Proposal (system suggests new categories/fields)
    │
    ▼
Phase 5: Admin Review (human approves/rejects/modifies proposals)
    │
    ▼
Phase 6: Schema Evolution (approved changes become part of the schema)
    │
    └──→ Back to Phase 2 (continuous cycle)
```

## Impact on Existing Architecture

### Domain Schema Changes

The Domain Schema needs new fields:

```typescript
// Categories can be system-generated
interface Category {
  id: string;
  label: string;
  description: string;
  origin: 'seed' | 'discovered';        // Was this predefined or emerged from data?
  requiredFields: FieldDefinition[];
  optionalFields: FieldDefinition[];
}

// Fields track their own effectiveness
interface FieldDefinition {
  id: string;
  label: string;
  type: string;
  priority: 'high' | 'medium' | 'low';  // Influences questioning aggressiveness
  stats?: {
    timesAsked: number;
    timesAnswered: number;
    answerRate: number;                  // timesAnswered / timesAsked
  };
}

// Schema tracks proposals
interface DomainSchema {
  // ... existing fields ...
  schemaEvolution?: {
    allowUncategorized: boolean;          // Default: true
    proposalThreshold: number;           // Min entries before suggesting new category
    fieldRetirementThreshold: number;    // Answer rate below which field priority drops
  };
}
```

### Pipeline Changes

- **Classifier Agent**: Add `_uncategorized` fallback with low confidence threshold
- **Gap-Reasoning Agent**: Consider field priority and answer rates when generating questions. High-priority unanswered fields get asked. Low-priority fields with bad answer rates get skipped unless the user seems knowledgeable.
- **Persona Agent**: Adapt questioning intensity. Enthusiastic user → ask more. Struggling user → ask less, encourage storytelling instead.
- **New: Schema Suggestion Agent**: Periodic analysis of uncategorized entries and field statistics. Outputs schema modification proposals.

### New Data Structures

```typescript
// Track field effectiveness across sessions
interface FieldStats {
  fieldId: string;
  categoryId: string;
  timesAsked: number;
  timesAnswered: number;
  lastAsked: string;
  lastAnswered: string;
}

// Schema modification proposals
interface SchemaProposal {
  id: string;
  type: 'new_category' | 'new_field' | 'retire_field' | 'change_priority';
  description: string;
  evidence: string[];          // Entry IDs that support this proposal
  confidence: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}
```

## Consequences

### Positive
- The system becomes truly adaptive – it learns what matters from real usage
- No upfront schema design burden – start with almost nothing
- Knowledge that doesn't fit is captured, not lost
- Questioning becomes smarter over time based on actual answer patterns
- Users feel heard, not interrogated

### Negative
- More complex agent logic, especially in Gap-Reasoning
- Schema versioning becomes important (what version was active when an entry was created?)
- The Schema Suggestion Agent needs enough data to make good proposals – cold start problem
- Admin review step could become a bottleneck if proposals pile up

### Risks
- Without guardrails, the schema could grow endlessly with very niche categories
- The system might propose redundant or overlapping categories
- Field statistics could be biased by a small number of users

## Implementation Priority

This does NOT need to be built all at once. The implementation can be phased:

1. **Now**: Add `_uncategorized` fallback to Classifier. Accept and store all input regardless of schema fit. This is a small change with high value.
2. **With Persistence**: Start tracking field statistics (timesAsked, timesAnswered).
3. **With RAG**: Use accumulated entries to detect patterns in uncategorized knowledge.
4. **Later**: Build the Schema Suggestion Agent and admin review flow.
5. **Later**: Implement adaptive questioning based on user expertise signals.