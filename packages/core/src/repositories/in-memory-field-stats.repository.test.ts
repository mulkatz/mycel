import { describe, it, expect } from 'vitest';
import { createInMemoryFieldStatsRepository } from './in-memory-field-stats.repository.js';

describe('InMemoryFieldStatsRepository', () => {
  it('should return empty stats for unknown domain', async () => {
    const repo = createInMemoryFieldStatsRepository();
    const result = await repo.getByDomain('unknown');
    expect(result).toEqual([]);
  });

  it('should increment asked count', async () => {
    const repo = createInMemoryFieldStatsRepository();
    await repo.incrementAsked('domain-1', 'history', 'period');
    await repo.incrementAsked('domain-1', 'history', 'period');

    const stats = await repo.getByDomain('domain-1');
    expect(stats).toHaveLength(1);
    expect(stats[0].timesAsked).toBe(2);
    expect(stats[0].timesAnswered).toBe(0);
    expect(stats[0].answerRate).toBe(0);
  });

  it('should increment answered count', async () => {
    const repo = createInMemoryFieldStatsRepository();
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
    const repo = createInMemoryFieldStatsRepository();
    await repo.incrementAsked('domain-1', 'history', 'period');
    await repo.incrementAsked('domain-1', 'nature', 'species');

    const historyStats = await repo.getByCategory('domain-1', 'history');
    expect(historyStats).toHaveLength(1);
    expect(historyStats[0].fieldName).toBe('period');

    const natureStats = await repo.getByCategory('domain-1', 'nature');
    expect(natureStats).toHaveLength(1);
    expect(natureStats[0].fieldName).toBe('species');
  });

  it('should track multiple fields independently', async () => {
    const repo = createInMemoryFieldStatsRepository();
    await repo.incrementAsked('domain-1', 'history', 'period');
    await repo.incrementAsked('domain-1', 'history', 'sources');
    await repo.incrementAnswered('domain-1', 'history', 'period');

    const stats = await repo.getByCategory('domain-1', 'history');
    expect(stats).toHaveLength(2);

    const periodStat = stats.find((s) => s.fieldName === 'period');
    expect(periodStat?.timesAsked).toBe(1);
    expect(periodStat?.timesAnswered).toBe(1);
    expect(periodStat?.answerRate).toBe(1);

    const sourcesStat = stats.find((s) => s.fieldName === 'sources');
    expect(sourcesStat?.timesAsked).toBe(1);
    expect(sourcesStat?.timesAnswered).toBe(0);
    expect(sourcesStat?.answerRate).toBe(0);
  });

  it('should handle incrementAnswered creating stats entry', async () => {
    const repo = createInMemoryFieldStatsRepository();
    await repo.incrementAnswered('domain-1', 'history', 'period');

    const stats = await repo.getByDomain('domain-1');
    expect(stats).toHaveLength(1);
    expect(stats[0].timesAsked).toBe(0);
    expect(stats[0].timesAnswered).toBe(1);
    expect(stats[0].answerRate).toBe(0);
  });
});
