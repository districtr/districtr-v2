'use client';
import React, {useEffect, useState} from 'react';
import {create} from 'zustand';
import {AlertDialog, Button, Flex, IconButton, Text} from '@radix-ui/themes';
import {CheckIcon, ChevronDownIcon, Cross2Icon, MinusIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore, type MapControlsStore} from '@/app/store/mapControlsStore';
import {useIsDesktop} from '@/app/hooks/useIsDesktop';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useUiHintStore, type ValidationTab} from '@/app/store/uiHintStore';
import {useDraftStatusCriteria, BALANCE_DEVIATION} from '@/app/hooks/useDraftStatusCriteria';
import {useMetadataChange} from '@/app/hooks/useMetadataChange';
import {statusIcons} from '@components/Topbar/MapStatus';
import {formatNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {
  DRAFT_STATUSES,
  DRAFT_STATUS_TEXT,
  DRAFT_STATUS_ORDER,
  DRAFT_STATUS_COLORS,
  type DraftStatus,
} from '@constants/document/draftStatus';
import {MAP_MODES} from '@constants/map/mode';
import {ACTIVE_TOOLS} from '@constants/map/tools';

const COLLAPSE_KEY = 'districtr-draft-helper-collapsed';
const DISMISS_KEY = 'districtr-draft-helper-dismissed';
// Above this share of unassigned population, suggest the county brush for
// rough drawing; below it, point at the unassigned-areas finder.
const ROUGH_DRAW_UNASSIGNED_RATIO = 0.25;

// Sidebar sections → the mobile full-screen panel holding the same content.
const MOBILE_TAB_FOR_SECTION: Record<string, MapControlsStore['sidebarPanels'][number]> = {
  'stats-validity': 'mapValidation',
  'stats-demographics': 'demography',
  'stats-elections': 'election',
};

/** Dismissal is mode-dependent by design: dismissing in Super Draw sticks
 * across sessions (localStorage — an expert opted out for good), while
 * dismissing in plain Draw lasts only this session; the box returns on the
 * next visit. One store so every instance (map overlay, mobile guide button)
 * sees the same answer. */
const useHelperDismissal = create<{
  sessionDismissed: boolean;
  superDrawDismissed: boolean;
  hydrate: () => void;
  dismiss: (persist: boolean) => void;
  restore: () => void;
}>(set => ({
  sessionDismissed: false,
  superDrawDismissed: false,
  // localStorage is client-only; callers hydrate from an effect.
  hydrate: () => set({superDrawDismissed: localStorage.getItem(DISMISS_KEY) === '1'}),
  dismiss: persist => {
    if (persist) {
      localStorage.setItem(DISMISS_KEY, '1');
      set({superDrawDismissed: true});
    } else {
      set({sessionDismissed: true});
    }
  },
  // Restore clears both variants: the user asked for the guide back, so no
  // stale dismissal from the other draw mode should keep it hidden.
  restore: () => {
    localStorage.removeItem(DISMISS_KEY);
    set({sessionDismissed: false, superDrawDismissed: false});
  },
}));

type Hint = {label: string; onClick: () => void};
type ChecklistItem = {
  label: string;
  done: boolean;
  /** Gray the row and show the pending dash even if done — the value is
   * stale or uncheckable, not a confirmed pass. */
  muted?: boolean;
  hints?: Hint[];
  /** Hints are alternatives by default, dot-separated. `and` joins them into
   * one sentence instead, for hints that are steps of a single operation —
   * so the first doesn't read as the whole job. */
  hintsJoin?: 'and';
};

/** Link-styled action that flows inline with the checklist text instead of
 * occupying its own row. */
const InlineHintButton: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
}> = ({onClick, children}) => (
  <button
    type="button"
    onClick={onClick}
    // Wraps with the sentence it sits in. It used to be nowrap so a link
    // couldn't break across lines, but these labels are long enough
    // ("Paint by counties to roughly draw districts") that nowrap pushed the
    // card wider than the box instead.
    className="inline cursor-pointer text-left hover:underline underline-offset-2 font-semibold text-districtrBlue"
  >
    {children}
  </button>
);

/** The topbar's own status glyph, wherever a control names a draft status.
 * Those icons hardcode a 24px size and their own indicator fill, so both are
 * overridden here to inherit from whatever the glyph sits in. */
