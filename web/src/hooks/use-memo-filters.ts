import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  chipKey,
  chipsToExpression,
  parseFilterParam,
  serializeChips,
  type FilterChip,
} from '@/lib/filter-chips.js';

const FEED_PATHS = ['/', '/explore', '/archived'];

function isFeedPath(pathname: string): boolean {
  return FEED_PATHS.includes(pathname) || pathname.startsWith('/u/');
}

/** Filter state lives in the URL (`?filter=...`), memos-style. */
export function useMemoFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const chips = useMemo(() => parseFilterParam(searchParams.get('filter')), [searchParams]);
  const expression = useMemo(() => chipsToExpression(chips), [chips]);

  const setChips = useCallback(
    (next: FilterChip[]) => {
      const serialized = next.length > 0 ? serializeChips(next) : null;
      if (isFeedPath(location.pathname)) {
        setSearchParams(
          (params) => {
            if (serialized) params.set('filter', serialized);
            else params.delete('filter');
            return params;
          },
          { replace: false },
        );
      } else {
        navigate(serialized ? `/?filter=${serialized}` : '/');
      }
    },
    [location.pathname, navigate, setSearchParams],
  );

  const toggleChip = useCallback(
    (chip: FilterChip) => {
      const key = chipKey(chip);
      const exists = chips.some((existing) => chipKey(existing) === key);
      let next: FilterChip[];
      if (exists) {
        next = chips.filter((existing) => chipKey(existing) !== key);
      } else {
        // Only one tagSearch / displayTime at a time (memos behavior).
        next = [
          ...chips.filter(
            (existing) =>
              !(chip.type === 'tagSearch' && existing.type === 'tagSearch') &&
              !(chip.type === 'displayTime' && existing.type === 'displayTime'),
          ),
          chip,
        ];
      }
      setChips(next);
    },
    [chips, setChips],
  );

  const removeChip = useCallback(
    (chip: FilterChip) => setChips(chips.filter((existing) => chipKey(existing) !== chipKey(chip))),
    [chips, setChips],
  );

  const addContentSearches = useCallback(
    (words: string[]) => {
      const additions: FilterChip[] = words
        .filter(Boolean)
        .map((word) => ({ type: 'contentSearch', value: word }));
      const merged = [...chips];
      for (const addition of additions) {
        if (!merged.some((existing) => chipKey(existing) === chipKey(addition))) {
          merged.push(addition);
        }
      }
      setChips(merged);
    },
    [chips, setChips],
  );

  return { chips, expression, toggleChip, removeChip, setChips, addContentSearches };
}
