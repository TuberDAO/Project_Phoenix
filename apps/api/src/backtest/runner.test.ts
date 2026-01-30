import { describe, it, expect } from 'vitest';
import { runBacktest } from './runner';

describe('Backtest Runner', () => {
  it('should return valid metrics structure', async () => {
    const params = {
      from: new Date('2024-01-01'),
      to: new Date('2024-01-02'),
      minIrs: 75,
    };

    // This will run against real DB (if available) or return zeros
    const result = await runBacktest(params);

    expect(result).toHaveProperty('totalBets');
    expect(result).toHaveProperty('highRiskBets');
    expect(result).toHaveProperty('precisionAt10');
    expect(result).toHaveProperty('precisionAt20');
    expect(result).toHaveProperty('precisionAt50');
    expect(result).toHaveProperty('rocAucProxy');
    expect(result).toHaveProperty('avgLeadTimeMinutes');
    expect(result).toHaveProperty('irsDistribution');
    expect(result).toHaveProperty('irsOverTime');

    expect(result.totalBets).toBeGreaterThanOrEqual(0);
    expect(result.highRiskBets).toBeGreaterThanOrEqual(0);
    expect(result.precisionAt10).toBeGreaterThanOrEqual(0);
    expect(result.precisionAt10).toBeLessThanOrEqual(1);
  }, 30000); // 30s timeout for DB operations
});