const StatusGlyph: React.FC<{status: DraftStatus}> = ({status}) => (
  <span className="inline-flex align-middle [&_svg]:size-[18px] [&_svg]:!fill-current" aria-hidden>
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
  const sessionDismissed = useHelperDismissal(state => state.sessionDismissed);
  const superDrawDismissed = useHelperDismissal(state => state.superDrawDismissed);
  const hydrate = useHelperDismissal(state => state.hydrate);
  useEffect(() => hydrate(), [hydrate]);
  const dismissed = superDraw ? superDrawDismissed : sessionDismissed;
  return !dismissed && isEditing && mapMode === MAP_MODES.DISTRICTS && !!documentId;
};

/** Dismissal state + restore, for controls living outside the box itself
 * (the Map actions menu's "Show map guide" item). `dismissed` reflects the
 * current draw mode's variant; `restore` clears both, so the guide comes back
 * no matter which mode hid it. */
export const useDraftStatusHelperDismissal = () => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const sessionDismissed = useHelperDismissal(state => state.sessionDismissed);
  const superDrawDismissed = useHelperDismissal(state => state.superDrawDismissed);
  const restore = useHelperDismissal(state => state.restore);
  const hydrate = useHelperDismissal(state => state.hydrate);
  useEffect(() => hydrate(), [hydrate]);
  return {dismissed: superDraw ? superDrawDismissed : sessionDismissed, restore};
};

/**
 * Helper card overlaying the map's top-right: Get started (scratch) → Refine
 * and validate (in progress) → Advanced plan evaluation (ready to share). The
 * header names the stage of the user-chosen draft status, and the body shows
 * that one stage's question checklist — the stage follows the status alone
 * and never moves on its own when the stats change. Across the bottom, the
 * three draft statuses lay out as a stepper row — the current one lit in its
 * status color, the others muted — and clicking a segment sets that status
 * (free choice, as everywhere else). The stats only ever suggest: earned
 * criteria raise a dismissible bubble over the next status, and a plan that
 * no longer meets its status's checks raises one over the status to step
 * back to.
 *
 * Hints guide, they don't click: every hint starts a guided sequence
 * (uiHintStore.guideTargets) that pulses each control until the user clicks
 * it themselves — nothing toggles, saves, or opens on the user's behalf.
 *
 * Collapsible and dismissible. Super Draw starts collapsed — experts asked
 * for the map, not the tutorial — and reaching the final stage auto-collapses
 * it. Dismissal persistence is mode-dependent (see useHelperDismissal).
 *
 * `onNavigate` fires after any hint that points somewhere else in the app —
 * the mobile modal closes itself so the hint's target isn't buried under it.
 * The modal instance sets `collapsible` false: its dialog already opens and
 * closes, so an inner collapse (persisted from the overlay) would just show
 * a bare header — and it hides the dismiss control too, since the dialog's
 * own close covers it.
 */
