/**
 * Mood Ring — derives a subtle gradient color for memo cards
 * based on contextual metadata (time of day, weather, pressure).
 *
 * The colors are inspired by how the sky/atmosphere actually looks:
 * - Morning: warm amber/gold
 * - Afternoon: clear sky blue
 * - Evening: dusky purple/rose
 * - Night: deep indigo
 *
 * Weather and pressure shift the hue:
 * - Rain/clouds → cooler/bluer
 * - Clear/sunny → warmer
 * - High pressure → brighter
 * - Low pressure → muted/darker
 */

import type { MemoMetadata } from './metadata';

type MoodColor = {
  /** Primary gradient color (left/top) */
  from: string;
  /** Secondary gradient color (right/bottom) */
  to: string;
  /** Subtle border tint */
  border: string;
};

// Base palettes by time of day
const TIME_PALETTES: Record<string, MoodColor> = {
  morning: {
    from: 'rgba(251, 191, 36, 0.15)',  // amber
    to: 'rgba(245, 158, 11, 0.08)',     // warm gold
    border: 'rgba(251, 191, 36, 0.25)',
  },
  afternoon: {
    from: 'rgba(56, 189, 248, 0.12)',   // sky blue
    to: 'rgba(99, 102, 241, 0.08)',     // soft indigo
    border: 'rgba(56, 189, 248, 0.2)',
  },
  evening: {
    from: 'rgba(168, 85, 247, 0.12)',   // purple
    to: 'rgba(236, 72, 153, 0.08)',     // rose
    border: 'rgba(168, 85, 247, 0.2)',
  },
  night: {
    from: 'rgba(67, 56, 202, 0.15)',    // deep indigo
    to: 'rgba(30, 27, 75, 0.1)',        // near black blue
    border: 'rgba(67, 56, 202, 0.2)',
  },
};

// Weather condition shifts
const WEATHER_SHIFTS: Record<string, { cool: number; warm: number }> = {
  Clear: { cool: 0, warm: 0.3 },
  Clouds: { cool: 0.2, warm: 0 },
  Rain: { cool: 0.4, warm: 0 },
  Drizzle: { cool: 0.3, warm: 0 },
  Thunderstorm: { cool: 0.5, warm: 0 },
  Snow: { cool: 0.3, warm: 0.1 },
  Mist: { cool: 0.1, warm: 0 },
  Fog: { cool: 0.15, warm: 0 },
};

function blendColor(base: string, shift: string, amount: number): string {
  // Simple alpha blend — just reduce base alpha proportionally
  // and let the shift influence through opacity
  if (amount <= 0) return base;
  const alphaMatch = base.match(/[\d.]+\)$/);
  if (!alphaMatch) return base;
  const currentAlpha = parseFloat(alphaMatch[0]);
  const newAlpha = Math.max(0.04, currentAlpha * (1 + amount * 0.5));
  return base.replace(/[\d.]+\)$/, `${newAlpha.toFixed(3)})`);
}

/**
 * Get mood ring colors for a memo based on its metadata.
 * Returns null if no metadata is available.
 */
export function getMoodColors(metadata: MemoMetadata | null): MoodColor | null {
  if (!metadata) return null;

  const period = metadata.dayPeriod || 'morning';
  const palette = TIME_PALETTES[period] ?? TIME_PALETTES.morning;
  const base = { ...palette };

  // Apply weather shift
  if (metadata.weather?.conditions) {
    const shift = WEATHER_SHIFTS[metadata.weather.conditions];
    if (shift) {
      if (shift.cool > 0) {
        // Cool shift — make border bluer
        base.from = blendColor(base.from, 'cool', shift.cool);
      }
      if (shift.warm > 0) {
        // Warm shift — boost opacity slightly
        base.from = blendColor(base.from, 'warm', shift.warm);
        base.to = blendColor(base.to, 'warm', shift.warm);
      }
    }
  }

  // Pressure influence on brightness
  if (metadata.pressure?.hPa) {
    const hPa = metadata.pressure.hPa;
    if (hPa > 1020) {
      // High pressure — slightly brighter/more saturated
      base.border = base.border.replace(/[\d.]+\)$/, '0.3)');
    } else if (hPa < 1005) {
      // Low pressure — more muted
      base.border = base.border.replace(/[\d.]+\)$/, '0.12)');
    }
  }

  return base;
}

/**
 * Get a single mood accent color (for simpler use cases like dots or badges)
 */
export function getMoodAccent(metadata: MemoMetadata | null): string | null {
  if (!metadata) return null;

  switch (metadata.dayPeriod) {
    case 'morning': return '#fbbf24';
    case 'afternoon': return '#38bdf8';
    case 'evening': return '#a855f7';
    case 'night': return '#4338ca';
    default: return '#7c6bf5';
  }
}
