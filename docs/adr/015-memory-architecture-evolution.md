# ADR-015: Memory Architecture Evolution

**Status:** Proposed
**Date:** 2026-02-15
**Context:** The current RAG-based memory system works for small-to-medium knowledge bases but has fundamental recall limitations that will degrade quality at scale.

## Problem Statement

Mycel's value proposition depends on accumulating knowledge over time — across turns within a session, across sessions within a domain, and eventually across domains. The system must feel like it **remembers everything** a user has ever shared.

Currently, the system's recall is constrained at multiple levels:

| Layer | Current State | Limitation |
|-------|--------------|------------|
| **Within-session** | Full turn history passed to every agent | Grows unbounded; will exceed context windows in long sessions (50+ turns) |
| **Cross-session** | Vector search returns top-15 similar entries | With 1,000+ entries, relevant knowledge is routinely missed |
| **Cross-domain** | No mechanism | Knowledge about "local craftsmen" in one domain can't inform "economic history" in another |
| **User memory** | No mechanism | System doesn't remember that a specific user is an expert in architecture or tends to give short answers |

The core tension: **storage is unlimited, but recall is narrow.** The system knows far more than it can access in any given turn.

## Current Architecture

```
User Input (current turn)
    │
    ├─→ Embedding generation (768-dim vector)
    │       │
    │       └─→ Firestore Vector Search (cosine, top-15, threshold 0.3)
    │               │
    │               └─→ Context Summary (full content, 15 entries max)
    │
    ├─→ Previous Turns (full TurnSummary[] array, unbounded)
    │
    ├─→ Previous Entry (current knowledge entry being built)
    │
    ├─→ Asked Questions (all follow-ups from all prior turns)
    │
    └─→ Skipped Fields (fields user said "I don't know" about)
            │
            └─→ Agents receive all of the above per turn
```

### What Works Well

- **Embedding quality**: `text-multilingual-embedding-002` produces good multilingual vectors
- **Session continuity**: Full turn history ensures no within-session amnesia
- **Enrichment markers**: Verified/disputed flags surface in context naturally
- **Field stats**: Adaptive questioning improves over time without explicit memory

### What Breaks at Scale

1. **Semantic similarity is not the only axis of relevance.** A user talking about "the church tower renovation" should recall entries about the church (semantic match) but also entries about "the same architect who designed the school" (relational match) and "the 1890s building boom" (temporal match). Vector search only captures the first.

2. **No compression for long sessions.** A 30-turn biography session passes ~15KB of raw turn history to every agent. At 100 turns, this becomes ~50KB — still within Gemini's context window, but diluting the signal. Agents receive too much noise and too little structure.

3. **No persistent user model.** The system doesn't learn that User A is a historian who provides precise dates, while User B is a storyteller who gives rich narratives but vague timelines. This knowledge could dramatically improve gap reasoning and persona behavior.

4. **Retrieved context lacks structure.** The context summary is a flat list of entries. Agents can't distinguish "there are 3 entries about this exact topic" from "there are 3 loosely related entries about different things."

## Proposed Improvements

### Tier 1: Compression (Low effort, high impact)

#### 1.1 Session Summarization

At the end of each session (or every N turns within a session), generate a structured summary:

```typescript
interface SessionSummary {
  sessionId: string;
  domainSchemaId: string;
  topicsDiscussed: string[];           // e.g., ["church history", "local crafts"]
  keyFacts: string[];                  // e.g., ["Church built 1732", "Baroque style"]
  userExpertise: string[];             // e.g., ["architecture", "18th century history"]
  openThreads: string[];              // e.g., ["architect name unknown", "renovation date unclear"]
  entryCount: number;
  turnCount: number;
  summary: string;                     // 2-3 paragraph natural language summary
  embedding: number[];                 // Embedded summary for retrieval
}
```

**Impact:** Future sessions retrieve session summaries (high-level) alongside individual entries (detailed), giving agents both breadth and depth. A single summary embedding can represent 20+ entries worth of knowledge.

