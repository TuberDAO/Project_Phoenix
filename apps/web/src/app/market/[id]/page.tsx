import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreBadge } from '@/components/ScoreBadge';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatUSD, formatRelativeTime, truncateAddress } from '@phoenix/shared';
import { TrendingUp, Clock, AlertCircle } from 'lucide-react';

interface PageProps {
  params: {
    id: string;
  };
}

async function getMarketData(id: string) {
  try {
    const data = await api.getMarket(id);
    return data;
  } catch (error) {
    console.error('Failed to fetch market data:', error);
    return null;
  }
}

export default async function MarketPage({ params }: PageProps) {
  const market = await getMarketData(params.id);

  if (!market) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-lg text-slate-600">Market not found</p>
          <Link href="/" className="text-blue-600 hover:underline mt-2 inline-block">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    open: 'bg-green-100 text-green-800 border-green-300',
    closed: 'bg-slate-100 text-slate-800 border-slate-300',
    resolved: 'bg-blue-100 text-blue-800 border-blue-300',
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">{market.question}</h1>
            <div className="mt-3 flex items-center space-x-4">
              <Badge className={statusColors[market.status] || statusColors.open}>
                {market.status.toUpperCase()}
              </Badge>
              {market.category && (
                <span className="text-sm text-slate-600 px-3 py-1 bg-slate-100 rounded">
                  {market.category}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Market Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span>Created</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {new Date(market.createdAt).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span>Closes</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {new Date(market.closesAt).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <span>Total Bets</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{market.bets?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Mock Odds Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Probability Over Time</CardTitle>
          <CardDescription>Market odds history (mock data)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center bg-slate-50 rounded border border-slate-200">
            <div className="text-center text-slate-500">
              <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Chart visualization would render here</p>
              <p className="text-sm mt-1">Integration with charting library (e.g., Recharts)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Bets */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Bets</CardTitle>
          <CardDescription>Latest betting activity on this market</CardDescription>
        </CardHeader>
        <CardContent>
          {!market.bets || market.bets.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No bets found</p>
          ) : (
            <div className="space-y-4">
              {market.bets.map((bet: any) => (
                <div
                  key={bet.id}
                  className="flex items-start justify-between border-b border-slate-200 pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <Link
                        href={`/wallet/${bet.wallet}`}
                        className="font-mono text-blue-600 hover:underline"
                      >
                        {truncateAddress(bet.wallet)}
                      </Link>
                      <span className="text-sm text-slate-600">→ {bet.outcomeId}</span>
                    </div>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-slate-600">
                      <span className="font-semibold">{formatUSD(Number(bet.betUsd))}</span>
                      <span>•</span>
                      <span>Δ{(bet.deltaProb * 100).toFixed(1)}%</span>
                      <span>•</span>
                      <span>{formatRelativeTime(bet.timestamp)}</span>
                      {bet.gasPriorityFlag && (
                        <>
                          <span>•</span>
                          <span className="text-orange-600 flex items-center">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            High Gas
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {bet.score && (
                    <div className="ml-4">
                      <ScoreBadge score={bet.score.irsBet} size="sm" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* News Events */}
      {market.newsEvents && market.newsEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related News</CardTitle>
            <CardDescription>News events related to this market</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {market.newsEvents.map((news: any) => (
                <div key={news.id} className="border-b border-slate-200 pb-3 last:border-0">
                  <a
                    href={news.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {news.headline}
                  </a>
                  <div className="mt-1 flex items-center space-x-3 text-sm text-slate-600">
                    <span>{news.source}</span>
                    <span>•</span>
                    <span>{formatRelativeTime(news.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

