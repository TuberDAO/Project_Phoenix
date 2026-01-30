'use client';

import { useState, useEffect } from 'react';
import { useWeights, useUpdateWeights } from '@/lib/hooks/useApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/use-toast';

export default function SettingsPage() {
  const { data: weightsData, isLoading } = useWeights();
  const updateWeights = useUpdateWeights();
  const { toast } = useToast();

  const [weights, setWeights] = useState({
    stakeImpact: 0.30,
    temporal: 0.25,
    history: 0.20,
    evasion: 0.15,
    context: 0.10,
  });

  useEffect(() => {
    if (weightsData?.current) {
      setWeights(weightsData.current);
    }
  }, [weightsData]);

  const handleSliderChange = (key: string, value: number[]) => {
    setWeights(prev => ({ ...prev, [key]: value[0] }));
  };

  const handleSave = async () => {
    try {
      await updateWeights.mutateAsync({ weights });
      toast({
        title: 'Success',
        description: 'Weights updated successfully. New scores will use these weights.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update weights',
        variant: 'destructive',
      });
    }
  };

  const handlePreset = async (preset: string) => {
    try {
      await updateWeights.mutateAsync({ preset });
      toast({
        title: 'Success',
        description: `Applied ${preset} preset successfully.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to apply preset',
        variant: 'destructive',
      });
    }
  };

  const handleReset = async () => {
    try {
      await updateWeights.mutateAsync({ preset: 'default' });
      toast({
        title: 'Success',
        description: 'Reset to default weights.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset weights',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <p>Loading...</p>
      </div>
    );
  }

  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const isValid = Math.abs(sum - 1.0) < 0.01;

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Scoring Weight Configuration</h1>
      <p className="text-muted-foreground mb-8">
        Adjust the importance of each component in the Insider Risk Score (IRS) calculation.
        Weights must sum to 1.0.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current Weights</CardTitle>
          <CardDescription>
            Live tuning without redeployment. Changes affect new scores immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stake Impact */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium">Stake Impact</label>
              <span className="text-sm text-muted-foreground">
                {(weights.stakeImpact * 100).toFixed(1)}%
              </span>
            </div>
            <Slider
              value={[weights.stakeImpact]}
              onValueChange={(v) => handleSliderChange('stakeImpact', v)}
              min={0}
              max={1}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Fraction of pool, z-score bet size, delta prob
            </p>
          </div>

          {/* Temporal */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium">Temporal/Event Proximity</label>
              <span className="text-sm text-muted-foreground">
                {(weights.temporal * 100).toFixed(1)}%
              </span>
            </div>
            <Slider
              value={[weights.temporal]}
              onValueChange={(v) => handleSliderChange('temporal', v)}
              min={0}
              max={1}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Time to resolution, pre-announcement, oracle proximity
            </p>
          </div>

          {/* History */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium">Wallet/Cluster History</label>
              <span className="text-sm text-muted-foreground">
                {(weights.history * 100).toFixed(1)}%
              </span>
            </div>
            <Slider
              value={[weights.history]}
              onValueChange={(v) => handleSliderChange('history', v)}
              min={0}
              max={1}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground mt-1">
              New wallet flag, bet count, aggregate volume
            </p>
          </div>

          {/* Evasion */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium">Evasion/Urgency</label>
              <span className="text-sm text-muted-foreground">
                {(weights.evasion * 100).toFixed(1)}%
              </span>
            </div>
            <Slider
              value={[weights.evasion]}
              onValueChange={(v) => handleSliderChange('evasion', v)}
              min={0}
              max={1}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Gas priority, fan-in count, funding gap
            </p>
          </div>

          {/* Context */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium">Market Microstructure</label>
              <span className="text-sm text-muted-foreground">
                {(weights.context * 100).toFixed(1)}%
              </span>
            </div>
            <Slider
              value={[weights.context]}
              onValueChange={(v) => handleSliderChange('context', v)}
              min={0}
              max={1}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Marketable order, slippage, book imbalance, first mover
            </p>
          </div>

          {/* Sum validation */}
          <div className="pt-4 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total:</span>
              <span className={`text-sm ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                {(sum * 100).toFixed(1)}% {isValid ? '✓' : '⚠ Must equal 100%'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-4 mb-6">
        <Button
          onClick={handleSave}
          disabled={!isValid || updateWeights.isPending}
          className="flex-1"
        >
          {updateWeights.isPending ? 'Saving...' : 'Save Custom Weights'}
        </Button>
        <Button
          onClick={handleReset}
          variant="outline"
          disabled={updateWeights.isPending}
        >
          Reset to Default
        </Button>
      </div>

      {/* Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Presets</CardTitle>
          <CardDescription>
            Quick presets for different detection strategies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              onClick={() => handlePreset('strict')}
              disabled={updateWeights.isPending}
              className="flex flex-col h-auto p-4"
            >
              <span className="font-semibold mb-1">Strict</span>
              <span className="text-xs text-muted-foreground">
                Emphasizes temporal & evasion
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={() => handlePreset('balanced')}
              disabled={updateWeights.isPending}
              className="flex flex-col h-auto p-4"
            >
              <span className="font-semibold mb-1">Balanced</span>
              <span className="text-xs text-muted-foreground">
                Equal distribution (20% each)
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={() => handlePreset('lenient')}
              disabled={updateWeights.isPending}
              className="flex flex-col h-auto p-4"
            >
              <span className="font-semibold mb-1">Lenient</span>
              <span className="text-xs text-muted-foreground">
                Reduces evasion & temporal
              </span>
            </Button>
          </div>

          {weightsData?.presets && (
            <div className="mt-6 text-xs space-y-2">
              <p className="font-semibold">Preset Details:</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="font-medium">Strict:</p>
                  <p>Stake: 25%, Temporal: 30%, History: 15%, Evasion: 20%, Context: 10%</p>
                </div>
                <div>
                  <p className="font-medium">Balanced:</p>
                  <p>All components: 20%</p>
                </div>
                <div>
                  <p className="font-medium">Lenient:</p>
                  <p>Stake: 35%, Temporal: 20%, History: 25%, Evasion: 10%, Context: 10%</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

