import {useMemo} from 'react';
import {ExpressionSpecification, FilterSpecification} from 'maplibre-gl';
import {useMapStore} from '../store/mapStore';

/**
 * County FIPS of a block feature: the 5 chars after any `<type>:` prefix of
 * its `path` (e.g. `vtd:48001000001` and `480010000011000` both → `48001`).
 */
const PATH_COUNTY_FIPS: ExpressionSpecification = [
  'let',
  'sep',
  ['index-of', ':', ['get', 'path']],
  [
    'case',
    ['>=', ['var', 'sep'], 0],
    ['slice', ['get', 'path'], ['+', ['var', 'sep'], 1], ['+', ['var', 'sep'], 6]],
    ['slice', ['get', 'path'], 0, 5],
  ],
];

/**
 * MapLibre filter matching block-source features inside the document's county
 * filter (`mapDocument.county_filter`), or null when no filter is set.
 */
export const useCountyLayerFilter = (): ExpressionSpecification | null => {
  const countyFilter = useMapStore(state => state.mapDocument?.county_filter);
  return useMemo(() => {
    if (!countyFilter?.length) return null;
    return ['match', PATH_COUNTY_FIPS, countyFilter, true, false] as ExpressionSpecification;
  }, [countyFilter]);
};

export const combineWithCountyFilter = (
  filter: FilterSpecification,
  countyFilter: ExpressionSpecification | null
): FilterSpecification =>
  countyFilter ? (['all', countyFilter, filter] as FilterSpecification) : filter;
