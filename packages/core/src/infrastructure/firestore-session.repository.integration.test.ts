import { describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import type { AgentInput, PipelineState } from '@mycel/shared/src/types/agent.types.js';
import { createFirestoreSessionRepository } from './firestore-session.repository.js';
import type { CreateTurnInput } from '../repositories/session.repository.js';

function createTestTurnInput(turnNumber: number): CreateTurnInput {
  const input: AgentInput = {
    sessionId: 'test',
    content: `Turn ${String(turnNumber)} content`,
    metadata: {},
  };
  const pipelineResult: PipelineState = {
    sessionId: 'test',
    input,
  };
  return {
    turnNumber,
    input: { content: input.content, isFollowUpResponse: turnNumber > 1 },
    pipelineResult,
  };
}

describe('FirestoreSessionRepository (integration)', () => {
  const db = new Firestore({ projectId: 'mycel-test' });
  const tenantBase = db.collection('tenants').doc('test-tenant');
  const repo = createFirestoreSessionRepository(tenantBase);

  beforeEach(async () => {
    // Clear sessions collection
    const sessions = await tenantBase.collection('sessions').listDocuments();
    for (const doc of sessions) {
      const turns = await doc.collection('turns').listDocuments();
      for (const turn of turns) {
        await turn.delete();
      }
      await doc.delete();
    }
  });

  it('should create and retrieve a session', async () => {
    const session = await repo.create({
      domainConfigName: 'test-domain',
      personaConfigName: 'test-persona',
      metadata: { source: 'cli' },
    });

    expect(session.id).toBeTruthy();
    expect(session.status).toBe('active');
    expect(session.domainConfigName).toBe('test-domain');
    expect(session.createdAt).toBeInstanceOf(Date);

    const loaded = await repo.getById(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(session.id);
    expect(loaded?.metadata?.source).toBe('cli');
  });

  it('should return null for nonexistent session', async () => {
    const result = await repo.getById('nonexistent-id');
    expect(result).toBeNull();
  });

  it('should update session status', async () => {
    const session = await repo.create({
      domainConfigName: 'test-domain',
      personaConfigName: 'test-persona',
    });

    await repo.update(session.id, { status: 'complete' });

    const loaded = await repo.getById(session.id);
    expect(loaded?.status).toBe('complete');
  });

  it('should add and retrieve turns', async () => {
    const session = await repo.create({
      domainConfigName: 'test-domain',
      personaConfigName: 'test-persona',
    });

    const turn1 = await repo.addTurn(session.id, createTestTurnInput(1));
    const turn2 = await repo.addTurn(session.id, createTestTurnInput(2));

    expect(turn1.id).toBeTruthy();
    expect(turn1.turnNumber).toBe(1);
    expect(turn2.turnNumber).toBe(2);

    const turns = await repo.getTurns(session.id);
    expect(turns).toHaveLength(2);
    expect(turns[0].turnNumber).toBe(1);
    expect(turns[1].turnNumber).toBe(2);
  });

  it('should get session with turns assembled', async () => {
    const session = await repo.create({
      domainConfigName: 'test-domain',
      personaConfigName: 'test-persona',
    });

    await repo.addTurn(session.id, createTestTurnInput(1));
    await repo.addTurn(session.id, createTestTurnInput(2));

    const full = await repo.getSessionWithTurns(session.id);
    expect(full).not.toBeNull();
    expect(full?.turns).toHaveLength(2);
    expect(full?.turns[0].turnNumber).toBe(1);
    expect(full?.turns[1].turnNumber).toBe(2);
  });

  it('should return null from getSessionWithTurns for nonexistent session', async () => {
    const result = await repo.getSessionWithTurns('nonexistent');
    expect(result).toBeNull();
  });

  it('should return empty turns for session without turns', async () => {
    const session = await repo.create({
      domainConfigName: 'test-domain',
      personaConfigName: 'test-persona',
    });

    const turns = await repo.getTurns(session.id);
    expect(turns).toEqual([]);
  });
});
