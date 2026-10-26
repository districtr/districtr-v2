'use client';
import {Fragment, forwardRef} from 'react';
import {Flex, Select, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useUiHintStore, useGuideTarget} from '@/app/store/uiHintStore';
import {useFeatureFlagStore} from '@/app/store/featureFlagStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {setPaintBy} from '@utils/map/paintBy';
import {paintByOverlay} from '@constants/map/paintBy';
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
// The list stays about as wide as the trigger; longer layer names end in an
// ellipsis (full name on hover) instead of stretching the menu.
const MENU_MAX_WIDTH = 240;

type Option = {value: string; label: string};
type OptionGroup = {label?: string; options: Option[]};

/** One line per layer: some overlay names carry a description after a tab. */
const optionLabel = (name: string) => name.replace(/\s*\t\s*/g, ' · ');

// forwardRef + rest props: HelpTip attaches its hover ref and handlers to its child.
const LabeledSelect = forwardRef<
  HTMLDivElement,
  {
    label: string;
    value: string;
    groups: OptionGroup[];
    onValueChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
  }
>(({label, value, groups, onValueChange, disabled, className, ...hoverProps}, ref) => (
  <Flex ref={ref} direction="column" gap="1" className={className} {...hoverProps}>
    <Text size="2">{label}</Text>
    <Select.Root size="2" value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger
        aria-label={label}
        style={{minWidth: 120, maxWidth: 180}}
        // Focus stays here after a pick, and a closed Radix Select types ahead
        // on letter keys: pressing P (Paint) would also pick "Precincts".
        // Swallow them so tool hotkeys don't also change this menu.
        onKeyDown={e => {
          if (e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
          }
        }}
      />
      <Select.Content position="popper" style={{maxWidth: MENU_MAX_WIDTH}}>
        {groups
          .filter(group => group.options.length)
          .map((group, i) => (
            <Fragment key={group.label ?? i}>
              {i > 0 && <Select.Separator />}
              <Select.Group>
                {group.label && <Select.Label>{group.label}</Select.Label>}
                {group.options.map(option => (
                  <Select.Item key={option.value} value={option.value} title={option.label}>
                    <span className="block truncate" style={{maxWidth: MENU_MAX_WIDTH - 48}}>
                      {option.label}
                    </span>
                  </Select.Item>
                ))}
              </Select.Group>
            </Fragment>
          ))}
      </Select.Content>
    </Select.Root>
  </Flex>
));
LabeledSelect.displayName = 'LabeledSelect';

/**
 * Paint by: what one brush footprint paints. The map's own units by default;
 * whole counties; and in Super Draw, blocks inside one unit (this replaced the
 * Break tool: Paint/Erase first pick a unit to break, then paint its blocks)
 * or whole areas of a boundary overlay such as school districts. Hidden when
 * there's nothing to choose between.
 */
export const PaintBySelect: React.FC<{label?: string; offerBlocks?: boolean}> = ({
  label = 'Paint by',
  offerBlocks = true,
}) => {
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
  // Units the brush paints one at a time, then whole areas per footprint.
  const groups: OptionGroup[] = [
    {
      label: 'Units',
      options: [
        {value: 'units', label: unitName.charAt(0).toUpperCase() + unitName.slice(1)},
        ...(superDraw && hasBlocks && offerBlocks ? [{value: 'blocks', label: 'Blocks'}] : []),
      ],
    },
    {
      label: 'Whole areas',
      options: [
        ...(countyPaintAvailable ? [{value: 'counties', label: 'Counties'}] : []),
        ...(superDraw
          ? maskLayers
              .filter(layer => layer.id !== COUNTY_SOURCE_ID)
              .map(layer => ({value: paintByOverlay(layer.id), label: optionLabel(layer.name)}))
          : []),
      ],
    },
  ];
  const options = groups.flatMap(group => group.options);
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
        groups={groups}
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
        groups={[
          {options: [{value: ANYWHERE, label: 'Anywhere'}]},
          {
            label: 'Inside one area of',
            options: maskLayers.map(layer => ({value: layer.id, label: optionLabel(layer.name)})),
          },
        ]}
        disabled={readOnly}
        onValueChange={value =>
          value === ANYWHERE ? clearPaintConstraint() : selectOverlayFeature(value)
        }
      />
    </HelpTip>
  );
};
