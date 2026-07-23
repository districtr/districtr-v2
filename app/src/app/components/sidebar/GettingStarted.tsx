'use client';
import React, {useEffect, useState} from 'react';
import {Button, Flex, IconButton, Text} from '@radix-ui/themes';
import {CheckIcon, ChevronDownIcon} from '@radix-ui/react-icons';
import {useQuery} from '@tanstack/react-query';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useUiHintStore, type ValidationTab} from '@/app/store/uiHintStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useCountyBrush, COUNTY_BRUSH_FLASH_ID} from '@/app/components/Toolbar/PaintByCounty';
import {MODE_SWITCHER_FLASH_ID} from '@/app/components/Topbar/ModeSwitcher';
import {getContiguity} from '@/app/utils/api/apiHandlers/getContiguity';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/map/layerStyle';
import {formatNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {MAP_MODES} from '@constants/map/mode';
import {ACTIVE_TOOLS} from '@constants/map/tools';

const COLLAPSE_KEY = 'districtr-getting-started-collapsed';
// Above this share of unassigned population, suggest the county brush for
// rough drawing; below it, point at the unassigned-areas finder.
const ROUGH_DRAW_UNASSIGNED_RATIO = 0.25;
// "Improve your plan" population-balance stages: above ROUGH, point at the
// painting aids (population tooltip, demographic map); between the two,
// suggest block-level Super Draw; under FINE the item checks off.
const BALANCE_ROUGH_DEVIATION = 0.1;
const BALANCE_FINE_DEVIATION = 0.01;

type Hint = {label: string; onClick: () => void};
type ChecklistItem = {label: string; done: boolean; hints?: Hint[]};

/**
 * A collapsible (not dismissible) checklist replacing the blank-map moment for
 * first-time mappers. Steps check themselves off from live map state;
 * contiguity refreshes on save (the query keys on the document's updated_at).
 */
export const GettingStarted = () => {
  const isEditing = useMapControlsStore(state => state.isEditing);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const superDraw = useToolbarStore(state => state.superDraw);
  const mapDocument = useMapStore(state => state.mapDocument);
  const numDistricts = mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
  const {populationData} = useZonePopulations();
  const {summaryStats} = useSummaryStats();
  const unassigned = summaryStats?.unassigned;
  const idealPopulation = summaryStats?.idealpop;
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const setSuperDraw = useToolbarStore(state => state.setSuperDraw);
  const sidebarPanels = useMapControlsStore(state => state.sidebarPanels);
  const setSidebarPanels = useMapControlsStore(state => state.setSidebarPanels);
  const {setCountyBrush} = useCountyBrush();
  const requestValidationTab = useUiHintStore(state => state.requestValidationTab);
  const pingExpandDiscontiguous = useUiHintStore(state => state.pingExpandDiscontiguous);
  const flash = useUiHintStore(state => state.flash);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  // Same query key as the map-validation Contiguity panel, so the two share a
  // cache entry; keying on updated_at refetches contiguity on each save.
  const {data: contiguityData} = useQuery({
    queryKey: ['Contiguity', mapDocument?.document_id, mapDocument?.updated_at],
    queryFn: async () => await getContiguity(mapDocument),
    enabled: !!mapDocument && isEditing && !superDraw && mapMode === MAP_MODES.DISTRICTS,
    staleTime: 0,
    retry: false,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });

  // Super Draw users don't need onboarding.
  if (superDraw || !isEditing || mapMode !== MAP_MODES.DISTRICTS || !mapDocument?.document_id)
    return null;

  const paintedZones = populationData.filter(d => (d.total_pop_20 ?? 0) > 0).length;
  const contiguousZones =
    contiguityData?.ok === true
      ? Object.values(contiguityData.response).filter(pieces => pieces === 1).length
      : 0;
  const anyDiscontiguous =
    contiguityData?.ok === true &&
    Object.values(contiguityData.response).some(pieces => pieces > 1);
  const unassignedRatio =
    unassigned !== undefined && idealPopulation
      ? unassigned / (idealPopulation * numDistricts)
      : undefined;

  const openSidebarPanel = (key: (typeof sidebarPanels)[number]) => {
    if (!sidebarPanels.includes(key)) {
      setSidebarPanels([...sidebarPanels, key]);
    }
    // Bring the card into view; a beat later so a newly opened panel has
    // committed and started expanding.
    setTimeout(() => {
      document
        .querySelector(`[data-testid="data-panel-${key}"]`)
        ?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }, 100);
  };

  const openValidationTab = (tab: ValidationTab) => {
    requestValidationTab(tab);
    flash(`validation-${tab.toLowerCase()}`);
    openSidebarPanel('mapValidation');
  };

  const handleCountyBrushHint = () => {
    // Mount the brush controls so the Counties button exists to flash.
    setActiveTool(ACTIVE_TOOLS.BRUSH);
    setCountyBrush(true);
    flash(COUNTY_BRUSH_FLASH_ID);
  };

  const handleFindDisconnected = () => {
    pingExpandDiscontiguous();
    openValidationTab('Contiguity');
  };

  const populationHint =
    unassigned !== undefined && unassigned > 0
      ? unassignedRatio !== undefined && unassignedRatio > ROUGH_DRAW_UNASSIGNED_RATIO
        ? {label: 'Paint by counties to roughly draw districts', onClick: handleCountyBrushHint}
        : {label: 'Find unassigned areas', onClick: () => openValidationTab('Completeness')}
      : undefined;
  const contiguityHint = anyDiscontiguous
    ? {label: 'Find disconnected fragments', onClick: handleFindDisconnected}
    : undefined;

  const steps: ChecklistItem[] = [
    {
      label: `Start drawing all districts (${paintedZones}/${numDistricts})`,
      done: paintedZones >= numDistricts,
    },
    {
      label: `Assign all population to a district${
        unassigned !== undefined
          ? ` (${formatNumber(unassigned, NUMBER_FORMATS.STRING)} population remaining)`
          : ''
      }`,
      done: unassigned === 0,
      hints: populationHint && [populationHint],
    },
    {
      label: `Keep districts contiguous (${contiguousZones}/${numDistricts})`,
      done: contiguousZones >= numDistricts,
      hints: contiguityHint && [contiguityHint],
    },
  ];
  const doneCount = steps.filter(s => s.done).length;
  const gettingStartedDone = doneCount === steps.length;

  // Largest district deviation from the ideal population, driving the staged
  // balance hints in "Improve your plan".
  const maxDeviation =
    idealPopulation && populationData.length
      ? Math.max(...populationData.map(d => Math.abs((d.total_pop_20 ?? 0) - idealPopulation))) /
        idealPopulation
      : undefined;
  const balanced = maxDeviation !== undefined && maxDeviation <= BALANCE_FINE_DEVIATION;
  const roughlyBalanced = maxDeviation !== undefined && maxDeviation <= BALANCE_ROUGH_DEVIATION;

  const improveItems: ChecklistItem[] = [
    {
      label: `Balance district populations${
        maxDeviation !== undefined
          ? ` (largest deviation ${formatNumber(maxDeviation, NUMBER_FORMATS.PERCENT)})`
          : ''
      }`,
      done: balanced,
      hints: roughlyBalanced
        ? [
            {
              label: 'Perfect populations with census blocks in Super Draw',
              onClick: () => setSuperDraw(true),
            },
          ]
        : [
            {
              label: 'Show population tooltips as you paint',
              onClick: () => setMapOptions({showPopulationTooltip: true}),
            },
            {label: 'Show the demographic map', onClick: () => openSidebarPanel('demography')},
          ],
    },
    {
      label: 'Understand demographic and voter histories',
      done: sidebarPanels.includes('demography') && sidebarPanels.includes('election'),
      hints: [
        {label: 'Show the demographic table', onClick: () => openSidebarPanel('demography')},
        {label: 'Show the voter history table', onClick: () => openSidebarPanel('election')},
      ],
    },
    {
      label: 'Evaluate your plan further',
      done: false,
      hints: [{label: 'Go to Evaluate mode', onClick: () => flash(MODE_SWITCHER_FLASH_ID)}],
    },
  ];

  const items = gettingStartedDone ? improveItems : steps;

  const toggleCollapsed = () => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1');
    setCollapsed(!collapsed);
  };

  return (
    <Flex
      direction="column"
      gap="2"
      p="3"
      flexShrink="0"
      style={{
        background: 'var(--accent-2)',
        border: '1px solid var(--accent-6)',
        borderRadius: 10,
      }}
      data-testid="getting-started"
    >
      <Flex align="center" justify="between" onClick={toggleCollapsed} style={{cursor: 'pointer'}}>
        <Text size="2" weight="bold">
          {gettingStartedDone ? 'Improve your plan' : 'Getting started'}
        </Text>
        <Flex align="center" gap="2">
          {!gettingStartedDone && (
            <Text size="1" color="gray">
              {doneCount} of {steps.length} done
            </Text>
          )}
          <IconButton
            variant="ghost"
            color="gray"
            size="1"
            aria-label={
              collapsed ? 'Expand getting started checklist' : 'Collapse getting started checklist'
            }
          >
            <ChevronDownIcon
              style={{
                transform: collapsed ? 'rotate(-90deg)' : undefined,
                transition: 'transform 0.15s',
              }}
            />
          </IconButton>
        </Flex>
      </Flex>
      {!collapsed &&
        items.map(step => (
          <Flex key={step.label} direction="column" gap="1">
            <Flex align="center" gap="2">
              <Flex
                align="center"
                justify="center"
                flexShrink="0"
                width="18px"
                height="18px"
                style={{
                  borderRadius: 99,
                  background: step.done ? 'var(--accent-9)' : 'transparent',
                  border: step.done ? 'none' : '1.5px solid var(--gray-8)',
                  color: 'white',
                }}
              >
                {step.done && <CheckIcon width={12} height={12} />}
              </Flex>
              <Text size="1" color={step.done ? 'gray' : undefined}>
                {step.label}
              </Text>
            </Flex>
            {!step.done &&
              step.hints?.map(hint => (
                <Button
                  key={hint.label}
                  variant="ghost"
                  size="1"
                  onClick={hint.onClick}
                  style={{marginLeft: 26, alignSelf: 'start', fontWeight: 600}}
                >
                  {hint.label} →
                </Button>
              ))}
          </Flex>
        ))}
    </Flex>
  );
};
