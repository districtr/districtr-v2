'use client';
import {Flex, Select, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useUiHintStore, useGuideTarget} from '@/app/store/uiHintStore';
import {useFeatureFlagStore} from '@/app/store/featureFlagStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {paintByOverlay, setPaintBy} from '@utils/map/paintBy';
import {useMaskLayers} from '@/app/hooks/useMaskLayers';
import type {PaintBy} from '@/app/store/types';
import {ACCESS_STATES} from '@constants/document/state';
import {COUNTY_SOURCE_ID} from '@constants/map/layerIds';
import {GEO_UNIT_SINGULAR_NAMES} from '@constants/document/geoUnits';
import {HelpTip} from '@components/HelpTip/HelpTip';

// Connecticut's TIGER county layer (tl_2023_us_county) reflects its 2022
// switch to planning regions as county-equivalents, but districtr's own block
// geoids still carry the legacy county FIPS codes — the two never match, so
// county brush can never find any blocks under a "county" queried from that
// layer there. Disabled outright rather than left to spansMultipleCounties(),
// which has no way to see this mismatch.
const CONNECTICUT_STATE_FIPS = '09';

/** Whether county painting can work on this map at all: LOCAL maps (flag
 * off), Connecticut (see above), and single-county maps can't. Exported for
 * DraftStatusHelper's rough-draw hint. */
export const useCountyPaintAvailable = (): boolean => {
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);
  const statefps = useMapStore(state => state.mapDocument?.statefps);
  // Re-render when demography data (re)loads.
  const dataHash = useDemographyStore(state => state.dataHash);
  const isConnecticut = statefps?.length === 1 && statefps[0] === CONNECTICUT_STATE_FIPS;
  const isSingleCounty = !isConnecticut && !!dataHash && !demographyService.spansMultipleCounties();
  return paintCounties && !isConnecticut && !isSingleCounty;
};

const ANYWHERE = 'anywhere';

const LabeledSelect: React.FC<{
  label: string;
  value: string;
  options: {value: string; label: string}[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}> = ({label, value, options, onValueChange, disabled, className}) => (
  <Flex direction="column" gap="1" className={className}>
    <Text size="2">{label}</Text>
    <Select.Root size="2" value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger aria-label={label} style={{minWidth: 120}} />
      <Select.Content position="popper">
        {options.map(option => (
          <Select.Item key={option.value} value={option.value}>
            {option.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  </Flex>
);

/**
 * Paint by: what one brush footprint paints. The map's own units by default;
 * whole counties; and in Super Draw, blocks inside one unit (this replaced the
 * Break tool: Paint/Erase first pick a unit to break, then paint its blocks)
 * or whole areas of a boundary overlay such as school districts. Hidden when
 * there's nothing to choose between.
 */
export const PaintBySelect: React.FC<{label?: string}> = ({label = 'Paint by'}) => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const parentUnit = useMapStore(state => state.mapDocument?.parent_geo_unit_type);
  const hasBlocks = useMapStore(state => !!state.mapDocument?.child_layer);
  const readOnly = useMapStore(state => state.mapStatus?.access === ACCESS_STATES.READ);
  const paintBy = useMapControlsStore(state => state.mapOptions.paintBy ?? 'units');
  const countyPaintAvailable = useCountyPaintAvailable();
  const maskLayers = useMaskLayers();
  // Already on counts as satisfied — the guide would only invite switching off.
  const {guiding, flashing} = useGuideTarget('county-brush', paintBy === 'counties');
  const advanceGuide = useUiHintStore(state => state.advanceGuide);

  // "Precincts", "Block groups": the same names the break prompts use.
  const unitName = `${(parentUnit && GEO_UNIT_SINGULAR_NAMES[parentUnit]) || 'unit'}s`;
  const options = [
    {value: 'units', label: unitName.charAt(0).toUpperCase() + unitName.slice(1)},
    ...(superDraw && hasBlocks ? [{value: 'blocks', label: 'Blocks'}] : []),
    ...(countyPaintAvailable ? [{value: 'counties', label: 'Counties'}] : []),
    ...(superDraw
      ? maskLayers
          .filter(layer => layer.id !== COUNTY_SOURCE_ID)
          .map(layer => ({value: paintByOverlay(layer.id), label: layer.name}))
      : []),
  ];
  if (options.length < 2) return null;

  return (
    <HelpTip
      tip="paintBy"
      text={
        superDraw
          ? undefined
          : 'Choose what one brush stroke paints: single units, or whole counties at a time.'
      }
    >
      <LabeledSelect
        label={label}
        value={options.some(option => option.value === paintBy) ? paintBy : 'units'}
        options={options}
        disabled={readOnly}
        className={guiding ? 'ui-guide' : flashing ? 'ui-flash' : ''}
        onValueChange={value => {
          if (value === 'counties') advanceGuide('county-brush');
          setPaintBy(value as PaintBy);
        }}
      />
    </HelpTip>
  );
};

/** Paint within: the paint mask (Super Draw). Picking a layer arms area
 * selection (the map pill prompts for the click); Anywhere releases it. */
export const PaintWithinSelect = () => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const readOnly = useMapStore(state => state.mapStatus?.access === ACCESS_STATES.READ);
  const maskLayers = useMaskLayers();
  const maskLayerId = useOverlayStore(
    state => state.paintConstraint?.overlayId ?? state.selectingLayerId
  );
  const selectOverlayFeature = useOverlayStore(state => state.selectOverlayFeature);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  if (!superDraw || !maskLayers.length) return null;

  return (
    <HelpTip tip="paintMask">
      <LabeledSelect
        label="Paint within"
        value={maskLayerId ?? ANYWHERE}
        options={[
          {value: ANYWHERE, label: 'Anywhere'},
          ...maskLayers.map(layer => ({value: layer.id, label: layer.name})),
        ]}
        disabled={readOnly}
        onValueChange={value =>
          value === ANYWHERE ? clearPaintConstraint() : selectOverlayFeature(value)
        }
      />
    </HelpTip>
  );
};
