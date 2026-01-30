import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreBadge } from '@/components/ScoreBadge';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatUSD, formatRelativeTime, truncateAddress } from '@phoenix/shared';
import { Wallet, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface PageProps {
  params: {
    address: string;
  };
}

async function getWalletData(address: string) {
  try {
    const data = await api.getWallet(address);
    return data;
  } catch (error) {
    console.error('Failed to fetch wallet data:', error);
    return null;
  }
}

export default async function WalletPage({ params }: PageProps) {
  const data = await getWalletData(params.address);

  if (!data || !data.wallet) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-lg text-slate-600">Wallet not found</p>
          <Link href="/" className="text-blue-600 hover:underline mt-2 inline-block">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { wallet, recentBets, recentScores } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-3">
          <Wallet className="h-8 w-8 text-slate-600" />
          <h1 className="text-3xl font-bold text-slate-900 font-mono">
            {truncateAddress(wallet.address)}
          </h1>
        </div>
        <p className="mt-2 text-slate-600">Wallet Profile</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>ROI (30d)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              {wallet.roi30d >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-600" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600" />
              )}
              <span
                className={`text-2xl font-bold ${
                  wallet.roi30d >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {(wallet.roi30d * 100).toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Win Rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {(wallet.winRateRolling * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Bets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{recentBets.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Status</CardDescription>
          </CardHeader>
          <CardContent>
            {wallet.newWalletFlag ? (
              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
                New Wallet
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-800 border-green-300">
                Established
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Scores */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Risk Scores</CardTitle>
          <CardDescription>Insider Risk Scores for recent bets</CardDescription>
        </CardHeader>
        <CardContent>
          {recentScores.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No scores available</p>
          ) : (
            <div className="space-y-4">
              {recentScores.map((score: any) => (
                <div
                  key={score.id}
                  className="flex items-start justify-between border-b border-slate-200 pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex-1">
                    <Link
                      href={`/market/${score.marketId}`}
                      className="font-medium text-blue-600 hover:underline line-clamp-1"
                    >
                      {score.market.question}
                    </Link>
                    <p className="text-sm text-slate-600 mt-1">
                      {formatRelativeTime(score.createdAt)}
                    </p>
                  </div>
                  <div className="ml-4">
                    <ScoreBadge score={score.irsBet} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Bets */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Bets</CardTitle>
          <CardDescription>Latest betting activity</CardDescription>
        </CardHeader>
        <CardContent>
          {recentBets.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No bets found</p>
          ) : (
            <div className="space-y-4">
              {recentBets.map((bet: any) => (
                <div
                  key={bet.id}
                  className="border-b border-slate-200 pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Link
                        href={`/market/${bet.marketId}`}
                        className="font-medium text-blue-600 hover:underline line-clamp-1"
                      >
                        {bet.market.question}
                      </Link>
                      <div className="mt-2 flex items-center space-x-4 text-sm text-slate-600">
                        <span className="font-semibold">{formatUSD(Number(bet.betUsd))}</span>
                        <span>•</span>
                        <span>Outcome: {bet.outcomeId}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(bet.timestamp)}</span>
                      </div>
                    </div>
                    {bet.gasPriorityFlag && (
                      <Badge className="ml-4 bg-orange-100 text-orange-800 border-orange-300">
                        High Gas
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

