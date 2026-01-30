/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Sigmoid function for smooth normalization
 */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Safe division that returns 0 if denominator is 0
 */
export function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Normalize a value using percentile thresholds
 * Maps values between p10 and p90 to range [0, 1]
 */
export function normalizePercentile(x: number, p10: number, p90: number): number {
  if (p90 === p10) return 0.5;
  return clamp((x - p10) / (p90 - p10), 0, 1);
}

/**
 * Normalize a value using min-max scaling
 */
export function normalizeMinMax(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

/**
 * Normalize a value using sigmoid scaling
 */
export function normalizeSigmoid(value: number, center: number = 0, scale: number = 1): number {
  return sigmoid((value - center) / scale);
}

/**
 * Calculate days between two dates
 */
export function daysBetween(date1: Date | string, date2: Date | string): number {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return diffMs / (1000 * 60 * 60 * 24);
}

/**
 * Calculate seconds between two dates
 */
export function secondsBetween(date1: Date | string, date2: Date | string): number {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  return Math.abs(d1.getTime() - d2.getTime()) / 1000;
}

/**
 * Format a number as USD currency
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a probability (0-1) as a percentage
 */
export function formatProbability(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

/**
 * Get risk level from IRS score
 */
export function getRiskLevel(irs: number): 'neutral' | 'watch' | 'high' | 'critical' {
  if (irs >= 75) return 'critical';
  if (irs >= 50) return 'high';
  if (irs >= 20) return 'watch';
  return 'neutral';
}

/**
 * Get risk color for UI
 */
export function getRiskColor(
  irs: number
): 'gray' | 'yellow' | 'orange' | 'red' | 'slate' | 'amber' | 'rose' {
  if (irs >= 75) return 'red';
  if (irs >= 50) return 'orange';
  if (irs >= 20) return 'yellow';
  return 'gray';
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Truncate an Ethereum address for display
 */
export function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Format a date as a relative time string
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = diffMs / 1000;

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return d.toLocaleDateString();
}

