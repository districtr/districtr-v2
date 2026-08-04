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

/** Dismissing in Super Draw persists (localStorage); in plain Draw it lasts
 * only the session. One store so every instance sees the same answer. */
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
  // Clears both variants so the other mode's dismissal can't keep it hidden.
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
  /** Hints are dot-separated alternatives; `and` joins steps of one operation
   * into a sentence. */
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
    // Wraps with its sentence — nowrap pushed the card wider than the box.
    className="inline cursor-pointer text-left hover:underline underline-offset-2 font-semibold text-districtrBlue"
  >
    {children}
  </button>
);

/** Topbar status glyph with its hardcoded 24px size and indicator fill
 * overridden to inherit. */
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

/** Dismissal state + restore for controls outside the box (Map actions'
 * "Show map guide"). `dismissed` is the current mode's variant; `restore`
 * clears both. */
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
  // County brush is disabled in block view; don't point the hint at a dead end.
  const inBlockView = useMapStore(state => state.captiveIds.size > 0);
  const request = useUiHintStore(state => state.request);
  const startGuide = useUiHintStore(state => state.startGuide);
  const flash = useUiHintStore(state => state.flash);
  const dismiss = useHelperDismissal(state => state.dismiss);
  const handleMetadataChange = useMetadataChange();
  // Pulse the topbar status icon so the change doesn't land silently.
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

  // The shown stage follows the user-chosen status alone — unmet criteria only
  // raise the step-back bubble, they never regress the stage.
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
  // Final stage auto-collapses; re-expanding sticks until the next mount.
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
  // Forward is earned: stage items done, nothing regressed, no stale
  // contiguity result pending.
  const nextStatus: DraftStatus | null =
    statusStage === 0
      ? DRAFT_STATUSES.IN_PROGRESS
      : statusStage === 1
        ? DRAFT_STATUSES.READY_TO_SHARE
        : null;
  const stageDone = statusStage === 0 ? scratchDone : statusStage === 1 ? inProgressDone : false;
  const canAdvance =
    !regressed && !!nextStatus && stageDone && !(statusStage === 1 && contiguityStale);

  // Earned criteria suggest the next status; a regressed plan suggests
  // stepping back. Bubble dismissal is keyed per suggestion.
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

  /** Guide to a sidebar section: tab, then section header, each on the user's
   * click. Below lg the sidebar is hidden — open the matching mobile panel
   * instead (sections without one skip the jump). */
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

  /** Guide to a tool-controls checkbox. Those disable themselves while no
   * painting tool is armed, so the guide starts at the brush button unless a
   * paint-capable tool is already active. */
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
              // The toggle lives in ToolControlsScaffold, outside any sidebar tab.
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
          ? `Are districts contiguous? (?/${numDistricts})`
          : `Are districts contiguous? (${contiguousZones}/${numDistricts})`,
      done: contiguityUnavailable || contiguousZones >= numDistricts,
      muted: contiguityUnavailable || contiguityStale,
      // Stale result waits on a save; point at the save button as step one.
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
    // Guides only: nothing opens on the user's behalf.
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
      // Fixed width only while expanded so the collapsed header hugs the corner.
      className={`max-w-full ${collapsed ? '' : 'w-[360px]'}`}
      // minWidth 0 lets the card shrink in its flex parent; overflowWrap here
      // covers every string in the card, including ones with no break point.
      style={{
        background: 'white',
        border: '1px solid var(--accent-8)',
        borderRadius: 10,
        boxShadow: '0 4px 12px var(--gray-a6)',
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
            // Confirm first — dismissal can be persistent (Super Draw).
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
                      // Persistent in Super Draw, per-session in plain Draw.
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
      {/* Status stepper: clicking any segment sets that status; the nudge
          arrives as a dismissible bubble over the recommended segment. */}
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
            // Forward moves must be earned; moving back is always allowed.
            const unlockedStage = !scratchDone ? 0 : !inProgressDone || contiguityStale ? 1 : 2;
            const locked = idx > statusStage && idx > unlockedStage;
            return (
              // relative anchors the bubble; no overflow-hidden on the row
              // (it would clip the bubble), so end segments round themselves.
              <div key={status} className="relative flex-1 min-w-0">
                {suggested && suggestion && (
                  <>
                    <Flex
                      role="status"
                      align="start"
                      gap="1"
                      p="2"
                      // Edge segments anchor to the card edge so the bubble
                      // can't spill and cause a horizontal scrollbar.
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
                    {/* Caret: a sibling of the bubble so it stays centered on
                        the segment even when the bubble is edge-anchored. */}
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
                  disabled={locked}
                  title={locked ? 'Complete the current checklist first' : undefined}
                  aria-current={isCurrentStatus || undefined}
                  className={`w-full px-1 py-2 flex flex-col items-center gap-1 transition-colors ${
                    idx > 0 ? 'border-l border-[var(--accent-6)]' : ''
                  } ${
                    locked
                      ? 'cursor-not-allowed opacity-50'
                      : `cursor-pointer ${isCurrentStatus ? '' : 'hover:bg-[var(--gray-a2)]'}`
                  }`}
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