export const DraftStatusHelper: React.FC<{onNavigate?: () => void; collapsible?: boolean}> = ({
  onNavigate,
  collapsible = true,
}) => {
  const isDesktop = useIsDesktop();
  const visible = useDraftStatusHelperVisible();
  const superDraw = useToolbarStore(state => state.superDraw);
  // The county brush is unavailable while broken into blocks (PaintByCounty
  // disables itself there); the hint must not point at a dead end.
  const inBlockView = useMapStore(state => state.captiveIds.size > 0);
  const request = useUiHintStore(state => state.request);
  const startGuide = useUiHintStore(state => state.startGuide);
  const flash = useUiHintStore(state => state.flash);
  const dismiss = useHelperDismissal(state => state.dismiss);
  const handleMetadataChange = useMetadataChange();
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

  // The shown stage follows the user-chosen status alone — it never regresses
  // on its own when the stats fall below the bar. A plan whose criteria sit
  // below its status (e.g. population unassigned while marked In Progress)
  // keeps its stage; the only response is the dismissible step-back bubble
  // over the status row.
  const statusStage =
    currentStatus === DRAFT_STATUSES.SCRATCH
      ? 0
      : currentStatus === DRAFT_STATUSES.IN_PROGRESS
        ? 1
        : 2;
  const criteriaStage = !scratchDone ? 0 : !inProgressDone ? 1 : 2;
  const regressed = criteriaStage < statusStage;

  // Collapse: an explicit toggle persists; without one, Super Draw defaults
  // collapsed (plain Draw expanded).
  const [storedCollapsed, setStoredCollapsed] = useState<boolean | null>(null);
  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    setStoredCollapsed(stored === null ? null : stored === '1');
  }, []);
  // Reaching the final stage auto-collapses the box — the plan is done and the
  // checklists no longer need map real estate; re-expanding is one click and
  // sticks until the next mount at that stage.
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const atFinalStage = statusStage === 2;
  useEffect(() => {
    if (atFinalStage) setAutoCollapsed(true);
  }, [atFinalStage]);
  const collapsed = collapsible && (autoCollapsed || (storedCollapsed ?? superDraw));
  const toggleCollapsed = () => {
    setAutoCollapsed(false);
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1');
    setStoredCollapsed(!collapsed);
  };

  const previousStatus: DraftStatus =
    statusStage === 2 ? DRAFT_STATUSES.IN_PROGRESS : DRAFT_STATUSES.SCRATCH;
  // A move forward is earned: only with the current stage's items done, not
  // while its earlier criteria have regressed (the back-suggestion wins), and
  // not while a stale contiguity result awaits the next save.
  const nextStatus: DraftStatus | null =
    statusStage === 0
      ? DRAFT_STATUSES.IN_PROGRESS
      : statusStage === 1
        ? DRAFT_STATUSES.READY_TO_SHARE
        : null;
  const stageDone = statusStage === 0 ? scratchDone : statusStage === 1 ? inProgressDone : false;
  const canAdvance =
    !regressed && !!nextStatus && stageDone && !(statusStage === 1 && contiguityStale);

  // What the stats say about the status row: earned criteria suggest the next
  // status forward; a regressed plan suggests stepping back. The bubble is
  // dismissible per suggestion — keyed on target and direction, so dismissing
  // "mark it In Progress" doesn't also swallow a later "mark it Ready".
  const suggestion: {status: DraftStatus; direction: 'forward' | 'back'} | null =
    canAdvance && nextStatus
      ? {status: nextStatus, direction: 'forward'}
      : regressed
        ? {status: previousStatus, direction: 'back'}
        : null;
  const suggestionKey = suggestion ? `${suggestion.direction}:${suggestion.status}` : null;
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(null);
  const showSuggestion = !!suggestionKey && dismissedSuggestion !== suggestionKey;

  if (!visible) return null;

  const {paintedZones, numDistricts, unassigned, contiguousZones, maxDeviation, idealPopulation} =
    counts;
  const unassignedRatio =
    unassigned !== undefined && idealPopulation
      ? unassigned / (idealPopulation * numDistricts)
      : undefined;

  /** Guide the user to a sidebar section: pulse the destination tab until
   * they click it, then the section header (skipped automatically when
   * already active/open — see the guide consumers in WorkflowTabs). Below lg
   * the sidebar is hidden, so open the matching full-screen mobile panel
   * instead; sections without one skip the jump — the hint's store change
   * (tooltip on, overlay active) already took effect on the visible map. */
  const guideToSection = (tab: 'stats' | 'mapLayers', sectionId: string) => {
    if (!isDesktop) {
      const mobileTab = MOBILE_TAB_FOR_SECTION[sectionId];
      if (mobileTab) request('mobileTab', mobileTab);
      return;
    }
    startGuide([`tab:${tab}`, `section:${sectionId}`]);
  };

  /** Guide to a validation panel: tab → Validity section → the panel itself,
   * each step waiting on the user's own click. The mobile panel holds the
   * validation checks directly, so only the last step applies there. */
  const guideToValidation = (tab: ValidationTab) => {
    if (!isDesktop) {
      request('mobileTab', 'mapValidation');
      startGuide([`validation:${tab}`]);
      return;
    }
    startGuide(['tab:stats', 'section:stats-validity', `validation:${tab}`]);
  };

  /** Guide to a checkbox in the paint scaffold's tool controls (the county
   * brush, the population tooltip). Those checkboxes disable themselves while
   * no painting tool is armed (Pan, pre-break Shatter), so the guide starts
   * one step earlier — at the brush button — unless a paint-capable tool is
   * already active. */
  const guideToBrushControl = (target: string) => {
    const {activeTool} = useMapControlsStore.getState();
    const paintCapable = activeTool === ACTIVE_TOOLS.BRUSH || activeTool === ACTIVE_TOOLS.ERASER;
    startGuide(paintCapable ? [target] : [`tool:${ACTIVE_TOOLS.BRUSH}`, target]);
  };

  const scratchItems: ChecklistItem[] = [
    {
      label: `Are all districts started? (${paintedZones}/${numDistricts})`,
      done: paintedZones >= numDistricts,
    },
    {
      label: `Has all population been assigned to a district?${
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
                    onClick: () => guideToBrushControl('county-brush'),
                  }
                : {
                    label: 'Find unassigned areas',
                    onClick: () => guideToValidation('Completeness'),
                  },
            ]
          : undefined,
    },
  ];

  const balanced = maxDeviation !== undefined && maxDeviation <= BALANCE_DEVIATION;
  const refineItems: ChecklistItem[] = [
    {
      label: `Are districts roughly balanced? (within ${formatNumber(
        BALANCE_DEVIATION,
        NUMBER_FORMATS.PERCENT
      )} of ideal${
        maxDeviation !== undefined
          ? `; largest deviation ${formatNumber(maxDeviation, NUMBER_FORMATS.PERCENT)}`
          : ''
      })`,
      done: balanced,
      hints: !balanced
        ? [
            {
              // The toggle lives in ToolControlsScaffold's right column, not
              // inside any sidebar tab — the guide points there directly.
              label: 'Show population tooltips as you paint',
              onClick: () => guideToBrushControl('population-tooltip'),
            },
            {
              label: 'Show the demographic map',
              onClick: () => guideToSection('mapLayers', 'layers-demographics'),
            },
          ]
        : undefined,
    },
    {
      // Uncheckable/stale contiguity passes the gate (see the criteria hook)
      // but must not display as a confirmed pass.
      label: contiguityUnavailable
        ? 'Are districts contiguous? (not checked for this map)'
        : contiguityStale
          ? // No "— updates on save" here: the Save now hint below says it, and
            // says it as something to click.
            `Are districts contiguous? (?/${numDistricts})`
          : `Are districts contiguous? (${contiguousZones}/${numDistricts})`,
      done: contiguityUnavailable || contiguousZones >= numDistricts,
      muted: contiguityUnavailable || contiguityStale,
      // A stale result is waiting on a save, and the forward suggestion stays
      // withheld until it lands — so point at the save button right here
      // rather than leaving "updates on save" as the only clue. The save
      // alone settles nothing visible, so it's phrased as the first of two
      // steps.
      hints: contiguityStale
        ? [
            {label: 'Save now', onClick: () => startGuide(['save-button'])},
            {
              label: 'find disconnected fragments',
              onClick: () => guideToValidation('Contiguity'),
            },
          ]
        : !contiguityUnavailable && contiguousZones < numDistricts
          ? [
              {
                label: 'Find disconnected fragments',
                onClick: () => guideToValidation('Contiguity'),
              },
            ]
          : undefined,
      hintsJoin: contiguityStale ? 'and' : undefined,
    },
  ];

  const advancedPointers: Hint[] = [
    // Guides only: pulse the real control (topbar dropdowns) and let the user
    // do the clicking — nothing opens on their behalf.
    {label: 'Share your map', onClick: () => startGuide(['map-actions', 'map-actions-share'])},
    {
      label: 'Explore demographics',
      onClick: () => guideToSection('stats', 'stats-demographics'),
    },
    {
      label: 'Review election results',
      onClick: () => guideToSection('stats', 'stats-elections'),
    },
    // Pointless to suggest Super Draw to someone already in it.
    ...(superDraw
      ? []
      : [
          {
            label: 'Fine-tune in Super Draw',
            onClick: () => startGuide(['mode-switcher', 'mode-superdraw']),
          },
        ]),
    {label: 'Evaluate your plan', onClick: () => startGuide(['mode-switcher', 'mode-evaluate'])},
  ];

  const stages: Array<{title: string; items: ChecklistItem[]}> = [
    {title: 'Get started', items: scratchItems},
    {title: 'Refine and validate', items: refineItems},
    {title: 'Advanced plan evaluation', items: []},
  ];
  const currentItems = stages[statusStage].items;
  const doneCount = currentItems.filter(s => s.done).length;

  return (
    <Flex
      direction="column"
      gap="2"
      p="3"
      flexShrink="0"
      // Fixed width only while expanded; collapsed the card shrinks to its
      // header so the right-anchored overlay hugs the map's top-right corner
      // instead of holding a 360px slab open.
      className={`max-w-full ${collapsed ? '' : 'w-[360px]'}`}
      // Accent-tinted chrome so the helper reads as its own layer over the
      // map, distinct from the map pills and the white panels around it.
      //
      // minWidth 0 lets the card shrink inside its flex parent instead of
      // being held open by its widest line; overflowWrap is inherited, so
      // declaring it once here covers every string in the card — including
      // ones with no space to break at, like a long map name.
      style={{
        background: 'var(--accent-2)',
        border: '1px solid var(--accent-6)',
        borderRadius: 10,
        minWidth: 0,
        overflowWrap: 'anywhere',
      }}
      data-testid="draft-status-helper"
    >
      <Flex align="center" justify="between" gap="2">
        <button
          type="button"
          onClick={collapsible ? toggleCollapsed : undefined}
          aria-expanded={!collapsed}
          className={`flex-1 text-left ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
          style={{minWidth: 0}}
        >
          <Flex align="center" gap="2">
            {/* The header names the current stage — the box shows one stage
                at a time, so the title is the place the user reads where
                they are. */}
            <Text size="3" weight="bold" style={{minWidth: 0}}>
              {stages[statusStage].title}
            </Text>
          </Flex>
        </button>
        <Flex align="center" gap="2" flexShrink="0">
          {currentItems.length > 0 && (
            <Text size="1" color="gray">
              {doneCount} of {currentItems.length} done
            </Text>
          )}
          {collapsible && (
            <IconButton
              variant="ghost"
              color="gray"
              size="1"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand map guide' : 'Collapse map guide'}
              className="cursor-pointer"
            >
              <ChevronDownIcon
                style={{
                  transform: collapsed ? 'rotate(-90deg)' : undefined,
                  transition: 'transform 0.15s',
                }}
              />
            </IconButton>
          )}
          {collapsible && (
            // Confirmation first: dismissal can be persistent (Super Draw),
            // so the dialog names the way back before anything disappears.
            <AlertDialog.Root>
              <AlertDialog.Trigger>
                <IconButton
                  variant="ghost"
                  color="gray"
                  size="1"
                  aria-label="Dismiss map guide"
                  data-testid="dismiss-draft-status"
                  className="cursor-pointer"
                >
                  <Cross2Icon />
                </IconButton>
              </AlertDialog.Trigger>
              <AlertDialog.Content maxWidth="450px">
                <AlertDialog.Title>Hide the map guide?</AlertDialog.Title>
                <AlertDialog.Description size="2">
                  You can restore the map guide anytime from the Map actions menu in the top bar.
                </AlertDialog.Description>
                <Flex gap="3" mt="4" justify="end">
                  <AlertDialog.Cancel>
                    <Button variant="soft" color="gray">
                      Cancel
                    </Button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action>
                    <Button
                      variant="solid"
                      // Persistent in Super Draw, per-session in plain Draw
                      // (see useHelperDismissal).
                      onClick={() => dismiss(superDraw)}
                      data-testid="confirm-dismiss-draft-status"
                    >
                      Hide guide
                    </Button>
                  </AlertDialog.Action>
                </Flex>
              </AlertDialog.Content>
            </AlertDialog.Root>
          )}
        </Flex>
      </Flex>
      {!collapsed && statusStage === 2 && (
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
        currentItems.map(step => (
          <Flex key={step.label} align="start" gap="2" minWidth="0">
            <span className="pt-[3px] shrink-0">
              <ItemMarker done={step.done && !step.muted} />
            </span>
            <Text
              size="2"
              color={step.done || step.muted ? 'gray' : undefined}
              style={{minWidth: 0}}
            >
              {step.label}
              {/* Muted counts as unfinished here: a stale contiguity result
                  displays as done but still needs its save. */}
              {(!step.done || step.muted) &&
                step.hints?.map((hint, i) => (
                  <React.Fragment key={hint.label}>
                    {/* Alternatives are dot-separated so adjacent links don't
                        read as one phrase; steps of one operation are joined
                        into a sentence instead. */}
                    {i === 0 ? (
                      ' '
                    ) : step.hintsJoin === 'and' ? (
                      ' and '
                    ) : (
                      <span className="text-gray-400"> · </span>
                    )}
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
      {/* The status stepper: all three draft statuses across the bottom, the
          current one lit in its own status color. Every segment is a free
          choice — clicking sets that status — and the stats-earned nudge
          (forward when the stage's criteria pass, backward when the plan has
          regressed) arrives as a dismissible bubble anchored over the segment
          it recommends. */}
      {!collapsed && (
        <Flex
          className="w-full"
          role="group"
          aria-label="Draft status"
          style={{
            border: '1px solid var(--accent-6)',
            borderRadius: 8,
            background: 'var(--color-surface)',
          }}
          data-testid="draft-status-row"
        >
          {DRAFT_STATUS_ORDER.map((status, idx) => {
            const isCurrentStatus = status === currentStatus;
            const color = DRAFT_STATUS_COLORS[status];
            const suggested = showSuggestion && suggestion?.status === status;
            return (
              // relative so the suggestion bubble can anchor over the exact
              // segment it recommends. No overflow-hidden on the row (it
              // would clip the bubble), so the end segments round themselves.
              <div key={status} className="relative flex-1 min-w-0">
                {suggested && suggestion && (
                  <>
                    <Flex
                      role="status"
                      align="start"
                      gap="1"
                      p="2"
                      // Edge segments anchor the bubble to the card's own edge
                      // instead of centering it, so it can't spill past the
                      // card and hand the overlay a horizontal scrollbar.
                      className={`absolute bottom-full mb-2 w-max max-w-[200px] z-10 ${
                        idx === 0
                          ? 'left-0'
                          : idx === DRAFT_STATUS_ORDER.length - 1
                            ? 'right-0'
                            : 'left-1/2 -translate-x-1/2'
                      }`}
                      style={{
                        background:
                          suggestion.direction === 'forward' ? 'var(--accent-3)' : 'var(--amber-3)',
                        border: `1px solid ${
                          suggestion.direction === 'forward' ? 'var(--accent-7)' : 'var(--amber-7)'
                        }`,
                        borderRadius: 6,
                        boxShadow: 'var(--shadow-3)',
                      }}
                      data-testid="draft-status-suggestion"
                    >
                      <Text size="1">
                        {suggestion.direction === 'forward'
                          ? `Your plan looks ready — mark it “${DRAFT_STATUS_TEXT[status]}”.`
                          : `Your plan no longer meets the checks for “${DRAFT_STATUS_TEXT[currentStatus]}” — consider moving back.`}
                      </Text>
                      <IconButton
                        variant="ghost"
                        color="gray"
                        size="1"
                        onClick={() => setDismissedSuggestion(suggestionKey)}
                        aria-label="Dismiss suggestion"
                        className="cursor-pointer shrink-0"
                      >
                        <Cross2Icon width={12} height={12} />
                      </IconButton>
                    </Flex>
                    {/* Caret pointing down at the recommended segment — a
                        sibling of the bubble (not a child), so it stays
                        centered on the segment even when the bubble is
                        edge-anchored. Border only on the two lower edges;
                        the upper half hides under the bubble's body. */}
                    <span
                      aria-hidden
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[3px] size-[10px] rotate-45 z-[11]"
                      style={{
                        background:
                          suggestion.direction === 'forward' ? 'var(--accent-3)' : 'var(--amber-3)',
                        borderRight: `1px solid ${
                          suggestion.direction === 'forward' ? 'var(--accent-7)' : 'var(--amber-7)'
                        }`,
                        borderBottom: `1px solid ${
                          suggestion.direction === 'forward' ? 'var(--accent-7)' : 'var(--amber-7)'
                        }`,
                      }}
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => changeStatus(status)}
                  aria-current={isCurrentStatus || undefined}
                  className={`w-full cursor-pointer px-1 py-2 flex flex-col items-center gap-1 transition-colors ${
                    idx > 0 ? 'border-l border-[var(--accent-6)]' : ''
                  } ${isCurrentStatus ? '' : 'hover:bg-[var(--gray-a2)]'}`}
                  style={{
                    borderRadius:
                      idx === 0
                        ? '7px 0 0 7px'
                        : idx === DRAFT_STATUS_ORDER.length - 1
                          ? '0 7px 7px 0'
                          : 0,
                    ...(isCurrentStatus
                      ? {
                          background: `var(--${color}-a4)`,
                          color: `var(--${color}-11)`,
                          fontWeight: 600,
                        }
                      : {color: 'var(--gray-9)'}),
                  }}
                  data-testid={`draft-status-${status}`}
                >
                  <StatusGlyph status={status} />
                  <Text size="1" align="center" style={{lineHeight: 1.2, color: 'inherit'}}>
                    {DRAFT_STATUS_TEXT[status]}
                  </Text>
                </button>
              </div>
            );
          })}
        </Flex>
      )}
    </Flex>
  );
};
