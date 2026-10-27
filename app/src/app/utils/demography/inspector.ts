import type {MapFeatureInfo} from '@constants/map/mapEvents';
import {GEO_UNIT_LABELS, type GeoUnit} from '@constants/document/geoUnits';
import type {Pov} from '@components/Shared/PovSwitcher';
import type {DocumentObject} from '@utils/api/apiHandlers/types';
import {formatNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';

/** The selected party's two-party share. `_pct` voter columns are the dem
 * share of dem + rep, so the rep share is exactly its complement. */
export const povShare = (demShare: number, pov: Pov) => (pov === 'rep' ? 1 - demShare : demShare);

// GEO_UNIT_LABELS are all plain plurals ("VTDs", "block groups", "blocks").
const unitCountLabel = (type: GeoUnit, count: number) => {
  const label = GEO_UNIT_LABELS[type];
  return `${formatNumber(count, NUMBER_FORMATS.STRING)} ${count === 1 ? label.slice(0, -1) : label}`;
};

/**
 * "3 VTDs · 12 blocks": hovered child-layer features are broken-out units,
 * everything else is a whole parent unit. Empty when the map has no parent
 * unit type (the backend column is nullable).
 */
export const describeHoverUnits = (
  features: MapFeatureInfo[],
  mapDocument: Pick<
    DocumentObject,
    'child_layer' | 'parent_geo_unit_type' | 'child_geo_unit_type'
  > | null
) => {
  if (!mapDocument?.parent_geo_unit_type) return '';
  const {child_layer, parent_geo_unit_type, child_geo_unit_type} = mapDocument;
  const childCount = child_layer ? features.filter(f => f.sourceLayer === child_layer).length : 0;
  const labels = [unitCountLabel(parent_geo_unit_type, features.length - childCount)];
  if (child_geo_unit_type) labels.push(unitCountLabel(child_geo_unit_type, childCount));
  return labels.join(' · ');
};
