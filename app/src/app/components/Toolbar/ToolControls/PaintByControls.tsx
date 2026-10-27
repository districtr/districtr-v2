'use client';
import {Fragment, forwardRef} from 'react';
import {Button, DropdownMenu, Flex, Select, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
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
import {MAP_MODES} from '@constants/map/mode';
import {GEO_UNIT_SINGULAR_NAMES} from '@constants/document/geoUnits';

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

// The list stays about as wide as the trigger; longer layer names end in an
// ellipsis (full name on hover) instead of stretching the menu.
const MENU_MAX_WIDTH = 240;

type Option = {value: string; label: string};
type OptionGroup = {label?: string; options: Option[]};

/** One line per layer: some overlay names carry a description after a tab. */
export const optionLabel = (name: string) => name.replace(/\s*\t\s*/g, ' · ');

// forwardRef + rest props: HelpTip attaches its hover ref and handlers to its child.
export const LabeledSelect = forwardRef<
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

// Outlined like the toolbar's tool buttons; the chosen one turns the accent
// blue (text and outline only, quieter than the toolbar's solid active tool).
const PaintByButton = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button> & {active: boolean}
>(({active, style, ...props}, ref) => (
  <Button
    ref={ref}
    size="2"
    variant="outline"
    color={active ? undefined : 'gray'}
    aria-pressed={active}
    className="cursor-pointer"
    style={{
      borderRadius: 7,
      background: 'var(--color-background)',
      ...(active ? {} : {color: 'var(--gray-12)', boxShadow: 'inset 0 0 0 1px var(--gray-a6)'}),
      ...style,
    }}
    {...props}
  />
));
PaintByButton.displayName = 'PaintByButton';

/**
 * Paint by: what one brush footprint paints, as a row of toggle buttons. The
 * map's own units by default; whole counties; and in Super Draw, blocks inside
 * one unit (the same mode the Break button turns on: Paint/Erase first pick a
 * unit to break, then paint its blocks), plus a "…" menu of boundary layers
 * whose areas one click paints whole (paintOverlayArea). Hidden when there's
 * nothing to choose between.
 */
export const PaintByControl: React.FC<{
  label?: string;
  /** Inspect by: blocks and overlay areas are Paint/Erase modes, not readings. */
  forInspector?: boolean;
}> = ({label = 'Paint by', forInspector = false}) => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const mapMode = useMapControlsStore(state => state.mapMode);
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
  const segments: Option[] = [
    ...(superDraw && hasBlocks && !forInspector ? [{value: 'blocks', label: 'Blocks'}] : []),
    {value: 'units', label: unitName.charAt(0).toUpperCase() + unitName.slice(1)},
    ...(countyPaintAvailable ? [{value: 'counties', label: 'Counties'}] : []),
  ];
  // Whole areas of a boundary layer, behind the "…" segment. They paint
  // exactly by breaking edge units, a districts-mode flow.
  const moreAreas: Option[] =
    superDraw && !forInspector && mapMode === MAP_MODES.DISTRICTS
      ? maskLayers
          .filter(layer => layer.id !== COUNTY_SOURCE_ID)
          .map(layer => ({value: paintByOverlay(layer.id), label: optionLabel(layer.name)}))
      : [];
  if (segments.length + moreAreas.length < 2) return null;
  const moreSelected = moreAreas.find(option => option.value === paintBy);
  const value = segments.some(option => option.value === paintBy) ? paintBy : 'units';
  const choose = (next: string) => {
    if (next === 'counties') advanceGuide('county-brush');
    setPaintBy(next as PaintBy);
  };

  return (
    <Flex direction="column" gap="1" className={guiding ? 'ui-guide' : flashing ? 'ui-flash' : ''}>
      <Text size="2">{label}</Text>
      <Flex gap="1" align="center">
        {segments.map(option => (
          <PaintByButton
            key={option.value}
            active={!moreSelected && value === option.value}
            disabled={readOnly}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </PaintByButton>
        ))}
        {moreAreas.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger disabled={readOnly}>
              {/* Narrower than the other buttons until one of its areas is
                  chosen; then it reads that area's name. */}
              <PaintByButton
                active={!!moreSelected}
                aria-label="More areas to paint by"
                title={moreSelected?.label ?? 'More areas to paint by'}
                style={moreSelected ? undefined : {paddingInline: 0, width: 30}}
              >
                {moreSelected ? (
                  <span className="block truncate" style={{maxWidth: 120}}>
                    {moreSelected.label}
                  </span>
                ) : (
                  '…'
                )}
              </PaintByButton>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content size="1" style={{maxWidth: MENU_MAX_WIDTH}}>
              <DropdownMenu.Label>Whole areas</DropdownMenu.Label>
              {moreAreas.map(option => (
                <DropdownMenu.Item
                  key={option.value}
                  title={option.label}
                  onSelect={() => choose(option.value)}
                >
                  <span className="block truncate" style={{maxWidth: MENU_MAX_WIDTH - 40}}>
                    {option.label}
                  </span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        )}
      </Flex>
    </Flex>
  );
};
