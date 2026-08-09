import { useCallback, useEffect, useState } from 'react';

/** The sole runtime lens model. "Standard" is a reference checkout, never a state. */
export type Lens = 'vibe' | 'pro';

export const DEFAULT_LENS: Lens = 'vibe';
export const LENS_STORAGE_KEY = 'oh-gui:lens';

export interface LensState {
  readonly lens: Lens;
  readonly setLens: (lens: Lens) => void;
  readonly toggleLens: () => void;
}

export function isLens(value: unknown): value is Lens {
  return value === 'vibe' || value === 'pro';
}

function readPersistedLens(): Lens {
  if (typeof window === 'undefined') return DEFAULT_LENS;

  try {
    const savedLens = window.localStorage.getItem(LENS_STORAGE_KEY);
    return isLens(savedLens) ? savedLens : DEFAULT_LENS;
  } catch {
    // Storage may be blocked. The default must still leave the UI usable.
    return DEFAULT_LENS;
  }
}

/**
 * Lens selection changes presentation only. It owns no route or data request,
 * so a switch leaves the one shared data model mounted and intact.
 */
export function useLens(): LensState {
  const [lens, setLensState] = useState<Lens>(readPersistedLens);

  useEffect(() => {
    try {
      window.localStorage.setItem(LENS_STORAGE_KEY, lens);
    } catch {
      // A blocked storage implementation must not make the lens control fail.
    }
  }, [lens]);

  const setLens = useCallback((nextLens: Lens) => {
    setLensState(nextLens);
  }, []);

  const toggleLens = useCallback(() => {
    setLensState((currentLens) => (currentLens === 'vibe' ? 'pro' : 'vibe'));
  }, []);

  return { lens, setLens, toggleLens };
}
