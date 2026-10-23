'use client';
import {Button, Flex} from '@radix-ui/themes';
import {Cross2Icon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {useOverlayStore} from '@store/overlayStore';
import {useAssignmentsStore} from '@store/assignmentsStore';
import {useDemographyStore} from '@store/demography/demographyStore';
import {SUMMARY_TYPES, TOTAL_COLUMN, type SummaryType} from '@constants/demography/summary';
import {COALITION_VARIABLE_BY_UNIVERSE} from '@constants/demography/coalition';
import {INSPECTOR_TITLE} from '@constants/demography/inspectorLabels';
import {deactivateOverlay} from '@utils/demography/overlayMemory';
import {demographyService} from '@utils/demography/demographyService';
import {getCoalitionLabel} from '@utils/demography/coalition';

/** One pill per map-altering option switched on from the settings panels.
 * Clicking a pill turns that option off, which also removes the pill; turning
 * an option back on happens only in the panels. The county boundary options
 * ("County boundaries", "Emphasize county names") are left out on purpose:
 * both default to on, so they'd put pills on every fresh map. */
export const ActiveMapFeaturePills = () => {
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const hasChildLayer = useMapStore(state => !!state.mapDocument?.child_layer);
  const parentsAreBroken = useAssignmentsStore(state => state.shatterIds.parents.size > 0);
  const enabledOverlayIds = useOverlayStore(state => state.enabledOverlayIds);
  const toggleOverlay = useOverlayStore(state => state.toggleOverlay);
  const variable = useDemographyStore(state => state.variable);
  const coalitionGroups = useDemographyStore(state => state.coalitionGroups);
  const variableType = useDemographyStore(
    state =>
      Object.entries(state.availableColumnSets.map).find(([, vars]) =>
        vars.some(v => v.value === state.variable)
      )?.[0] as SummaryType | undefined
  );
  const variableLabel = useDemographyStore(
    state =>
      Object.values(state.availableColumnSets.map)
        .flat()
        .find(v => v.value === state.variable)?.label
  );
  const coalitionUniverse = (
    Object.keys(COALITION_VARIABLE_BY_UNIVERSE) as Array<
      keyof typeof COALITION_VARIABLE_BY_UNIVERSE
    >
  ).find(universe => COALITION_VARIABLE_BY_UNIVERSE[universe] === variable);
  // Coalitions aren't in the column sets; label them as the variable picker does.
  // A bare "Total" / "VAP Total" means nothing out of the picker's context.
  const overlayName = coalitionUniverse
    ? `${coalitionUniverse === SUMMARY_TYPES.VAP ? 'VAP ' : ''}${getCoalitionLabel({
        selectedGroups: coalitionGroups,
        availableColumns: demographyService.availableColumns,
        universe: coalitionUniverse,
      })}`
    : variableType && TOTAL_COLUMN[variableType] === variable
      ? INSPECTOR_TITLE[variableType]
      : (variableLabel ?? 'On');

  // kind says what the map is doing, name says to what.
  const pills = [
    {
      kind: variableType === SUMMARY_TYPES.VOTERHISTORY ? 'Election' : 'Demographic',
      name: overlayName,
      on: !!mapOptions.demographicDisplayMode,
      off: deactivateOverlay,
    },
    {
      kind: 'Hidden',
      name: 'Painted districts',
      on: mapOptions.showPaintedDistricts === false,
      off: () => setMapOptions({showPaintedDistricts: true}),
    },
    {
      kind: 'Labels',
      name: 'Population on map (all units)',
      on: !!mapOptions.showPopulationNumbers,
      off: () => setMapOptions({showPopulationNumbers: false}),
    },
    {
      kind: 'Labels',
      name: 'Block population',
      on: hasChildLayer && !!mapOptions.showBlockPopulationNumbers,
      off: () => setMapOptions({showBlockPopulationNumbers: false}),
    },
    {
      kind: 'Highlight',
      name: 'Unassigned areas',
      on: !!mapOptions.higlightUnassigned,
      off: () => setMapOptions({higlightUnassigned: false}),
    },
    {
      kind: 'Highlight',
      name: 'Broken precincts',
      on: parentsAreBroken && !!mapOptions.highlightBrokenDistricts,
      off: () => setMapOptions({highlightBrokenDistricts: false}),
    },
    // enabledOverlayIds holds overlay names (see OverlaysPanel), so the
    // name is both the label and the toggle key.
    ...Array.from(enabledOverlayIds, name => ({
      kind: 'Outline',
      name,
      on: true,
      off: () => toggleOverlay(name),
    })),
  ]
    .filter(pill => pill.on)
    .map(pill => ({...pill, label: `${pill.kind}: ${pill.name}`}));

  if (!pills.length) return null;

  return (
    <Flex wrap="wrap" gap="2" data-testid="active-map-feature-pills">
      {pills.map(pill => (
        <Button
          key={pill.label}
          size="1"
          variant="soft"
          radius="full"
          onClick={pill.off}
          title={`Turn off ${pill.label}`}
          aria-label={`Turn off ${pill.label}`}
        >
          <span>
            <strong>{pill.kind}:</strong> {pill.name}
          </span>
          <Cross2Icon />
        </Button>
      ))}
    </Flex>
  );
};
