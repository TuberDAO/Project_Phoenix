import { z } from 'zod';
/**
 * Scoring weight configuration for IRS computation.
 * Allows live tuning without redeployment.
 */
export const WeightSetSchema = z.object({
    stakeImpact: z.number().min(0).max(1),
    temporal: z.number().min(0).max(1),
    history: z.number().min(0).max(1),
    evasion: z.number().min(0).max(1),
    context: z.number().min(0).max(1),
});
/**
 * Default weights (balanced approach)
 */
export const DEFAULT_WEIGHTS = {
    stakeImpact: 0.30,
    temporal: 0.25,
    history: 0.20,
    evasion: 0.15,
    context: 0.10,
};
/**
 * Strict preset: emphasizes temporal proximity and evasion
 */
export const STRICT_WEIGHTS = {
    stakeImpact: 0.25,
    temporal: 0.30,
    history: 0.15,
    evasion: 0.20,
    context: 0.10,
};
/**
 * Balanced preset: equal distribution
 */
export const BALANCED_WEIGHTS = {
    stakeImpact: 0.20,
    temporal: 0.20,
    history: 0.20,
    evasion: 0.20,
    context: 0.20,
};
/**
 * Lenient preset: reduces evasion/temporal weight
 */
export const LENIENT_WEIGHTS = {
    stakeImpact: 0.35,
    temporal: 0.20,
    history: 0.25,
    evasion: 0.10,
    context: 0.10,
};
export const PRESETS = {
    default: DEFAULT_WEIGHTS,
    strict: STRICT_WEIGHTS,
    balanced: BALANCED_WEIGHTS,
    lenient: LENIENT_WEIGHTS,
};
/**
 * Validate that weights sum to 1.0 (approximately)
 */
export function validateWeights(weights) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    return Math.abs(sum - 1.0) < 0.01; // Allow 1% tolerance
}
/**
 * Normalize weights to sum to exactly 1.0
 */
export function normalizeWeights(weights) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (sum === 0)
        return DEFAULT_WEIGHTS;
    return {
        stakeImpact: weights.stakeImpact / sum,
        temporal: weights.temporal / sum,
        history: weights.history / sum,
        evasion: weights.evasion / sum,
        context: weights.context / sum,
    };
}
// ==================== Weight Manager ====================
let currentWeights = DEFAULT_WEIGHTS;
let lastRefresh = Date.now();
const REFRESH_INTERVAL = 10000; // 10 seconds
/**
 * Get current weights (with cache)
 */
export function getCurrentWeights() {
    return { ...currentWeights };
}
/**
 * Set current weights (in-memory)
 */
export function setCurrentWeights(weights) {
    if (!validateWeights(weights)) {
        weights = normalizeWeights(weights);
    }
    currentWeights = { ...weights };
    lastRefresh = Date.now();
}
/**
 * Check if cache needs refresh
 */
export function needsRefresh() {
    return Date.now() - lastRefresh > REFRESH_INTERVAL;
}
/**
 * Force refresh weights from database
 */
export async function refreshWeights(prisma) {
    try {
        const config = await prisma.config.findUnique({
            where: { key: 'weights' },
        });
        if (config && config.value) {
            const weights = WeightSetSchema.parse(config.value);
            setCurrentWeights(weights);
            return weights;
        }
    }
    catch (error) {
        console.error('[Weights] Failed to refresh from database:', error);
    }
    return currentWeights;
}
/**
 * Initialize weights on startup
 */
export async function initializeWeights(prisma) {
    console.log('[Weights] Initializing weight system...');
    const config = await prisma.config.findUnique({
        where: { key: 'weights' },
    });
    if (config) {
        const weights = WeightSetSchema.parse(config.value);
        setCurrentWeights(weights);
        console.log('[Weights] Loaded from database:', weights);
    }
    else {
        // Initialize with defaults
        await prisma.config.create({
            data: {
                key: 'weights',
                value: DEFAULT_WEIGHTS,
            },
        });
        setCurrentWeights(DEFAULT_WEIGHTS);
        console.log('[Weights] Initialized with defaults');
    }
}
