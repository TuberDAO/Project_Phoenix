'use client';

import { useState, useEffect } from 'react';
import { Badge } from './ui/badge';

interface LastFetchBadgeProps {
  /** ISO string or Date object representing the last fetch time */
  timestamp: Date | string | null;
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Client-only badge component for displaying "Last fetch:" time.
 * 
 * This component avoids hydration mismatch by:
 * 1. Rendering a placeholder until after the first client render
 * 2. Using consistent 24-hour time format (HH:MM:SS)
 * 
 * The useEffect hook ensures the time is only rendered client-side,
 * preventing "Text content does not match server-rendered HTML" errors.
 */
export function LastFetchBadge({ timestamp, className }: LastFetchBadgeProps) {
  const [mounted, setMounted] = useState(false);
  const [formattedTime, setFormattedTime] = useState<string>('--:--:--');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !timestamp) {
      setFormattedTime('--:--:--');
      return;
    }

    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    
    // Use consistent 24-hour format to avoid locale differences
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    setFormattedTime(`${hours}:${minutes}:${seconds}`);
  }, [mounted, timestamp]);

  // Always render the same structure to avoid layout shift
  return (
    <Badge variant="secondary" className={className}>
      Last fetch: {formattedTime}
    </Badge>
  );
}

/**
 * Utility function to format datetime consistently for client-side rendering.
 * Use this for other datetime displays that need hydration safety.
 * 
 * @param isoString - ISO date string
 * @param mounted - Whether the component has mounted (from useEffect)
 * @returns Formatted datetime string or placeholder
 */
export function formatDateTimeSafe(isoString: string | null | undefined, mounted: boolean): string {
  if (!mounted || !isoString) {
    return '--';
  }

  try {
    const date = new Date(isoString);
    
    // Use consistent format: YYYY-MM-DD HH:MM:SS
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return isoString;
  }
}
