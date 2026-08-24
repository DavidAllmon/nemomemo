import { describe, expect, it } from 'vitest';
import {
  anchorsToFilter,
  anniversaryAnchors,
  dayRange,
  localDayKey,
  monthRange,
  streakFrom,
} from './time-travel.js';

/** Local-time literals (no trailing Z) — these features live in the viewer's zone. */
const at = (iso: string) => new Date(iso);

describe('localDayKey', () => {
  it('formats the local calendar day', () => {
    expect(localDayKey(at('2026-08-24T13:45:00'))).toBe('2026-08-24');
  });

  it('pads single digits', () => {
    expect(localDayKey(at('2026-01-05T00:00:00'))).toBe('2026-01-05');
  });
});

describe('dayRange', () => {
  it('spans exactly one local day', () => {
    const { start, end } = dayRange('2026-08-24');
    expect(localDayKey(new Date(start * 1000))).toBe('2026-08-24');
    expect(localDayKey(new Date((end - 1) * 1000))).toBe('2026-08-24');
    expect(localDayKey(new Date(end * 1000))).toBe('2026-08-25');
  });
});

describe('monthRange', () => {
  it('covers the first instant of the month to the first of the next', () => {
    const { start, end } = monthRange(2026, 1); // February 2026
    expect(localDayKey(new Date(start * 1000))).toBe('2026-02-01');
    expect(localDayKey(new Date(end * 1000))).toBe('2026-03-01');
  });
});

describe('anniversaryAnchors', () => {
  it('offers months first, then years, newest first', () => {
    const anchors = anniversaryAnchors(at('2026-08-24T09:00:00'));
    expect(anchors.map((anchor) => anchor.key).slice(0, 4)).toEqual([
      '2026-07-24',
      '2026-05-24',
      '2026-02-24',
      '2025-08-24',
    ]);
    expect(anchors[0]!.label).toBe('A month ago');
    expect(anchors[1]!.label).toBe('3 months ago');
    expect(anchors[3]!.label).toBe('A year ago');
    expect(anchors.at(-1)!.label).toBe('10 years ago');
  });

  it('clamps to the end of a shorter month instead of spilling forward', () => {
    const anchors = anniversaryAnchors(at('2026-05-31T09:00:00'));
    expect(anchors[0]!.key).toBe('2026-04-30');
    expect(anchors[2]!.key).toBe('2025-11-30');
  });

  it('clamps a leap day to Feb 28 in common years', () => {
    const anchors = anniversaryAnchors(at('2028-02-29T09:00:00'));
    expect(anchors.find((anchor) => anchor.label === 'A year ago')!.key).toBe('2027-02-28');
  });

  it('gives every anchor a one-day range', () => {
    for (const anchor of anniversaryAnchors(at('2026-08-24T09:00:00'))) {
      expect(localDayKey(new Date(anchor.start * 1000))).toBe(anchor.key);
      expect(localDayKey(new Date((anchor.end - 1) * 1000))).toBe(anchor.key);
    }
  });
});

describe('anchorsToFilter', () => {
  it('ORs parenthesised half-open ranges', () => {
    const filter = anchorsToFilter([
      { key: 'a', label: 'A', start: 10, end: 20 },
      { key: 'b', label: 'B', start: 30, end: 40 },
    ]);
    expect(filter).toBe(
      '(created_ts >= 10 && created_ts < 20) || (created_ts >= 30 && created_ts < 40)',
    );
  });
});

describe('streakFrom', () => {
  const noonOn = (key: string) => dayRange(key).start + 12 * 3600;

  it('counts consecutive days ending today', () => {
    const stamps = ['2026-08-24', '2026-08-23', '2026-08-22'].map(noonOn);
    expect(streakFrom(stamps, at('2026-08-24T20:00:00'))).toEqual({ current: 3, longest: 3 });
  });

  it('keeps yesterday-anchored streaks alive before today is written', () => {
    const stamps = ['2026-08-23', '2026-08-22'].map(noonOn);
    expect(streakFrom(stamps, at('2026-08-24T09:00:00')).current).toBe(2);
  });

  it('breaks after a gap of two days', () => {
    const stamps = ['2026-08-21', '2026-08-20'].map(noonOn);
    expect(streakFrom(stamps, at('2026-08-24T09:00:00')).current).toBe(0);
  });

  it('ignores several memos written on the same day', () => {
    const stamps = [noonOn('2026-08-24'), noonOn('2026-08-24') + 60, noonOn('2026-08-23')];
    expect(streakFrom(stamps, at('2026-08-24T09:00:00')).current).toBe(2);
  });

  it('reports the longest run anywhere in history', () => {
    const stamps = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-08-24'].map(noonOn);
    expect(streakFrom(stamps, at('2026-08-24T09:00:00'))).toEqual({ current: 1, longest: 4 });
  });

  it('survives a spring-forward day (23 hours long)', () => {
    const stamps = ['2026-03-07', '2026-03-08', '2026-03-09'].map(noonOn);
    expect(streakFrom(stamps, at('2026-03-09T20:00:00')).longest).toBe(3);
  });

  it('is empty for an empty reef', () => {
    expect(streakFrom([], at('2026-08-24T09:00:00'))).toEqual({ current: 0, longest: 0 });
  });
});
