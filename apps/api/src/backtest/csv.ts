import { z } from 'zod';

/**
 * CSV parser for backtest data.
 */

const CsvBetSchema = z.object({
  betId: z.string().optional(),
  marketId: z.string(),
  wallet: z.string(),
  timestamp: z.string(), // ISO or epoch
  betUsd: z.number().or(z.string().transform(Number)),
  impliedBefore: z.number().or(z.string().transform(Number)).optional(),
  impliedAfter: z.number().or(z.string().transform(Number)).optional(),
  fractionOfPool: z.number().or(z.string().transform(Number)).optional(),
  zScoreSize: z.number().or(z.string().transform(Number)).optional(),
  gasPriorityFlag: z.boolean().or(z.string().transform(s => s === 'true')).optional(),
});

export type CsvBet = z.infer<typeof CsvBetSchema>;

/**
 * Parse CSV content into bet objects
 */
export function parseCsv(csvContent: string): CsvBet[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least header and one data row');
  }
  
  const headers = lines[0].split(',').map(h => h.trim());
  const bets: CsvBet[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: Record<string, any> = {};
    
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j];
    }
    
    try {
      const bet = CsvBetSchema.parse(row);
      bets.push(bet);
    } catch (error) {
      console.warn(`[CSV] Failed to parse row ${i}:`, error);
    }
  }
  
  return bets;
}

/**
 * Convert bets to CSV format
 */
export function toCsv(bets: any[]): string {
  if (bets.length === 0) return '';
  
  const headers = Object.keys(bets[0]);
  const rows = [headers.join(',')];
  
  for (const bet of bets) {
    const values = headers.map(h => {
      const val = bet[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return String(val);
    });
    rows.push(values.join(','));
  }
  
  return rows.join('\n');
}

