import { describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import { createFirestoreFieldStatsRepository } from './firestore-field-stats.repository.js';

describe('FirestoreFieldStatsRepository (integration)', () => {
  const db = new Firestore({ projectId: 'mycel-test' });
  const repo = createFirestoreFieldStatsRepository(db);

  beforeEach(async () => {
    const docs = await db.collection('field-stats').listDocuments();
    for (const doc of docs) {
      await doc.delete();
    }
  });

  it('should return empty stats for unknown domain', async () => {
    const result = await repo.getByDomain('unknown');
    expect(result).toEqual([]);
  });

  it('should increment asked and retrieve stats', async () => {
    await repo.incrementAsked('domain-1', 'history', 'period');
    await repo.incrementAsked('domain-1', 'history', 'period');

    const stats = await repo.getByDomain('domain-1');
    expect(stats).toHaveLength(1);
    expect(stats[0].timesAsked).toBe(2);
    expect(stats[0].fieldName).toBe('period');
    expect(stats[0].lastUpdatedAt).toBeInstanceOf(Date);
  });

  it('should increment answered and compute answer rate', async () => {
    await repo.incrementAsked('domain-1', 'history', 'period');
    await repo.incrementAsked('domain-1', 'history', 'period');
    await repo.incrementAnswered('domain-1', 'history', 'period');

    const stats = await repo.getByDomain('domain-1');
    expect(stats).toHaveLength(1);
    expect(stats[0].timesAsked).toBe(2);
    expect(stats[0].timesAnswered).toBe(1);
    expect(stats[0].answerRate).toBe(0.5);
  });

  it('should filter by category', async () => {
    await repo.incrementAsked('domain-1', 'history', 'period');
    await repo.incrementAsked('domain-1', 'nature', 'species');

    const historyStats = await repo.getByCategory('domain-1', 'history');
    expect(historyStats).toHaveLength(1);
    expect(historyStats[0].fieldName).toBe('period');
  });
});
