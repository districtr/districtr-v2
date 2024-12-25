import type {TemporalState} from "zundo";
import {useStore} from 'zustand';
import {useMapStore, type MapStore} from '@/app/store/mapStore';

// Convert zundo to a React hook
// from https://github.com/charkour/zundo?tab=readme-ov-file#for-reactive-changes-to-member-properties-of-the-temporal-object-optionally-convert-to-a-react-store-hook

const useTemporalStore = <T,>(
  selector: (state: TemporalState<Partial<MapStore>>) => T,
  equality?: (a: T, b: T) => boolean,
) => useStore(useMapStore.temporal, selector, equality);
