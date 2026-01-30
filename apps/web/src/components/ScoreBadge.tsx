'use client';

import { Badge } from './ui/badge';
import { getRiskLevel } from '@phoenix/shared';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const level = getRiskLevel(score);

  const colors = {
    neutral: 'bg-slate-100 text-slate-800 border-slate-300',
    watch: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    high: 'bg-orange-100 text-orange-800 border-orange-300',
    critical: 'bg-red-100 text-red-800 border-red-300',
  };

  const labels = {
    neutral: 'Neutral',
    watch: 'Watch',
    high: 'High Risk',
    critical: 'Critical',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  return (
    <Badge className={`${colors[level]} ${sizeClasses[size]} font-semibold`}>
      {labels[level]} {score}
    </Badge>
  );
}

