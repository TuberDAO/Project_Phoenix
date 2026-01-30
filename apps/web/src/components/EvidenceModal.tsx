'use client';

import { useEvidence } from '@/lib/hooks/useApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EvidenceModalProps {
  betId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EvidenceModal({ betId, open, onOpenChange }: EvidenceModalProps) {
  const { data, isLoading } = useEvidence(betId || '');

  if (!betId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Evidence Snapshot</DialogTitle>
          <DialogDescription>
            Detailed evidence for bet {betId}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-muted-foreground">Loading...</p>}

        {data && (
          <ScrollArea className="h-[60vh]">
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Wallet</p>
                  <p className="font-mono text-sm">{data.wallet}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Market ID</p>
                  <p className="font-mono text-sm">{data.marketId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">IRS</p>
                  <p className="text-2xl font-bold">{data.irs}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Timestamp</p>
                  <p className="text-sm">{new Date(data.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Chips */}
              {data.chips && (
                <div>
                  <h3 className="font-semibold mb-2">Risk Indicators</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.chips.marketable && (
                      <Badge variant="default">Marketable Order</Badge>
                    )}
                    {data.chips.lowLiquidity && (
                      <Badge variant="destructive">Low Liquidity</Badge>
                    )}
                    {data.chips.oracleNear && (
                      <Badge variant="destructive">Oracle &lt;1h</Badge>
                    )}
                    {data.chips.finalHour && (
                      <Badge variant="destructive">Final Hour</Badge>
                    )}
                    {data.chips.chatterLull && (
                      <Badge variant="secondary">Chatter Lull</Badge>
                    )}
                    {data.chips.burst && (
                      <Badge variant="default">Burst</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Components */}
              {data.components && (
                <div>
                  <h3 className="font-semibold mb-2">Score Components</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(data.components).map(([key, value]) => (
                      <div key={key} className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-mono">{(value as number).toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw JSON */}
              <div>
                <h3 className="font-semibold mb-2">Raw Data</h3>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

