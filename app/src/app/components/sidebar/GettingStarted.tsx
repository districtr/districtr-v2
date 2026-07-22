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

  const openValidationTab = (tab: ValidationTab) => {
    if (!sidebarPanels.includes('mapValidation')) {
      setSidebarPanels([...sidebarPanels, 'mapValidation']);
    }
    requestValidationTab(tab);
    flash(`validation-${tab.toLowerCase()}`);
    // Bring the validity-check card into view; a beat later so a newly opened
    // panel has committed and started expanding.
    setTimeout(() => {
      document
        .querySelector('[data-testid="data-panel-mapValidation"]')
        ?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }, 100);
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

  const steps = [
    {
      label: `Start drawing all districts (${paintedZones}/${numDistricts})`,
      done: paintedZones >= numDistricts,
      hint: undefined as {label: string; onClick: () => void} | undefined,
    },
    {
      label: `Assign all population to a district${
        unassigned !== undefined
          ? ` (${formatNumber(unassigned, NUMBER_FORMATS.STRING)} population remaining)`
          : ''
      }`,
      done: unassigned === 0,
      hint: populationHint,
    },
    {
      label: `Keep districts contiguous (${contiguousZones}/${numDistricts})`,
      done: contiguousZones >= numDistricts,
      hint: contiguityHint,
    },
  ];
  const doneCount = steps.filter(s => s.done).length;

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
          Getting started
        </Text>
        <Flex align="center" gap="2">
          <Text size="1" color="gray">
            {doneCount} of {steps.length} done
          </Text>
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
        steps.map(step => (
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
            {!step.done && step.hint && (
              <Button
                variant="ghost"
                size="1"
                onClick={step.hint.onClick}
                style={{marginLeft: 26, alignSelf: 'start', fontWeight: 600}}
              >
                {step.hint.label} →
              </Button>
            )}
          </Flex>
        ))}
    </Flex>
  );
};
