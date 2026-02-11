import { describe, it, expect } from 'vitest';
import type { Session } from '@mycel/shared/src/types/session.types.js';
import { createInMemorySessionStore } from './in-memory-session-store.js';

function createTestSession(id: string): Session {
  const now = new Date();
  return {
    id,
    domainConfigName: 'test-domain',
    personaConfigName: 'test-persona',
    status: 'active',
    turns: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('createInMemorySessionStore', () => {
  it('should save and load a session', async () => {
    const store = createInMemorySessionStore();
    const session = createTestSession('session-1');

    await store.save(session);
    const loaded = await store.load('session-1');

    expect(loaded).toEqual(session);
  });

  it('should return undefined for nonexistent session', async () => {
    const store = createInMemorySessionStore();
    const loaded = await store.load('nonexistent');

    expect(loaded).toBeUndefined();
  });

  it('should overwrite session on save with same id', async () => {
    const store = createInMemorySessionStore();
    const session1 = createTestSession('session-1');
    await store.save(session1);

    const session2: Session = { ...session1, status: 'complete' };
    await store.save(session2);

    const loaded = await store.load('session-1');
    expect(loaded?.status).toBe('complete');
  });

  it('should delete a session', async () => {
    const store = createInMemorySessionStore();
    const session = createTestSession('session-1');

    await store.save(session);
    await store.delete('session-1');
    const loaded = await store.load('session-1');

    expect(loaded).toBeUndefined();
  });

  it('should not throw when deleting nonexistent session', async () => {
    const store = createInMemorySessionStore();
    await expect(store.delete('nonexistent')).resolves.toBeUndefined();
  });
});
