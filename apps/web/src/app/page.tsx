'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAlerts } from '@/lib/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScoreBadge } from '@/components/ScoreBadge';
import { EvidenceModal } from '@/components/EvidenceModal';
import { LastFetchBadge, formatDateTimeSafe } from '@/components/LastFetchBadge';
import { RefreshCw, Activity, Database } from 'lucide-react';


export default function Home() {
  // Filter state
  const [dateRange, setDateRange] = useState('7d');
  const [minIrs, setMinIrs] = useState(75);
  const [category, setCategory] = useState<string>('all');
  const [selectedBetId, setSelectedBetId] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  // Initialize as null to avoid SSR/client mismatch
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Track if component has mounted (client-side)
  const [mounted, setMounted] = useState(false);

  // Set mounted flag and initial time on client only
  useEffect(() => {
    setMounted(true);
    setLastFetchTime(new Date());
  }, []);

  // Build filter params - use stable date calculation
  const filterParams = useMemo(() => {
    const params: any = { minIrs, limit: 50 };
    
    // Compute 'from' as NOW minus the selected range
    const now = Date.now();
    let fromMs: number | null = null;
    if (dateRange === '24h') {
      fromMs = now - 24 * 60 * 60 * 1000;
    } else if (dateRange === '7d') {
      fromMs = now - 7 * 24 * 60 * 60 * 1000;
    } else if (dateRange === '30d') {
      fromMs = now - 30 * 24 * 60 * 60 * 1000;
    }

    // Clamp 'from' to be at least 60s before now to avoid zero-length windows
    if (fromMs !== null) {
      const minFrom = now - 60 * 1000;
      if (fromMs > minFrom) {
        fromMs = minFrom;
      }
      params.from = new Date(fromMs).toISOString();
    }

    if (category && category !== 'all') {
      params.category = category;
    }
    
    return params;
  }, [minIrs, dateRange, category]);

  const { data, isLoading, refetch } = useAlerts(filterParams);
  const alerts = data?.data || [];
  const irsDistribution = calculateIrsDistribution(alerts);

  // Manual refresh
  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    setLastFetchTime(new Date());
    refetch();
  };

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setLastFetchTime(new Date());
        refetch();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [refetch]);

  // Update last fetch time when data changes
  useEffect(() => {
    if (!isLoading && data) {
      setLastFetchTime(new Date());
    }
  }, [isLoading, data]);

  const handleRowClick = (betId: string) => {
    setSelectedBetId(betId);
    setEvidenceOpen(true);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        
        {/* Status Bar */}
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3 text-green-500" />
            API: Connected
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Database className="h-3 w-3 text-blue-500" />
            Worker: Running
          </Badge>
          <LastFetchBadge timestamp={lastFetchTime} className="gap-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>High-Risk Bets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.meta?.count || 0}</div>
            <p className="text-sm text-muted-foreground">IRS ≥ {minIrs} ({dateRange})</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Critical Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {alerts.filter((a: any) => a.irsBet >= 80).length}
            </div>
            <p className="text-sm text-muted-foreground">IRS ≥ 80</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avg IRS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {alerts.length > 0
                ? Math.round(alerts.reduce((sum: number, a: any) => sum + a.irsBet, 0) / alerts.length)
                : 0}
            </div>
            <p className="text-sm text-muted-foreground">Mean risk score</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Date Range */}
            <div>
              <label className="text-sm font-medium mb-2 block">Date Range</label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days (default)</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min IRS */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Min IRS: {minIrs}
              </label>
              <Slider
                value={[minIrs]}
                onValueChange={(v) => setMinIrs(v[0])}
                min={0}
                max={100}
                step={5}
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Crypto">Crypto</SelectItem>
                  <SelectItem value="AI">AI</SelectItem>
                  <SelectItem value="Economics">Economics</SelectItem>
                  <SelectItem value="Technology">Technology</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setDateRange('7d');
                  setMinIrs(75);
                  setCategory('all');
                }}
                className="w-full"
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* High-Risk Bets Table */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>High-Risk Bets</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">Loading high-risk bets...</p>
              </div>
            </div>
          )}
          
          {/* Empty State */}
          {!isLoading && alerts.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="text-4xl">📭</div>
              <p className="text-lg font-medium">No high-risk bets in this window</p>
              <p className="text-sm text-muted-foreground">
                Try widening the date range or lowering the Min IRS threshold.
              </p>
              <div className="flex gap-2 justify-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDateRange('30d')}
                >
                  Switch to 30 days
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMinIrs(50)}
                >
                  Lower IRS to 50
                </Button>
              </div>
            </div>
          )}

          {/* Data Table */}
          {!isLoading && alerts.length > 0 && (
            <div className="space-y-3">
              {alerts.map((alert: any) => (
                <div
                  key={alert.id}
                  onClick={() => handleRowClick(alert.betId)}
                  className="flex items-center justify-between border-b pb-3 hover:bg-accent cursor-pointer p-2 rounded transition-colors"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{alert.market?.question || 'Unknown'}</p>
                      {alert.market?.category && (
                        <Badge variant="outline" className="text-xs">
                          {alert.market.category}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTimeSafe(alert.createdAt, mounted)} • {alert.wallet.substring(0, 10)}... 
                      {alert.betDetails && ` • $${alert.betDetails.betUsd.toLocaleString()}`}
                    </p>
                    <div className="flex gap-1 flex-wrap">
                      {alert.chips?.marketable && <Badge variant="default" className="text-xs">Marketable</Badge>}
                      {alert.chips?.lowLiquidity && <Badge variant="destructive" className="text-xs">Low Liq</Badge>}
                      {alert.chips?.oracleNear && <Badge variant="destructive" className="text-xs">Oracle&lt;1h</Badge>}
                      {alert.chips?.finalHour && <Badge variant="destructive" className="text-xs">Final Hour</Badge>}
                      {alert.chips?.chatterLull && <Badge variant="secondary" className="text-xs">Chatter Lull</Badge>}
                      {alert.chips?.burst && <Badge variant="default" className="text-xs">Burst</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {alert.betDetails && (
                      <div className="text-right text-xs">
                        <div>ΔProb: {(alert.betDetails.deltaProb * 100).toFixed(1)}%</div>
                        <div className="text-muted-foreground">
                          ${alert.betDetails.betUsd.toLocaleString()}
                        </div>
                      </div>
                    )}
                    <ScoreBadge score={alert.irsBet} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* IRS Histogram */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>IRS Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-end gap-2">
              {irsDistribution.map((bin, i) => {
                const maxCount = Math.max(...irsDistribution.map(b => b.count));
                const height = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
                
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end items-center gap-1">
                    <div className="text-xs text-center">{bin.count}</div>
                    <div
                      className="w-full bg-primary rounded-t"
                      style={{ height: `${height}%` }}
                    />
                    <div className="text-xs text-muted-foreground">{bin.label}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evidence Modal */}
      <EvidenceModal
        betId={selectedBetId}
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
      />
    </div>
  );
}

function calculateIrsDistribution(alerts: any[]) {
  const bins = [
    { label: '0-19', min: 0, max: 19, count: 0 },
    { label: '20-49', min: 20, max: 49, count: 0 },
    { label: '50-74', min: 50, max: 74, count: 0 },
    { label: '75-89', min: 75, max: 89, count: 0 },
    { label: '90-100', min: 90, max: 100, count: 0 },
  ];

  alerts.forEach((alert: any) => {
    const irs = alert.irsBet;
    for (const bin of bins) {
      if (irs >= bin.min && irs <= bin.max) {
        bin.count++;
        break;
      }
    }
  });

  return bins;
}