**Implementation:** Add a `SessionSummarizer` service called at session end. Store summaries with embeddings. Context Dispatcher queries both `knowledgeEntries` and `sessionSummaries` collections.

#### 1.2 Turn History Sliding Window with Summary

Instead of passing all previous turns raw, compress older turns:

```
Turns 1-5:  [Summarized as 2-3 sentences]
Turns 6-8:  [Summarized as 2-3 sentences]
Turn 9:     [Full TurnSummary]
Turn 10:    [Full TurnSummary]  ← current
```

Keep the last 3-5 turns in full detail. Summarize older turns in batches. This caps context size regardless of session length while preserving recent conversational flow.

**Implementation:** Add a `TurnCompressor` that runs when `previousTurns.length > 5`. Uses a lightweight LLM call (Gemini Flash) to summarize older turn batches. Cache summaries on the session document to avoid recomputation.

### Tier 2: Multi-Axis Retrieval (Medium effort, high impact)

#### 2.1 Hybrid Retrieval Strategy

Replace single vector search with a multi-signal retrieval:

```
User Input
    │
    ├─→ Semantic Search (vector similarity, current)
    │       → "entries about similar topics"
    │
    ├─→ Category Search (same category, recent entries)
    │       → "what else is known in this category"
    │
    ├─→ Entity Search (shared entities: people, places, dates)
    │       → "entries mentioning the same church/person/event"
    │
    └─→ Temporal Search (entries from similar time periods)
            → "what else happened in the 1730s"
```

Each axis returns candidates. A lightweight reranker (or simple score fusion) produces the final top-K.

**Why this matters:** An autobiography session about "my childhood" should surface entries about the user's parents (entity match), their hometown (entity match), and the 1960s (temporal match) — not just entries semantically similar to the current sentence.

**Implementation:** Entity extraction already happens in the Structuring Agent (structured data fields). Add entity indexing on knowledge entries. Category and temporal queries are simple Firestore filters. Score fusion is weighted addition of normalized scores.

#### 2.2 Knowledge Graph Edges

When the Structuring Agent extracts an entry, also extract relationships:

```typescript
interface KnowledgeRelation {
  sourceEntryId: string;
  targetEntryId: string;
  relationType: 'mentions' | 'contradicts' | 'extends' | 'same_entity' | 'same_period';
  confidence: number;
}
```

This enables graph traversal: "The user mentioned the church → the church is related to the architect → the architect also designed the school → surface the school entry."

**Implementation:** After structuring, a lightweight `RelationExtractor` compares the new entry's entities against existing entries. Store relations as a Firestore subcollection. Context Dispatcher does 1-hop graph traversal alongside vector search.

### Tier 3: Persistent Intelligence (Higher effort, transformative impact)

#### 3.1 User Expertise Profiles

Track what each user knows and how they communicate:

```typescript
interface UserProfile {
  tenantId: string;
  domainSchemaId: string;
  expertiseAreas: Array<{
    categoryId: string;
    depth: 'surface' | 'moderate' | 'expert';
    evidence: string;                // "Provided precise dates and architect names"
  }>;
  communicationStyle: {
    verbosity: 'terse' | 'moderate' | 'verbose';
    providesStructuredData: boolean; // "Gives dates, names, specifics"
    respondsToFollowUps: boolean;   // "Engages with gap questions"
  };
  topicsDeclined: string[];          // Persistent version of skippedFields
  sessionsCompleted: number;
  totalEntriesContributed: number;
  lastActiveAt: Date;
}
```

**Impact:** Gap Reasoning adapts per user — ask the historian for specific dates, ask the storyteller for personal anecdotes. Persona Agent matches communication style. Returning users get a warm "welcome back, last time you told us about X" greeting.

**Implementation:** Update profile incrementally after each session. Use field stats + classifier confidence + entry structured data to infer expertise. Store in Firestore under `tenants/{tenantId}/userProfiles/`.

