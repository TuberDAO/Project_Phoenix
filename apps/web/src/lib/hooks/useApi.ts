import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

/**
 * React Query hooks for Project Phoenix API
 */

// ==================== Weights ====================

export function useWeights() {
  return useQuery({
    queryKey: ['weights'],
    queryFn: async () => {
      const response = await api.get('/config/weights');
      return response.data;
    },
  });
}

export function useUpdateWeights() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { weights?: any; preset?: string }) => {
      const response = await api.post('/config/weights', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weights'] });
    },
  });
}

// ==================== Alerts ====================

interface AlertsParams {
  minIrs?: number;
  from?: string;
  to?: string;
  category?: string;
  cursor?: string;
  limit?: number;
}

export function useAlerts(params: AlertsParams = {}) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  return useQuery({
    queryKey: ['alerts', params],
    queryFn: async () => {
      const response = await api.get(`/alerts${queryString ? `?${queryString}` : ''}`);
      return response.data;
    },
  });
}

// ==================== Markets ====================

export function useMarkets(params: { status?: string; limit?: number; cursor?: string } = {}) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  return useQuery({
    queryKey: ['markets', params],
    queryFn: async () => {
      const response = await api.get(`/markets${queryString ? `?${queryString}` : ''}`);
      return response.data;
    },
  });
}

export function useMarketBets(marketId: string, params: { from?: string; to?: string; limit?: number } = {}) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  return useQuery({
    queryKey: ['market-bets', marketId, params],
    queryFn: async () => {
      const response = await api.get(`/markets/${marketId}/bets${queryString ? `?${queryString}` : ''}`);
      return response.data;
    },
    enabled: !!marketId,
  });
}

// ==================== Wallets ====================

export function useWalletScores(address: string, params: { from?: string; to?: string; limit?: number } = {}) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  return useQuery({
    queryKey: ['wallet-scores', address, params],
    queryFn: async () => {
      const response = await api.get(`/wallets/${address}/scores${queryString ? `?${queryString}` : ''}`);
      return response.data;
    },
    enabled: !!address,
  });
}

// ==================== Backtest ====================

export function useBacktestRun() {
  return useMutation({
    mutationFn: async (data: { from: string; to: string; minIrs?: number; weightsPreset?: string }) => {
      const response = await api.post('/backtest/run', data);
      return response.data;
    },
  });
}

export function useLastBacktest() {
  return useQuery({
    queryKey: ['backtest-last'],
    queryFn: async () => {
      const response = await api.get('/backtest/last');
      return response.data;
    },
    retry: false,
  });
}

// ==================== Evidence ====================

export function useEvidence(betId: string) {
  return useQuery({
    queryKey: ['evidence', betId],
    queryFn: async () => {
      const response = await api.get(`/audit/evidence/${betId}`);
      return response.data;
    },
    enabled: !!betId,
  });
}

// ==================== Audit ====================

export function useAuditLogs(params: { type?: string; from?: string; to?: string; limit?: number } = {}) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  return useQuery({
    queryKey: ['audit', params],
    queryFn: async () => {
      const response = await api.get(`/audit${queryString ? `?${queryString}` : ''}`);
      return response.data;
    },
  });
}

