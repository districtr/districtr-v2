'use client';
import React, {useEffect, useState} from 'react';
import {Button, Flex, IconButton, Text} from '@radix-ui/themes';
import {CheckIcon, ChevronDownIcon, MinusIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useUiHintStore} from '@/app/store/uiHintStore';
import {useDraftStatusCriteria, BALANCE_DEVIATION} from '@/app/hooks/useDraftStatusCriteria';
import {useMetadataChange} from '@/app/hooks/useMetadataChange';
import {getFeaturesIntersectingCounties} from '@utils/map/getFeaturesIntersectingCounties';
import {activateOverlayGroup} from '@utils/demography/overlayMemory';
import {formatNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {SUMMARY_TYPES, toOverlayGroup} from '@constants/demography/summary';
import {DRAFT_STATUSES, DRAFT_STATUS_TEXT, type DraftStatus} from '@constants/document/draftStatus';
import {MAP_MODES} from '@constants/map/mode';
import {ACTIVE_TOOLS} from '@constants/map/tools';

const COLLAPSE_KEY = 'districtr-draft-helper-collapsed';
// Above this share of unassigned population, suggest the county brush for
// rough drawing; below it, point at the unassigned-areas finder.
const ROUGH_DRAW_UNASSIGNED_RATIO = 0.25;

type Hint = {label: string; onClick: () => void};
type ChecklistItem = {label: string; done: boolean; stale?: boolean; hints?: Hint[]};

/** Link-styled action that flows inline with the checklist text instead of
 * occupying its own row. */
const InlineHintButton: React.FC<{onClick: () => void; children: React.ReactNode}> = ({
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    className="inline cursor-pointer whitespace-nowrap font-semibold text-districtrBlue hover:underline underline-offset-2"
  >
    {children} →
  </button>
);

/** Plain status glyphs (check / dash), deliberately without circular chrome so
 * the read-only rows can't be mistaken for radio buttons or checkboxes. */
const ItemMarker: React.FC<{done: boolean}> = ({done}) =>
  done ? (
    <CheckIcon width={14} height={14} style={{color: 'var(--accent-9)', flexShrink: 0}} />
  ) : (
    <MinusIcon width={14} height={14} style={{color: 'var(--gray-8)', flexShrink: 0}} />
  );

/**
 * Helper card at the top of the sidebar: Get started (scratch) → Refine and
 * validate (in progress) → Advanced (ready to share). The stage follows the
 * draft status, except a regressed plan falls back to the earliest failing
 * checklist (see displayStage). Advancing is opt-in via the earned advance
 * button, on the same criteria that gate the status controls
 * (useDraftStatusCriteria). Collapsible, not dismissible.
 */
export const DraftStatusHelper = () => {
  const isEditing = useMapControlsStore(state => state.isEditing);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const superDraw = useToolbarStore(state => state.superDraw);
  const mapDocument = useMapStore(state => state.mapDocument);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const openTabSection = useMapControlsStore(state => state.openTabSection);
  const request = useUiHintStore(state => state.request);
  const flash = useUiHintStore(state => state.flash);
  const handleMetadataChange = useMetadataChange();
  const {
    currentStatus,
    scratchDone,
    inProgressDone,
    statusLocked,
    contiguityStale,
    contiguityUnavailable,
    counts,
  } = useDraftStatusCriteria();

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);
  const toggleCollapsed = () => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1');
    setCollapsed(!collapsed);
  };

  if (superDraw || !isEditing || mapMode !== MAP_MODES.DISTRICTS || !mapDocument?.document_id)
    return null;

  const {paintedZones, numDistricts, unassigned, contiguousZones, maxDeviation, idealPopulation} =
    counts;
  const unassignedRatio =
    unassigned !== undefined && idealPopulation
      ? unassigned / (idealPopulation * numDistricts)
      : undefined;

  /** Jump to a sidebar section: switch tab, expand and flash the section, and
   * scroll it into view. The scroll waits out the tab switch and the section
   * expand animation (which shifts layout under a too-early scroll), retrying
   * briefly until the section has mounted. */
  const scrollSectionIntoView = (sectionId: string, attempt = 0) => {
    const el = document.querySelector(`[data-section-id="${sectionId}"]`);
    if (!el && attempt < 5) {
      setTimeout(() => scrollSectionIntoView(sectionId, attempt + 1), 120);
      return;
    }
    el?.scrollIntoView({behavior: 'smooth', block: 'start'});
  };
  const jumpToSection = (tab: 'stats' | 'mapLayers', sectionId: string) => {
    openTabSection(sectionId);
    request('sidebarTab', tab);
    flash(`section:${sectionId}`);
    setTimeout(() => scrollSectionIntoView(sectionId), 300);
  };

  const openValidation = (tab: 'Contiguity' | 'Completeness') => {
    request('validationTab', tab);
    jumpToSection('stats', 'stats-validity');
  };

  const handleCountyBrushHint = () => {
    // Same wiring as the PaintByCounty toggle: county paint replaces the
    // brush's feature selector and clears any overlay paint constraint.
    setActiveTool(ACTIVE_TOOLS.BRUSH);
    clearPaintConstraint();
    setMapOptions({paintByCounty: true});
    setPaintFunction(getFeaturesIntersectingCounties);
    flash('county-brush');
  };

  const scratchItems: ChecklistItem[] = [
    {
      label: `Start drawing all districts (${paintedZones}/${numDistricts})`,
      done: paintedZones >= numDistricts,
    },
    {
      label: `Assign all population${
        unassigned !== undefined && unassigned > 0
          ? ` (${formatNumber(unassigned, NUMBER_FORMATS.STRING)} remaining)`
          : ''
      }`,
      done: unassigned === 0,
      hints:
        unassigned !== undefined && unassigned > 0
          ? [
              unassignedRatio !== undefined && unassignedRatio > ROUGH_DRAW_UNASSIGNED_RATIO
                ? {
                    label: 'Paint by counties to roughly draw districts',
                    onClick: handleCountyBrushHint,
                  }
                : {label: 'Find unassigned areas', onClick: () => openValidation('Completeness')},
            ]
          : undefined,
    },
  ];

  const balanced = maxDeviation !== undefined && maxDeviation <= BALANCE_DEVIATION;
  const refineItems: ChecklistItem[] = [
    {
      label: `Balance district populations within ${formatNumber(
        BALANCE_DEVIATION,
        NUMBER_FORMATS.PERCENT
      )} of ideal${
        maxDeviation !== undefined
          ? ` (largest deviation ${formatNumber(maxDeviation, NUMBER_FORMATS.PERCENT)})`
          : ''
      }`,
      done: balanced,
      hints: !balanced
        ? [
            {
              label: 'Show population tooltips as you paint',
              onClick: () => {
                // Enable it, then show where the setting lives.
                setMapOptions({showPopulationTooltip: true});
                jumpToSection('mapLayers', 'layers-options');
              },
            },
            {
              label: 'Show the demographic map',
              onClick: () => {
                activateOverlayGroup(toOverlayGroup(SUMMARY_TYPES.TOTPOP));
                jumpToSection('mapLayers', 'layers-demographics');
              },
            },
          ]
        : undefined,
    },
    {
      label: contiguityUnavailable
        ? 'Keep districts contiguous'
        : `Keep districts contiguous (${contiguityStale ? '?' : contiguousZones}/${numDistricts})`,
      done: contiguityUnavailable || contiguousZones >= numDistricts,
      stale: contiguityStale && !contiguityUnavailable,
      hints:
        !contiguityStale && !contiguityUnavailable && contiguousZones < numDistricts
          ? [
              {
                label: 'Find disconnected fragments',
                onClick: () => openValidation('Contiguity'),
              },
            ]
          : undefined,
    },
  ];

  const advancedPointers: Hint[] = [
    {label: 'Share your map', onClick: () => request('shareModal', true)},
    {
      label: 'Explore demographics',
      onClick: () => jumpToSection('stats', 'stats-demographics'),
    },
    {
      label: 'Review election results',
      onClick: () => jumpToSection('stats', 'stats-elections'),
    },
    // These two point at the mode switcher rather than switching modes — the
    // user stays where they are; the opened menu pulses the meant mode.
    {label: 'Fine-tune in Super Draw', onClick: () => request('modeMenu', 'superdraw')},
    {label: 'Evaluate your plan', onClick: () => request('modeMenu', 'evaluate')},
  ];

  // The stage shown is the earliest one whose criteria aren't met, capped at
  // the current status's stage — a regressed plan (e.g. population unassigned
  // while marked In Progress) jumps back to the checklist that needs fixing,
  // with a note offering the voluntary status step-back. Completing that
  // checklist returns the box to the current status's stage automatically.
  const statusStage =
    currentStatus === DRAFT_STATUSES.SCRATCH
      ? 0
      : currentStatus === DRAFT_STATUSES.IN_PROGRESS
        ? 1
        : 2;
  const criteriaStage = !scratchDone ? 0 : !inProgressDone ? 1 : 2;
  const displayStage = Math.min(statusStage, criteriaStage);
  const regressed = displayStage < statusStage;
  const previousStatus: DraftStatus =
    statusStage === 2 ? DRAFT_STATUSES.IN_PROGRESS : DRAFT_STATUSES.SCRATCH;

  const title = ['Get started', 'Refine and validate', 'Advanced'][displayStage];
  const items = displayStage === 0 ? scratchItems : displayStage === 1 ? refineItems : [];
  const showPointers = displayStage === 2;
  const doneCount = items.filter(s => s.done).length;
  // Advance only from the un-regressed flow; statusLocked encodes the
  // cumulative criteria, and a stale contiguity result additionally
  // suppresses the advance until the next save verifies it.
  const nextStatus: DraftStatus | null =
    statusStage === 0
      ? DRAFT_STATUSES.IN_PROGRESS
      : statusStage === 1
        ? DRAFT_STATUSES.READY_TO_SHARE
        : null;
  const canAdvance =
    !regressed &&
    !!nextStatus &&
    !statusLocked(nextStatus) &&
    !(statusStage === 1 && contiguityStale);

  return (
    <Flex
      direction="column"
      gap="2"
      p="3"
      flexShrink="0"
      // Accent-tinted chrome so the helper reads as its own layer, distinct
      // from the white data panels below it.
      style={{
        background: 'var(--accent-2)',
        border: '1px solid var(--accent-6)',
        borderRadius: 10,
      }}
      data-testid="draft-status-helper"
    >
      <Flex align="center" justify="between" onClick={toggleCollapsed} style={{cursor: 'pointer'}}>
        <Text size="3" weight="bold">
          {title}
        </Text>
        <Flex align="center" gap="2">
          {!showPointers && !collapsed && (
            <Text size="1" color="gray">
              {doneCount} of {items.length} done
            </Text>
          )}
          <IconButton
            variant="ghost"
            color="gray"
            size="1"
            aria-label={collapsed ? `Expand ${title} checklist` : `Collapse ${title} checklist`}
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
      {!collapsed && regressed && (
        <Flex
          direction="column"
          gap="1"
          p="2"
          style={{
            background: 'var(--amber-2)',
            border: '1px solid var(--amber-6)',
            borderRadius: 6,
          }}
        >
          <Text size="2">
            Your plan no longer meets the checks for its current status.{' '}
            <InlineHintButton onClick={() => handleMetadataChange({draft_status: previousStatus})}>
              Move back to {DRAFT_STATUS_TEXT[previousStatus]}
            </InlineHintButton>
          </Text>
        </Flex>
      )}
      {!collapsed && showPointers && (
        <>
          <Text size="2" color="gray">
            Your plan is ready to share. Keep going:
          </Text>
          <Flex wrap="wrap" gapX="3" gapY="1">
            {advancedPointers.map(pointer => (
              <Text size="2" key={pointer.label}>
                <InlineHintButton onClick={pointer.onClick}>{pointer.label}</InlineHintButton>
              </Text>
            ))}
          </Flex>
        </>
      )}
      {!collapsed &&
        items.map(step => (
          <Flex key={step.label} align="start" gap="2">
            <span className="pt-[3px]">
              <ItemMarker done={step.done && !step.stale} />
            </span>
            <Text size="2" color={step.done || step.stale ? 'gray' : undefined}>
              {step.label}
              {step.stale ? ' — updates on save' : ''}
              {!step.done &&
                step.hints?.map(hint => (
                  <React.Fragment key={hint.label}>
                    {' '}
                    <InlineHintButton onClick={hint.onClick}>{hint.label}</InlineHintButton>
                  </React.Fragment>
                ))}
            </Text>
          </Flex>
        ))}
      {!collapsed && canAdvance && nextStatus && (
        <Button
          variant="solid"
          size="1"
          onClick={() => handleMetadataChange({draft_status: nextStatus})}
          style={{alignSelf: 'start', fontWeight: 600}}
          data-testid="advance-draft-status"
        >
          Mark as {DRAFT_STATUS_TEXT[nextStatus]} →
        </Button>
      )}
    </Flex>
  );
};
