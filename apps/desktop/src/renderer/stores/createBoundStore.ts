import { createStore } from 'zustand/vanilla';
import { useStore, type UseBoundStore } from 'zustand/react';
import type { StateCreator, StoreApi } from 'zustand/vanilla';

/**
 * Workaround for Zustand v5 + TypeScript bundler moduleResolution:
 * `create` from 'zustand' loses generic types when resolved via .d.mts files.
 * Using createStore + useStore directly preserves full type inference.
 */
export function createBoundStore<T>(creator: StateCreator<T>): UseBoundStore<StoreApi<T>> {
  const store = createStore(creator);
  const useBound = <U>(selector?: (state: T) => U): U | T =>
    useStore(store, selector as (state: T) => U);
  return Object.assign(useBound, store) as unknown as UseBoundStore<StoreApi<T>>;
}
