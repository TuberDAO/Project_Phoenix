import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  STRICT_WEIGHTS,
  BALANCED_WEIGHTS,
  LENIENT_WEIGHTS,
  validateWeights,
  normalizeWeights,
  setCurrentWeights,
  getCurrentWeights,
} from './weights';

describe('Weight System', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    setCurrentWeights(DEFAULT_WEIGHTS);
  });

  describe('Presets', () => {
    it('should have valid default weights', () => {
      expect(validateWeights(DEFAULT_WEIGHTS)).toBe(true);
      const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should have valid strict weights', () => {
      expect(validateWeights(STRICT_WEIGHTS)).toBe(true);
      // Strict should emphasize temporal and evasion
      expect(STRICT_WEIGHTS.temporal).toBeGreaterThan(DEFAULT_WEIGHTS.temporal);
      expect(STRICT_WEIGHTS.evasion).toBeGreaterThan(DEFAULT_WEIGHTS.evasion);
    });

    it('should have valid balanced weights', () => {
      expect(validateWeights(BALANCED_WEIGHTS)).toBe(true);
      // Balanced should have equal weights
      const values = Object.values(BALANCED_WEIGHTS);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      values.forEach(v => {
        expect(v).toBeCloseTo(avg, 5);
      });
    });

    it('should have valid lenient weights', () => {
      expect(validateWeights(LENIENT_WEIGHTS)).toBe(true);
      // Lenient should reduce evasion and temporal
      expect(LENIENT_WEIGHTS.evasion).toBeLessThan(DEFAULT_WEIGHTS.evasion);
      expect(LENIENT_WEIGHTS.temporal).toBeLessThan(DEFAULT_WEIGHTS.temporal);
    });
  });

  describe('Weight Validation', () => {
    it('should validate weights that sum to 1.0', () => {
      const weights = {
        stakeImpact: 0.25,
        temporal: 0.25,
        history: 0.2,
        evasion: 0.15,
        context: 0.15,
      };
      expect(validateWeights(weights)).toBe(true);
    });

    it('should reject weights that sum to != 1.0', () => {
      const weights = {
        stakeImpact: 0.5,
        temporal: 0.5,
        history: 0.5,
        evasion: 0.5,
        context: 0.5,
      };
      expect(validateWeights(weights)).toBe(false);
    });
  });

  describe('Weight Normalization', () => {
    it('should normalize weights to sum to 1.0', () => {
      const weights = {
        stakeImpact: 2,
        temporal: 2,
        history: 2,
        evasion: 2,
        context: 2,
      };
      const normalized = normalizeWeights(weights);
      expect(validateWeights(normalized)).toBe(true);
      Object.values(normalized).forEach(v => {
        expect(v).toBeCloseTo(0.2, 5);
      });
    });
  });

  describe('Weight Management', () => {
    it('should get and set current weights', () => {
      setCurrentWeights(STRICT_WEIGHTS);
      const current = getCurrentWeights();
      expect(current).toEqual(STRICT_WEIGHTS);
    });

    it('should return a copy, not reference', () => {
      const current = getCurrentWeights();
      current.stakeImpact = 0.99;
      const current2 = getCurrentWeights();
      expect(current2.stakeImpact).not.toBe(0.99);
    });
  });
});

