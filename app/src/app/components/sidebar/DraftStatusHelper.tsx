'use client';
import React, {useEffect, useState} from 'react';
import {Button, Flex, Text} from '@radix-ui/themes';
import {CheckIcon, ChevronDownIcon, MinusIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore, type MapControlsStore} from '@/app/store/mapControlsStore';
import {useIsDesktop} from '@/app/hooks/useIsDesktop';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useUiHintStore} from '@/app/store/uiHintStore';
import {useDraftStatusCriteria, BALANCE_DEVIATION} from '@/app/hooks/useDraftStatusCriteria';
import {useMetadataChange} from '@/app/hooks/useMetadataChange';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {statusIcons} from '@components/Topbar/MapStatus';
import {getFeaturesIntersectingCounties} from '@utils/map/getFeaturesIntersectingCounties';
import {activateOverlayGroup} from '@utils/demography/overlayMemory';
import {formatNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {SUMMARY_TYPES, toOverlayGroup} from '@constants/demography/summary';
import {
  DRAFT_STATUSES,
  DRAFT_STATUS_COLORS,
  DRAFT_STATUS_TEXT,
  type DraftStatus,
} from '@constants/document/draftStatus';
import {MAP_MODES} from '@constants/map/mode';
import {ACTIVE_TOOLS} from '@constants/map/tools';

const COLLAPSE_KEY = 'districtr-draft-helper-collapsed';
// Above this share of unassigned population, suggest the county brush for
// rough drawing; below it, point at the unassigned-areas finder.
const ROUGH_DRAW_UNASSIGNED_RATIO = 0.25;

// Sidebar sections → the mobile full-screen panel holding the same content.
const MOBILE_TAB_FOR_SECTION: Record<string, MapControlsStore['sidebarPanels'][number]> = {
  'stats-validity': 'mapValidation',
  'stats-demographics': 'demography',
  'stats-elections': 'election',
};

type Hint = {label: string; onClick: () => void};
type ChecklistItem = {
  label: string;
  done: boolean;
  /** Gray the row and show the pending dash even if done — the value is
   * stale or uncheckable, not a confirmed pass. */
  muted?: boolean;
  hints?: Hint[];
};

/** Link-styled action that flows inline with the checklist text instead of
 * occupying its own row. `back` renders the quiet gray variant — step-backs
 * shouldn't compete with the forward hints. */
const InlineHintButton: React.FC<{
  onClick: () => void;
  back?: boolean;
  children: React.ReactNode;
}> = ({onClick, back, children}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline cursor-pointer whitespace-nowrap hover:underline underline-offset-2 ${
      back ? 'text-gray-500 hover:text-gray-700' : 'font-semibold text-districtrBlue'
    }`}
  >
    {children}
  </button>
);

/** The topbar's own status glyph, wherever a control names a status to move to.
 * Those icons hardcode a 24px size and their own indicator fill, so both are
 * overridden here to inherit from whatever the glyph sits in. */
const StatusGlyph: React.FC<{status: DraftStatus; inline?: boolean}> = ({status, inline}) => (
  <span
    // One size for every status move, forward or back. The inline (link) glyph
    // spaces itself; inside a Button, Radix's own gap already does.
    className={`inline-flex align-middle [&_svg]:size-[18px] [&_svg]:!fill-current ${
      inline ? 'mr-1' : ''
    }`}
    aria-hidden
  >
    {React.createElement(statusIcons[status])}
  </span>
);

/** Plain status glyphs (check / dash), deliberately without circular chrome so
 * the read-only rows can't be mistaken for radio buttons or checkboxes. */
const ItemMarker: React.FC<{done: boolean}> = ({done}) =>
  done ? (
    <CheckIcon width={14} height={14} style={{color: 'var(--accent-9)', flexShrink: 0}} />
  ) : (
    <MinusIcon width={14} height={14} style={{color: 'var(--gray-8)', flexShrink: 0}} />
  );

/** The helper's own render gate, exported so the mobile "View map guide"
 * button can hide alongside it. */
export const useDraftStatusHelperVisible = () => {
  const isEditing = useMapControlsStore(state => state.isEditing);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const superDraw = useToolbarStore(state => state.superDraw);
  const documentId = useMapStore(state => state.mapDocument?.document_id);
  return !superDraw && isEditing && mapMode === MAP_MODES.DISTRICTS && !!documentId;
};

/**
 * Helper card at the top of the sidebar: Get started (scratch) → Refine and
 * validate (in progress) → Advanced plan evaluation (ready to share). The stage follows the
 * draft status, except a regressed plan falls back to the earliest failing
 * checklist (see displayStage). The advance button is the app's one earned
 * move — it appears only when the stage's criteria are met — while the status
 * controls (and the box's own step-back links) stay free choice. Collapsible,
 * not dismissible.
 *
 * `onNavigate` fires after any hint that points somewhere else in the app —
 * the mobile modal closes itself so the hint's target isn't buried under it.
 * The modal instance sets `collapsible` false: its dialog already opens and
 * closes, so an inner collapse (persisted from the sidebar) would just show
 * a bare header.
 */
export const DraftStatusHelper: React.FC<{onNavigate?: () => void; collapsible?: boolean}> = ({
  onNavigate,
  collapsible = true,
}) => {
  const isDesktop = useIsDesktop();
  const visible = useDraftStatusHelperVisible();
  // The county brush is invalid while broken into blocks (PaintByCounty
  // disables itself there); the hint must not force it on.
  const inBlockView = useMapStore(state => state.captiveIds.size > 0);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const openTabSection = useMapControlsStore(state => state.openTabSection);
  const request = useUiHintStore(state => state.request);
  const flash = useUiHintStore(state => state.flash);
  const handleMetadataChange = useMetadataChange();
  const {save} = useMapSaveStatus();
  // Status changes land silently in the topbar otherwise; the pulse both
  // confirms the change and teaches that the title icon is the status.
  const changeStatus = (status: DraftStatus) =>
    handleMetadataChange({draft_status: status}).then(() => flash('map-status-icon'));
  const {
    currentStatus,
    scratchDone,
    inProgressDone,
    contiguityStale,
    contiguityUnavailable,
    counts,
  } = useDraftStatusCriteria();

  const [storedCollapsed, setStoredCollapsed] = useState(false);
  useEffect(() => {
    setStoredCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);
  const collapsed = collapsible && storedCollapsed;
  const toggleCollapsed = () => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1');
    setStoredCollapsed(!collapsed);
  };

  if (!visible) return null;

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
    if (!isDesktop) {
      // Below lg the sidebar (and its sections) is hidden; open the matching
      // full-screen mobile panel instead. Sections without one (map options,
      // the demographic map layer) skip the jump — the hint's store change
      // (tooltip on, overlay active) already took effect on the visible map.
      const mobileTab = MOBILE_TAB_FOR_SECTION[sectionId];
      if (mobileTab) request('mobileTab', mobileTab);
      return;
    }
    openTabSection(sectionId);
    // Sequence the jump so the instant cut reads as a path: pulse the
    // destination tab label long enough to register, then switch and pulse
    // the section itself.
    flash(`tab:${tab}`);
    setTimeout(() => {
      request('sidebarTab', tab);
      flash(`section:${sectionId}`);
      setTimeout(() => scrollSectionIntoView(sectionId), 300);
    }, 1000);
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
              !inBlockView &&
              unassignedRatio !== undefined &&
              unassignedRatio > ROUGH_DRAW_UNASSIGNED_RATIO
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
      // Uncheckable/stale contiguity passes the gate (see the criteria hook)
      // but must not display as a confirmed pass.
      label: contiguityUnavailable
        ? 'Keep districts contiguous (not checked for this map)'
        : contiguityStale
          ? `Keep districts contiguous (?/${numDistricts}) — updates on save`
          : `Keep districts contiguous (${contiguousZones}/${numDistricts})`,
      done: contiguityUnavailable || contiguousZones >= numDistricts,
      muted: contiguityUnavailable || contiguityStale,
      // A stale result is waiting on a save, and the advance button stays
      // blocked until it lands — so offer the save right here rather than
      // leaving "updates on save" as the only clue.
      hints: contiguityStale
        ? [{label: 'Save now', onClick: () => save(false, {silent: true})}]
        : !contiguityUnavailable && contiguousZones < numDistricts
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

  const title = ['Get started', 'Refine and validate', 'Advanced plan evaluation'][displayStage];
  const items = displayStage === 0 ? scratchItems : displayStage === 1 ? refineItems : [];
  const showPointers = displayStage === 2;
  const doneCount = items.filter(s => s.done).length;
  // The box's advance button is the one earned move in the app (the status
  // controls are free choice): only from the un-regressed flow, only with the
  // shown stage's items done, and not while a stale contiguity result awaits
  // the next save. Un-regressed at stage 1 implies the scratch criteria hold.
  const nextStatus: DraftStatus | null =
    statusStage === 0
      ? DRAFT_STATUSES.IN_PROGRESS
      : statusStage === 1
        ? DRAFT_STATUSES.READY_TO_SHARE
        : null;
  const stageDone = displayStage === 0 ? scratchDone : displayStage === 1 ? inProgressDone : false;
  const canAdvance =
    !regressed && !!nextStatus && stageDone && !(statusStage === 1 && contiguityStale);

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
      <button
        type="button"
        onClick={collapsible ? toggleCollapsed : undefined}
        aria-expanded={!collapsed}
        className={`w-full text-left ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <Flex align="center" justify="between">
          <Text size="3" weight="bold">
            {title}
          </Text>
          <Flex align="center" gap="2">
            {!showPointers && !collapsed && (
              <Text size="1" color="gray">
                {doneCount} of {items.length} done
              </Text>
            )}
            {collapsible && (
              <ChevronDownIcon
                style={{
                  transform: collapsed ? 'rotate(-90deg)' : undefined,
                  transition: 'transform 0.15s',
                }}
              />
            )}
          </Flex>
        </Flex>
      </button>
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
            <InlineHintButton back onClick={() => changeStatus(previousStatus)}>
              <StatusGlyph status={previousStatus} inline />
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
                <InlineHintButton
                  onClick={() => {
                    pointer.onClick();
                    onNavigate?.();
                  }}
                >
                  {pointer.label}
                </InlineHintButton>
              </Text>
            ))}
          </Flex>
        </>
      )}
      {!collapsed &&
        items.map(step => (
          <Flex key={step.label} align="start" gap="2">
            <span className="pt-[3px]">
              <ItemMarker done={step.done && !step.muted} />
            </span>
            <Text size="2" color={step.done || step.muted ? 'gray' : undefined}>
              {step.label}
              {/* Muted counts as unfinished here: a stale contiguity result
                  displays as done but still needs its save. */}
              {(!step.done || step.muted) &&
                step.hints?.map((hint, i) => (
                  <React.Fragment key={hint.label}>
                    {/* Dot-separate consecutive hints so adjacent links don't
                        read as one phrase. */}
                    {i > 0 ? <span className="text-gray-400"> · </span> : ' '}
                    <InlineHintButton
                      onClick={() => {
                        hint.onClick();
                        onNavigate?.();
                      }}
                    >
                      {hint.label}
                    </InlineHintButton>
                  </React.Fragment>
                ))}
            </Text>
          </Flex>
        ))}
      {/* Backward moves are always free; the regressed note above carries its
          own step-back, so skip the duplicate there. */}
      {!collapsed && (canAdvance || (statusStage > 0 && !regressed)) && (
        <Flex align="center" gap="3">
          {statusStage > 0 && !regressed && (
            // size 2 to match the advance Button's own text beside it.
            <Text size="2">
              <InlineHintButton back onClick={() => changeStatus(previousStatus)}>
                <StatusGlyph status={previousStatus} inline />
                Move back to {DRAFT_STATUS_TEXT[previousStatus]}
              </InlineHintButton>
            </Text>
          )}
          {canAdvance && nextStatus && (
            <Button
              variant="solid"
              size="2"
              // The status's own color, the same one its badge carries
              // elsewhere — so the button reads as the status it produces
              // rather than as another blue action.
              color={DRAFT_STATUS_COLORS[nextStatus]}
              onClick={() => changeStatus(nextStatus)}
              style={{fontWeight: 600}}
              data-testid="advance-draft-status"
            >
              {/* The status it's moving to, shown as the same glyph the topbar
                  will then display. */}
              <StatusGlyph status={nextStatus} />
              Move to {DRAFT_STATUS_TEXT[nextStatus]}
            </Button>
          )}
        </Flex>
      )}
    </Flex>
  );
};