#### 3.2 Domain Knowledge Index

Maintain a living index of what the domain knows and doesn't know:

```typescript
interface DomainKnowledgeIndex {
  domainSchemaId: string;
  categoryCompleteness: Record<string, {
    entryCount: number;
    uniqueTopics: string[];
    wellCoveredFields: string[];
    weakFields: string[];
    lastUpdated: Date;
  }>;
  crossCuttingThemes: string[];      // e.g., ["Baroque architecture", "Post-war reconstruction"]
  temporalCoverage: Record<string, number>; // e.g., {"1700s": 12, "1800s": 8, "1900s": 3}
  geographicCoverage: string[];
  totalEntries: number;
  lastReindexed: Date;
}
```

**Impact:** Gap Reasoning can say "we have 12 entries about the 1700s but only 3 about the 1900s — ask about modern history." Proactive questioning becomes domain-aware, not just category-aware.

**Implementation:** Rebuild index periodically (on session end or on-demand). Used by Gap Reasoning in `proactive_request` mode.

### Tier 4: Cross-Domain Intelligence (Long-term vision)

#### 4.1 Domain Bridges

When a user has multiple domains (e.g., "Village History" and "Regional Architecture"), allow knowledge transfer:

- An entry about "Baroque church in Naugarten" in the village domain is relevant to "Brandenburg Baroque" in the architecture domain
- Shared entity resolution: "Johann Müller" appears in both domains → same person?

This requires careful permission modeling (domains may belong to different tenants) but enables the most powerful form of recall: the system knows things the user didn't explicitly tell it in this domain.

**Not recommended for near-term implementation.** Included for architectural awareness.

## Recommendation

Implement in order:

| Priority | Improvement | Effort | Impact | Dependencies |
|----------|------------|--------|--------|--------------|
| **P0** | 1.1 Session Summarization | 1-2 days | High | None |
| **P0** | 1.2 Turn History Sliding Window | 1 day | Medium | None |
| **P1** | 2.1 Hybrid Retrieval (category + recency) | 2-3 days | High | None |
| **P1** | 3.2 Domain Knowledge Index | 1-2 days | Medium | None |
| **P2** | 3.1 User Expertise Profiles | 2-3 days | Medium | Session Summarization |
| **P2** | 2.2 Knowledge Graph Edges | 3-5 days | High | Entity extraction improvements |
| **P3** | 2.1 Hybrid Retrieval (entity + temporal) | 3-5 days | High | Knowledge Graph Edges |
| **P3** | 4.1 Cross-Domain Bridges | 5+ days | Transformative | Knowledge Graph, multi-tenancy design |

**Start with P0:** Session summaries and turn compression are independent, low-risk, and immediately improve both cross-session recall and within-session context quality. They also lay the foundation for user profiles and domain indices.

## Cost Considerations

- **Session summarization**: 1 additional LLM call per session end (Gemini Flash, ~$0.001/session)
- **Turn compression**: 1 LLM call per ~10 turns within a session (Gemini Flash, negligible)
- **Hybrid retrieval**: Additional Firestore queries per turn (2-3 extra reads, negligible cost)
- **Knowledge graph**: Storage overhead for relations (~100 bytes per edge, negligible)
- **Domain index**: Periodic recomputation (1 LLM call per reindex, ~$0.01/reindex)

None of these add meaningful cost. The primary investment is implementation time.

## Risks

- **Summary quality**: LLM-generated summaries may lose nuance. Mitigation: always store original data alongside summaries; summaries are an optimization layer, not a replacement.
- **Latency**: Hybrid retrieval adds 100-200ms per turn (parallel Firestore queries). Acceptable given current 2-5s turn time.
- **Complexity**: Each layer adds code to maintain. Mitigation: implement as independent services with clear interfaces; each tier is optional and degrades gracefully.

## Decision

Pending team discussion. This ADR proposes a phased approach — approve Tier 1 (session summarization + turn compression) as immediate next steps, with Tier 2 following based on real-world usage data.
