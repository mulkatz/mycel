# ADR-003: Multi-Agent Architecture with LangGraph.js

## Status

Accepted

## Date

2026-02-11

## Context

Mycel needs to process user input through multiple reasoning steps: classification, context retrieval, gap analysis, response generation, and knowledge structuring. Two approaches were considered:

1. **Monolithic prompt**: A single large prompt handles all reasoning steps
2. **Multi-agent system**: Specialized agents, each with a single responsibility

Monolithic prompts degrade in quality as context grows. They are harder to test, debug, and iterate on. A multi-agent approach aligns with the principle of single responsibility and enables targeted improvements to individual reasoning steps.

For orchestration, we evaluated:
- **Custom orchestration**: Full control but high maintenance burden
- **LangChain.js**: Broad toolkit but complex, often overkill
- **LangGraph.js**: Graph-based agent orchestration with state management, focused on workflows

## Decision

Implement a multi-agent system with five specialized agents, orchestrated via LangGraph.js:

1. **Classifier Agent**: Categorizes input into domain-defined categories
2. **Context Dispatcher Agent**: Retrieves relevant existing knowledge via RAG
3. **Gap-Reasoning Agent**: Identifies missing information and generates follow-up questions
4. **Persona Agent**: Generates the user-facing response using the configured persona
5. **Structuring Agent**: Extracts structured knowledge entries from the conversation

LangGraph.js manages the agent pipeline as a directed graph with typed state transitions.

## Consequences

**Positive:**
- Each agent can be tested, debugged, and improved independently
- Smaller, focused prompts maintain higher reasoning quality
- LangGraph.js provides built-in state management and graph visualization
- The pipeline is extensible – new agents can be added without modifying existing ones
- Better observability: each agent step can be logged and monitored separately

**Negative:**
- More complex orchestration logic compared to a single prompt
- Inter-agent communication requires well-defined interfaces (typed state)
- LangGraph.js dependency adds a framework to learn and maintain
- Latency increases with sequential agent calls (mitigated by parallelizing independent steps)
