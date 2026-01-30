'use client';

import { useState } from 'react';
import { useBacktestRun, useLastBacktest } from '@/lib/hooks/useApi';
import { exportAlerts, exportReport, downloadFile } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

export default function BacktestPage() {
  const { data: lastResult } = useLastBacktest();
  const runBacktest = useBacktestRun();
  const { toast } = useToast();

  const [from, setFrom] = useState('2024-01-01');
  const [to, setTo] = useState('2024-01-31');
  const [minIrs, setMinIrs] = useState(75);
  const [preset, setPreset] = useState<string>('default');
  const [result, setResult] = useState<any>(null);

  const handleRunBacktest = async () => {
    try {
      const data = await runBacktest.mutateAsync({
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        minIrs,
        weightsPreset: preset as any,
      });

      setResult(data.metrics);
      toast({
        title: 'Success',
        description: 'Backtest completed successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Backtest failed',
        variant: 'destructive',
      });
    }
  };

  const handleExportCSV = async () => {
    try {
      const csv = await exportAlerts({ minIrs, from, to });
      downloadFile(csv, `backtest-${Date.now()}.csv`, 'text/csv');
      toast({
        title: 'Success',
        description: 'CSV exported successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Export failed',
        variant: 'destructive',
      });
    }
  };

  const handleExportPDF = async () => {
    try {
      const html = await exportReport({ from, to, minIrs });
      downloadFile(html, `backtest-report-${Date.now()}.html`, 'text/html');
      toast({
        title: 'Success',
        description: 'Report exported successfully (open in browser to print as PDF)',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Export failed',
        variant: 'destructive',
      });
    }
  };

  const displayResult = result || lastResult?.metrics;

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">Backtest</h1>
      <p className="text-muted-foreground mb-8">
        Run historical analysis on past bets to evaluate detection performance.
      </p>

      {/* Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Run Backtest</CardTitle>
          <CardDescription>
            Analyze historical data and compute precision, ROC, and lead time metrics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">From Date</label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">To Date</label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Min IRS Threshold</label>
              <Input
                type="number"
                value={minIrs}
                onChange={(e) => setMinIrs(parseInt(e.target.value))}
                min={0}
                max={100}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Weight Preset</label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="strict">Strict</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="lenient">Lenient</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleRunBacktest}
            disabled={runBacktest.isPending}
            className="w-full"
          >
            {runBacktest.isPending ? 'Running...' : 'Run Backtest'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {displayResult && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Bets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displayResult.totalBets}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">High Risk</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displayResult.highRiskBets}</div>
                <p className="text-xs text-muted-foreground">
                  {((displayResult.highRiskBets / displayResult.totalBets) * 100).toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Precision@20</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(displayResult.precisionAt20 * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">Top 20 accuracy</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Avg Lead Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round(displayResult.avgLeadTimeMinutes)}m
                </div>
                <p className="text-xs text-muted-foreground">Alert to close</p>
              </CardContent>
            </Card>
          </div>

          {/* Additional Metrics */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Precision@10</p>
                  <p className="text-lg font-semibold">
                    {(displayResult.precisionAt10 * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Precision@50</p>
                  <p className="text-lg font-semibold">
                    {(displayResult.precisionAt50 * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">ROC AUC (proxy)</p>
                  <p className="text-lg font-semibold">
                    {displayResult.rocAucProxy.toFixed(3)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* IRS Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>IRS Distribution</CardTitle>
                <CardDescription>Histogram of risk scores</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <HistogramChart data={displayResult.irsDistribution} />
                </div>
              </CardContent>
            </Card>

            {/* IRS Over Time */}
            <Card>
              <CardHeader>
                <CardTitle>IRS Over Time</CardTitle>
                <CardDescription>Timeline of scores</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <LineChart data={displayResult.irsOverTime} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Export Actions */}
          <div className="flex gap-4">
            <Button onClick={handleExportCSV} variant="outline" className="flex-1">
              Export CSV
            </Button>
            <Button onClick={handleExportPDF} variant="outline" className="flex-1">
              Export Report (HTML)
            </Button>
          </div>
        </>
      )}

      {!displayResult && lastResult && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No backtest has been run yet. Configure parameters and click "Run Backtest".
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Simple histogram using canvas
function HistogramChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) return <p className="text-muted-foreground">No data</p>;

  const maxCount = Math.max(...data.map(d => d.count));
  const barWidth = 100 / data.length;

  return (
    <div className="flex items-end h-full gap-2">
      {data.map((bin, i) => (
        <div key={i} className="flex-1 flex flex-col justify-end items-center gap-1">
          <div className="text-xs text-center">{bin.count}</div>
          <div
            className="w-full bg-primary rounded-t"
            style={{ height: `${(bin.count / maxCount) * 100}%` }}
          />
          <div className="text-xs text-muted-foreground">{bin.bin}</div>
        </div>
      ))}
    </div>
  );
}

// Simple line chart using SVG
function LineChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) return <p className="text-muted-foreground">No data</p>;

  const width = 600;
  const height = 200;
  const padding = 20;

  const maxIrs = Math.max(...data.map(d => d.irs));
  const minIrs = Math.min(...data.map(d => d.irs));

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((d.irs - minIrs) / (maxIrs - minIrs)) * (height - 2 * padding);
    return { x, y, irs: d.irs };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(val => {
        const y = height - padding - ((val - minIrs) / (maxIrs - minIrs)) * (height - 2 * padding);
        return (
          <g key={val}>
            <line
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.1"
            />
            <text x={5} y={y + 4} fontSize="10" fill="currentColor" opacity="0.5">
              {val}
            </text>
          </g>
        );
      })}

      {/* Line */}
      <path
        d={pathData}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary"
      />

      {/* Points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill="currentColor"
          className="text-primary"
        />
      ))}
    </svg>
  );
}

