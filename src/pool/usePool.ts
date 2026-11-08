import { useMemo, useState } from 'react';
import type { Card } from '../lib/types';
import { filterPool, loadExcluded, loadExcludedRarities, saveExcluded, saveExcludedRarities } from './pool';

/**
 * The card pool the modes play with: all cards minus the sets and rarities the
 * player switched off on the menu (saved on the device).
 */
export function usePool(cards: Card[] | null) {
  const [excludedSets, setExcludedSets] = useState<string[]>(loadExcluded);
  const [excludedRarities, setExcludedRarities] = useState<string[]>(loadExcludedRarities);
  /** After the set filter only (the rarity picker counts from this). */
  const setPool = useMemo(() => (cards ? filterPool(cards, excludedSets) : []), [cards, excludedSets]);
  const pool = useMemo(() => (cards ? filterPool(cards, excludedSets, excludedRarities) : []), [cards, excludedSets, excludedRarities]);
  return {
    pool,
    setPool,
    excludedSets,
    excludedRarities,
    updateSets(ex: string[]) {
      setExcludedSets(ex);
      saveExcluded(ex);
    },
    updateRarities(ex: string[]) {
      setExcludedRarities(ex);
      saveExcludedRarities(ex);
    },
  };
}
