import { describe, it, expect } from 'vitest';
import type { PipelineState, AgentInput } from '@mycel/shared/src/types/agent.types.js';
import { createInMemorySessionRepository } from './in-memory-session.repository.js';
import type { CreateSessionInput, CreateTurnInput } from './session.repository.js';

const testSessionInput: CreateSessionInput = {
  domainConfigName: 'test-domain',
  personaConfigName: 'test-persona',
  metadata: { source: 'cli' },
};

function createTestTurnInput(turnNumber: number): CreateTurnInput {
  const input: AgentInput = {
    sessionId: 'ignored',
    content: `Turn ${String(turnNumber)} input`,
    metadata: {},
  };
  const pipelineResult: PipelineState = {
    sessionId: 'ignored',
    input,
  };
  return {
    turnNumber,
    input: { content: input.content, isFollowUpResponse: turnNumber > 1 },
    pipelineResult,
  };
}

describe('createInMemorySessionRepository', () => {
  it('should create a session with generated id and timestamps', async () => {
    const repo = createInMemorySessionRepository();
    const session = await repo.create(testSessionInput);

    expect(session.id).toBeDefined();
    expect(session.domainConfigName).toBe('test-domain');
    expect(session.personaConfigName).toBe('test-persona');
    expect(session.status).toBe('active');
    expect(session.turnCount).toBe(0);
    expect(session.turns).toEqual([]);
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.updatedAt).toBeInstanceOf(Date);
    expect(session.metadata?.source).toBe('cli');
  });

  it('should retrieve a session by id', async () => {
    const repo = createInMemorySessionRepository();
    const created = await repo.create(testSessionInput);

    const loaded = await repo.getById(created.id);
    expect(loaded).toEqual(created);
  });

  it('should return null for nonexistent session', async () => {
    const repo = createInMemorySessionRepository();
    const loaded = await repo.getById('nonexistent');
    expect(loaded).toBeNull();
  });

  it('should update session status', async () => {
    const repo = createInMemorySessionRepository();
    const session = await repo.create(testSessionInput);

    await repo.update(session.id, { status: 'complete' });

    const loaded = await repo.getById(session.id);
    expect(loaded?.status).toBe('complete');
    expect(loaded?.updatedAt.getTime()).toBeGreaterThanOrEqual(session.updatedAt.getTime());
  });

  it('should add a turn to a session and increment turnCount', async () => {
    const repo = createInMemorySessionRepository();
    const session = await repo.create(testSessionInput);

    const turnInput = createTestTurnInput(1);
    const turn = await repo.addTurn(session.id, turnInput);

    expect(turn.id).toBeDefined();
    expect(turn.turnNumber).toBe(1);
    expect(turn.input.content).toBe('Turn 1 input');
    expect(turn.timestamp).toBeInstanceOf(Date);

    const loaded = await repo.getById(session.id);
    expect(loaded?.turnCount).toBe(1);
  });

  it('should retrieve all turns for a session', async () => {
    const repo = createInMemorySessionRepository();
    const session = await repo.create(testSessionInput);

    await repo.addTurn(session.id, createTestTurnInput(1));
    await repo.addTurn(session.id, createTestTurnInput(2));

    const turns = await repo.getTurns(session.id);
    expect(turns).toHaveLength(2);
    expect(turns[0].turnNumber).toBe(1);
    expect(turns[1].turnNumber).toBe(2);
  });

  it('should return empty turns for nonexistent session', async () => {
    const repo = createInMemorySessionRepository();
    const turns = await repo.getTurns('nonexistent');
    expect(turns).toEqual([]);
  });

  it('should get session with turns assembled', async () => {
    const repo = createInMemorySessionRepository();
    const session = await repo.create(testSessionInput);

    await repo.addTurn(session.id, createTestTurnInput(1));
    await repo.addTurn(session.id, createTestTurnInput(2));

    const full = await repo.getSessionWithTurns(session.id);
    expect(full).not.toBeNull();
    expect(full?.id).toBe(session.id);
    expect(full?.turns).toHaveLength(2);
    expect(full?.turns[0].turnNumber).toBe(1);
    expect(full?.turns[1].turnNumber).toBe(2);
  });

  it('should return null from getSessionWithTurns for nonexistent session', async () => {
    const repo = createInMemorySessionRepository();
    const result = await repo.getSessionWithTurns('nonexistent');
    expect(result).toBeNull();
  });

  it('should throw when adding turn to nonexistent session', async () => {
    const repo = createInMemorySessionRepository();
    await expect(repo.addTurn('nonexistent', createTestTurnInput(1))).rejects.toThrow(
      'Session not found',
    );
  });

  it('should throw when updating a nonexistent session', async () => {
    const repo = createInMemorySessionRepository();
    await expect(repo.update('nonexistent', { status: 'complete' })).rejects.toThrow(
      'Session not found',
    );
  });

  describe('list', () => {
    it('should return empty array when no sessions exist', async () => {
      const repo = createInMemorySessionRepository();
      const results = await repo.list();
      expect(results).toEqual([]);
    });

    it('should return sessions sorted by updatedAt desc', async () => {
      const repo = createInMemorySessionRepository();
      const s1 = await repo.create(testSessionInput);
      const s2 = await repo.create(testSessionInput);
      // Update s1 so it has a newer updatedAt
      await repo.update(s1.id, { status: 'active' });

      const results = await repo.list();
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(s1.id);
      expect(results[1].id).toBe(s2.id);
    });

    it('should filter by status', async () => {
      const repo = createInMemorySessionRepository();
      await repo.create(testSessionInput);
      const s2 = await repo.create(testSessionInput);
      await repo.update(s2.id, { status: 'complete' });

      const active = await repo.list({ status: 'active' });
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe('active');

      const complete = await repo.list({ status: 'complete' });
      expect(complete).toHaveLength(1);
      expect(complete[0].status).toBe('complete');
    });

    it('should respect limit', async () => {
      const repo = createInMemorySessionRepository();
      await repo.create(testSessionInput);
      await repo.create(testSessionInput);
      await repo.create(testSessionInput);

      const results = await repo.list({ limit: 2 });
      expect(results).toHaveLength(2);
    });
  });
});
