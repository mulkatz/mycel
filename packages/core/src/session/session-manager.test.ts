import { describe, it, expect, vi } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import { createSessionManager } from './session-manager.js';
import { createInMemorySessionRepository } from '../repositories/in-memory-session.repository.js';
import { createInMemoryKnowledgeRepository } from '../repositories/in-memory-knowledge.repository.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { KnowledgeRepository } from '../repositories/knowledge.repository.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [
    {
      id: 'history',
      label: 'History',
      description: 'Historical events',
      requiredFields: ['period', 'sources'],
      optionalFields: ['relatedPlaces'],
    },
    { id: 'nature', label: 'Nature', description: 'Natural environment' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
  completeness: {
    autoCompleteThreshold: 0.8,
    maxTurns: 3,
  },
};

const personaConfig: PersonaConfig = {
  name: 'Test Chronicler',
  version: '1.0.0',
  tonality: 'warm',
  formality: 'informal',
  language: 'en',
  promptBehavior: {
    gapAnalysis: true,
    maxFollowUpQuestions: 3,
    encourageStorytelling: false,
    validateWithSources: true,
  },
  systemPromptTemplate: 'You are a test chronicler.',
};

function createMockLlm(): { client: LlmClient; callArgs: Array<{ systemPrompt: string }> } {
  const callArgs: Array<{ systemPrompt: string }> = [];
  const invokeFn = vi.fn().mockImplementation((request: { systemPrompt: string }) => {
    callArgs.push(request);
      const prompt = request.systemPrompt.toLowerCase();
      const isFollowUp = prompt.includes('[follow_up_context]');

      if (prompt.includes('classifier')) {
        return Promise.resolve({
          content: JSON.stringify({
            categoryId: 'history',
            confidence: 0.9,
            reasoning: 'Historical content',
          }),
        });
      }

      if (prompt.includes('gap-reasoning') || prompt.includes('gap analysis')) {
        if (isFollowUp && prompt.includes('turn 3')) {
          return Promise.resolve({
            content: JSON.stringify({
              gaps: [],
              followUpQuestions: [],
              reasoning: 'All filled.',
            }),
          });
        }
        if (isFollowUp) {
          return Promise.resolve({
            content: JSON.stringify({
              gaps: [{ field: 'sources', description: 'No sources', priority: 'medium' }],
              followUpQuestions: ['Do you have sources?'],
              reasoning: 'Only sources remain.',
            }),
          });
        }
        return Promise.resolve({
          content: JSON.stringify({
            gaps: [
              { field: 'period', description: 'Period unclear', priority: 'high' },
              { field: 'sources', description: 'No sources', priority: 'medium' },
            ],
            followUpQuestions: ['When was this?', 'Do you have sources?'],
            reasoning: 'Missing required fields.',
          }),
        });
      }

      if (prompt.includes('persona')) {
        if (isFollowUp && prompt.includes('turn 3')) {
          return Promise.resolve({
            content: JSON.stringify({
              response: 'All complete!',
              followUpQuestions: [],
            }),
          });
        }
        if (isFollowUp) {
          return Promise.resolve({
            content: JSON.stringify({
              response: 'Thanks! One more question.',
              followUpQuestions: ['Do you have sources?'],
            }),
          });
        }
        return Promise.resolve({
          content: JSON.stringify({
            response: 'Thanks for sharing! Tell me more.',
            followUpQuestions: ['When was this?', 'Do you have sources?'],
          }),
        });
      }

      if (prompt.includes('structuring')) {
        if (isFollowUp && prompt.includes('turn 3')) {
          return Promise.resolve({
            content: JSON.stringify({
              title: 'Historic Church',
              content: 'A church built in 1732, fully documented.',
              structuredData: { period: '18th century', sources: 'Church records' },
              tags: ['history'],
              isComplete: true,
              missingFields: [],
            }),
          });
        }
        if (isFollowUp) {
          return Promise.resolve({
            content: JSON.stringify({
              title: 'Historic Church',
              content: 'A church built in 1732.',
              structuredData: { period: '18th century' },
              tags: ['history'],
              isComplete: false,
              missingFields: ['sources'],
            }),
          });
        }
        return Promise.resolve({
          content: JSON.stringify({
            title: 'Historic Church',
            content: 'A church built in 1732.',
            structuredData: {},
            tags: ['history'],
            isComplete: false,
            missingFields: ['period', 'sources'],
          }),
        });
      }

      return Promise.resolve({ content: JSON.stringify({ result: 'unknown' }) });
    });
  return { client: { invoke: invokeFn } as LlmClient, callArgs };
}

function createTestManager(): {
  manager: ReturnType<typeof createSessionManager>;
  sessionRepo: SessionRepository;
  knowledgeRepo: KnowledgeRepository;
  callArgs: Array<{ systemPrompt: string }>;
} {
  const sessionRepo = createInMemorySessionRepository();
  const knowledgeRepo = createInMemoryKnowledgeRepository();
  const { client, callArgs } = createMockLlm();
  const manager = createSessionManager({
    pipelineConfig: { domainConfig, personaConfig, llmClient: client },
    sessionRepository: sessionRepo,
    knowledgeRepository: knowledgeRepo,
  });
  return { manager, sessionRepo, knowledgeRepo, callArgs };
}

describe('SessionManager', () => {
  it('should start a session and return turn-1 response', async () => {
    const { manager } = createTestManager();

    const response = await manager.startSession({
      content: 'The old church was built in 1732.',
      isFollowUpResponse: false,
    });

    expect(response.sessionId).toBeTruthy();
    expect(response.turnNumber).toBe(1);
    expect(response.personaResponse).toBeTruthy();
    expect(response.followUpQuestions.length).toBeGreaterThan(0);
    expect(response.isComplete).toBe(false);
    expect(response.completenessScore).toBe(0);
    expect(response.entry).toBeDefined();
  });

  it('should continue a session and show progress', async () => {
    const { manager } = createTestManager();

    const turn1 = await manager.startSession({
      content: 'The old church was built in 1732.',
      isFollowUpResponse: false,
    });

    const turn2 = await manager.continueSession(turn1.sessionId, {
      content: 'It was built in the 18th century.',
      isFollowUpResponse: true,
      respondingToQuestions: turn1.followUpQuestions,
    });

    expect(turn2.turnNumber).toBe(2);
    expect(turn2.completenessScore).toBe(0.5);
    expect(turn2.isComplete).toBe(false);
    expect(turn2.entry?.structuredData).toHaveProperty('period');
  });

  it('should auto-complete when threshold is reached', async () => {
    const { manager } = createTestManager();

    const turn1 = await manager.startSession({
      content: 'The old church was built in 1732.',
      isFollowUpResponse: false,
    });

    const turn2 = await manager.continueSession(turn1.sessionId, {
      content: 'It was built in the 18th century.',
      isFollowUpResponse: true,
    });

    const turn3 = await manager.continueSession(turn2.sessionId, {
      content: 'The source is the church records from 1740.',
      isFollowUpResponse: true,
    });

    expect(turn3.turnNumber).toBe(3);
    expect(turn3.completenessScore).toBe(1.0);
    expect(turn3.isComplete).toBe(true);
    expect(turn3.entry?.structuredData).toHaveProperty('period');
    expect(turn3.entry?.structuredData).toHaveProperty('sources');
  });

  it('should reuse turn-1 classification on follow-up', async () => {
    const { manager, callArgs } = createTestManager();

    const turn1 = await manager.startSession({
      content: 'The old church was built in 1732.',
      isFollowUpResponse: false,
    });

    const classifierCallsBefore = callArgs.filter(
      (arg) => arg.systemPrompt.toLowerCase().includes('classifier'),
    ).length;

    await manager.continueSession(turn1.sessionId, {
      content: '18th century.',
      isFollowUpResponse: true,
    });

    const classifierCallsAfter = callArgs.filter(
      (arg) => arg.systemPrompt.toLowerCase().includes('classifier'),
    ).length;

    // Classifier should not be called again on follow-up
    expect(classifierCallsAfter).toBe(classifierCallsBefore);
  });

  it('should accumulate turns across the session', async () => {
    const { manager, sessionRepo } = createTestManager();

    const turn1 = await manager.startSession({
      content: 'The old church was built in 1732.',
      isFollowUpResponse: false,
    });

    await manager.continueSession(turn1.sessionId, {
      content: '18th century.',
      isFollowUpResponse: true,
    });

    const session = await sessionRepo.getSessionWithTurns(turn1.sessionId);
    expect(session).not.toBeNull();
    expect(session?.turns).toHaveLength(2);

    // Turn 1 should have questions
    const turn1Questions = session?.turns[0].pipelineResult.personaOutput?.result.followUpQuestions ?? [];
    expect(turn1Questions.length).toBeGreaterThan(0);
  });

  it('should enforce max turns', async () => {
    const { manager } = createTestManager();

    const turn1 = await manager.startSession({
      content: 'The old church was built in 1732.',
      isFollowUpResponse: false,
    });

    const turn2 = await manager.continueSession(turn1.sessionId, {
      content: '18th century.',
      isFollowUpResponse: true,
    });

    const turn3 = await manager.continueSession(turn2.sessionId, {
      content: 'Church records from 1740.',
      isFollowUpResponse: true,
    });

    // Turn 3 auto-completes, so continuing should fail (session is complete)
    await expect(
      manager.continueSession(turn3.sessionId, {
        content: 'More info.',
        isFollowUpResponse: true,
      }),
    ).rejects.toThrow('already complete');
  });

  it('should throw when continuing a nonexistent session', async () => {
    const { manager } = createTestManager();

    await expect(
      manager.continueSession('nonexistent-id', {
        content: 'Hello',
        isFollowUpResponse: true,
      }),
    ).rejects.toThrow('Session not found');
  });

  it('should end a session and set status', async () => {
    const { manager } = createTestManager();

    const turn1 = await manager.startSession({
      content: 'The old church was built in 1732.',
      isFollowUpResponse: false,
    });

    const ended = await manager.endSession(turn1.sessionId);
    expect(ended.status).toBe('complete');
  });

  it('should throw when ending a nonexistent session', async () => {
    const { manager } = createTestManager();

    await expect(manager.endSession('nonexistent-id')).rejects.toThrow('Session not found');
  });

  it('should get a session by id', async () => {
    const { manager } = createTestManager();

    const turn1 = await manager.startSession({
      content: 'Test input.',
      isFollowUpResponse: false,
    });

    const session = await manager.getSession(turn1.sessionId);
    expect(session.id).toBe(turn1.sessionId);
    expect(session.turns).toHaveLength(1);
  });

  it('should grow structuredData across turns', async () => {
    const { manager } = createTestManager();

    const turn1 = await manager.startSession({
      content: 'The old church was built in 1732.',
      isFollowUpResponse: false,
    });

    expect(Object.keys(turn1.entry?.structuredData ?? {})).toHaveLength(0);

    const turn2 = await manager.continueSession(turn1.sessionId, {
      content: '18th century.',
      isFollowUpResponse: true,
    });

    expect(Object.keys(turn2.entry?.structuredData ?? {}).length).toBeGreaterThan(0);
  });

  it('should persist knowledge entries when knowledgeRepository is provided', async () => {
    const { manager, knowledgeRepo } = createTestManager();

    const turn1 = await manager.startSession({
      content: 'The old church was built in 1732.',
      isFollowUpResponse: false,
    });

    const entries = await knowledgeRepo.getBySession(turn1.sessionId);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].categoryId).toBe('history');
    expect(entries[0].sessionId).toBe(turn1.sessionId);
    expect(entries[0].status).toBe('draft');
  });
});
