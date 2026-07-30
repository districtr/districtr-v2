'use client';
import React, {useState} from 'react';
import {Box, Button, Flex, IconButton, Text, Tooltip} from '@radix-ui/themes';
import {
  CheckIcon,
  EyeNoneIcon,
  EyeOpenIcon,
  LockClosedIcon,
  LockOpen2Icon,
} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {ZoneDescriptionPopover} from './ZoneDescriptionPopover';
import {ConditionalScrollArea} from '../ConditionalScrollArea';
import {ShowAllDistrictsButton} from '../ShowAllDistrictsButton';
import {formatNumber} from '@utils/numbers';
import {HelpTip, HELP_TIP_FAST_DELAY} from '@components/HelpTip/HelpTip';
import {useUiHintStore} from '@store/uiHintStore';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {ACCESS_STATES} from '@constants/document/state';

const POP_COL_WIDTH = 84;
// A district reads as overfull once it passes ideal population by 5%.
const OVERFULL_RATIO = 1.05;
const ROW_SCROLL_THRESHOLD = 10;
// Ideal population sits at a fixed tick partway along the track, so a bar can
// visibly cross it: the red excess segment past the tick shows how far over a
// district is (up to 1/IDEAL_TICK = 125% of ideal before clamping).
const IDEAL_TICK = 0.8;
// Within this share of ideal a district counts as balanced and its row earns
// a green check — the per-row "correct guess" moment.
const BALANCED_TOLERANCE = 0.01;
// A playful spring so bars visibly *land* when population changes.
const BAR_SPRING = 'width 350ms cubic-bezier(0.34, 1.56, 0.64, 1)';
// Wordle green, roughly; Radix grass-9 keeps it on-palette.
const SUCCESS_COLOR = 'var(--grass-9)';

// Scoreboard-style stat labels: small caps, wide tracking.
const STAT_LABEL_STYLE: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 11,
};

// Unicode minus to match the tabular figures.
const signedNumber = (value: number) =>
  `${value < 0 ? '−' : '+'}${formatNumber(Math.abs(value), NUMBER_FORMATS.STRING)}`;

/**
 * District overview as a set of population meters: each district's colored bar
 * fills toward a shared ideal line, turning red past it. Bars are identified
 * by color alone; district number and exact deviation live in the hover
 * tooltip. Two plan-wide lines (unassigned, max deviation) sit at the bottom.
 */
export const DistrictMeters = () => {
  const {populationData} = useZonePopulations();
  const {summaryStats} = useSummaryStats();
  const idealPopulation = summaryStats?.idealpop;
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const lockPaintedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const setLockedZones = useMapControlsStore(state => state.setLockedZones);
  const higlightUnassigned = useMapControlsStore(
    state => state.mapOptions.higlightUnassigned ?? false
  );
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const requestSidebarTab = useUiHintStore(state => state.requestSidebarTab);
  const requestValidationTab = useUiHintStore(state => state.requestValidationTab);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const superDraw = useToolbarStore(state => state.superDraw);
  const access = useMapStore(state => state.mapStatus?.access);
  const getZoneColor = useZoneColorGetter();
  const selectCommunity = useSelectCommunity();

  // Plain Draw always shows every district's bar. Super Draw hides unstarted
  // districts by default (small plans still default to all); null = no
  // explicit choice.
  const [showAllOverride, setShowAllOverride] = useState<boolean | null>(null);
  const showAll = !superDraw || (showAllOverride ?? populationData.length < 10);
  const startedData = populationData.filter(d => (d.total_pop_20 ?? 0) > 0);
  const visibleData = showAll ? populationData : startedData;
  const hiddenCount = populationData.length - startedData.length;

  const isReadOnly = access === ACCESS_STATES.READ;
  const allPainted =
    populationData.length > 0 && populationData.every(d => (d.total_pop_20 ?? 0) > 0);
  // The single worst signed deviation from ideal across districts.
  const maxDeviation =
    allPainted && idealPopulation
      ? populationData.reduce((worst, d) => {
          const deviation = (d.total_pop_20 ?? 0) - idealPopulation;
          return Math.abs(deviation) > Math.abs(worst) ? deviation : worst;
        }, 0)
      : undefined;
  const unassigned = summaryStats?.unassigned;
  const allAssigned = unassigned === 0;
  const allBalanced =
    maxDeviation !== undefined &&
    !!idealPopulation &&
    Math.abs(maxDeviation / idealPopulation) <= BALANCED_TOLERANCE;
  const planComplete = allAssigned && allBalanced;

  const handleLockChange = (zone: number) => {
    if (lockPaintedAreas.includes(zone)) {
      setLockedZones(lockPaintedAreas.filter(f => f !== zone));
    } else {
      setLockedZones([...lockPaintedAreas, zone]);
    }
  };

  const handleFindUnassigned = () => {
    requestValidationTab('Completeness');
    requestSidebarTab('evaluation');
  };

  return (
    <Flex direction="column" gap="0" mt="2">
      {/* The ideal population, labeled where its line crosses the bars. */}
      {!!idealPopulation && (
        <Flex gap="1" px="1" pb="1">
          <Box flexGrow="1" style={{position: 'relative', height: 16}}>
            <Text
              size="1"
              color="gray"
              style={{
                position: 'absolute',
                left: `${IDEAL_TICK * 100}%`,
                bottom: 0,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              Ideal {formatNumber(idealPopulation, NUMBER_FORMATS.STRING)}
            </Text>
          </Box>
          <Box style={{width: POP_COL_WIDTH, flexShrink: 0}} />
        </Flex>
      )}
      <ConditionalScrollArea
        shouldUseScrollableRows={visibleData.length > ROW_SCROLL_THRESHOLD}
        maxHeight="60vh"
      >
        <Flex direction="column" gap="0">
          {visibleData.map(d => {
            const population = d.total_pop_20 ?? 0;
            const fill = idealPopulation ? population / idealPopulation : 0;
            const overfull = fill > OVERFULL_RATIO;
            const color = getZoneColor(d.zone);
            const locked = lockPaintedAreas.includes(d.zone);
            const deviation = idealPopulation ? population - idealPopulation : undefined;
            const tooltip =
              deviation !== undefined && idealPopulation
                ? `District ${d.zone}: ${signedNumber(deviation)} vs. ideal (${
                    deviation < 0 ? '−' : '+'
                  }${formatNumber(Math.abs(deviation / idealPopulation), NUMBER_FORMATS.PERCENT)})`
                : `District ${d.zone}`;
            const balanced =
              population > 0 &&
              deviation !== undefined &&
              !!idealPopulation &&
              Math.abs(deviation / idealPopulation) <= BALANCED_TOLERANCE;
            return (
              <Flex
                key={d.zone}
                align="center"
                gap="1"
                px="1"
                py="1"
                onClick={() => selectCommunity(d.zone)}
                className={`cursor-pointer rounded-md transition-colors duration-150 ${
                  selectedZone === d.zone ? 'bg-[var(--accent-3)]' : 'hover:bg-[var(--gray-2)]'
                }`}
                data-testid={`district-meter-row-${d.zone}`}
              >
                {/* Comment and per-district lock are Super Draw features; plain
                    Draw rows are just the bar and its total. Icons manage their
                    own interactions; don't let clicks re-select the row. */}
                {superDraw && isEditing && (
                  <Flex align="center" gap="1" flexShrink="0" onClick={e => e.stopPropagation()}>
                    <ZoneDescriptionPopover zone={d.zone} color={color} />
                    <Tooltip
                      content={
                        locked
                          ? 'Unlock this district to allow painting over it'
                          : "Lock this district so it can't be painted over"
                      }
                    >
                      <IconButton
                        onClick={() => handleLockChange(d.zone)}
                        variant="ghost"
                        size="1"
                        disabled={isReadOnly}
                        aria-label={
                          locked ? `Unlock district ${d.zone}` : `Lock district ${d.zone}`
                        }
                      >
                        {locked ? <LockClosedIcon /> : <LockOpen2Icon />}
                      </IconButton>
                    </Tooltip>
                  </Flex>
                )}
                {/* District number and exact deviation live in the hover
                    tooltip; the bar's color and tick carry the story. */}
                <Tooltip content={tooltip}>
                  <Box flexGrow="1" style={{height: 16, position: 'relative'}}>
                    {/* Track clips the fills; the tick renders outside it so it
                      can overhang the bar's height. */}
                    <Box
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 99,
                        background: 'var(--gray-a4)',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        style={{
                          width: `${Math.min(1, fill) * IDEAL_TICK * 100}%`,
                          height: '100%',
                          background: color,
                          transition: BAR_SPRING,
                        }}
                      />
                      {/* Population past ideal crosses the tick in black. */}
                      {fill > 1 && (
                        <Box
                          style={{
                            position: 'absolute',
                            left: `${IDEAL_TICK * 100}%`,
                            top: 0,
                            bottom: 0,
                            width: `${(Math.min(fill, 1 / IDEAL_TICK) - 1) * IDEAL_TICK * 100}%`,
                            background: 'var(--gray-12)',
                            transition: BAR_SPRING,
                          }}
                        />
                      )}
                    </Box>
                    {/* Per-row segment of the shared ideal line. The ±8px
                        overhang bridges the gap to the neighboring rows' bars.
                        ponytail: 8 = (32px row rhythm − 16px bar) / 2; if row
                        height changes the line gets gaps or overlap. */}
                    <Box
                      style={{
                        position: 'absolute',
                        left: `${IDEAL_TICK * 100}%`,
                        top: -8,
                        bottom: -8,
                        width: 2,
                        marginLeft: -1,
                        background: 'var(--gray-a6)',
                      }}
                    />
                  </Box>
                </Tooltip>
                {/* Balanced rows earn a green check — the per-row "got it"
                    moment. */}
                <Flex
                  align="center"
                  justify="end"
                  gap="1"
                  style={{width: POP_COL_WIDTH, flexShrink: 0}}
                >
                  {balanced && <CheckIcon style={{color: SUCCESS_COLOR}} width={14} height={14} />}
                  <Text
                    size="2"
                    color={overfull ? 'red' : 'gray'}
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      ...(balanced ? {color: SUCCESS_COLOR, fontWeight: 600} : {}),
                    }}
                  >
                    {formatNumber(population, NUMBER_FORMATS.STRING)}
                  </Text>
                </Flex>
              </Flex>
            );
          })}
        </Flex>
      </ConditionalScrollArea>
      {superDraw && (
        <ShowAllDistrictsButton
          showAll={showAll}
          onToggle={() => setShowAllOverride(!showAll)}
          total={populationData.length}
          hiddenCount={hiddenCount}
        />
      )}
      {/* Plan-wide scoreboard: two stat blocks under the chart, turning green
          as each goal is met, with a quiet completion line when both are. */}
      <Flex
        gap="4"
        px="1"
        pt="3"
        mt="2"
        justify="between"
        style={{borderTop: '1px solid var(--gray-4)'}}
      >
        <Flex direction="column">
          <Text color="gray" style={STAT_LABEL_STYLE}>
            Unassigned
          </Text>
          <Text
            size="4"
            weight="bold"
            style={{
              fontVariantNumeric: 'tabular-nums',
              ...(allAssigned ? {color: SUCCESS_COLOR} : {}),
            }}
          >
            {unassigned !== undefined ? formatNumber(unassigned, NUMBER_FORMATS.STRING) : '—'}
          </Text>
          {!allAssigned && isEditing && (
            <Flex gap="2" mt="1">
              {/* Same toggle-button treatment as Lock painted. */}
              <Button
                size="1"
                variant={higlightUnassigned ? 'solid' : 'surface'}
                color="gray"
                highContrast={higlightUnassigned}
                onClick={() => setMapOptions({higlightUnassigned: !higlightUnassigned})}
                aria-pressed={higlightUnassigned}
              >
                {higlightUnassigned ? <EyeOpenIcon /> : <EyeNoneIcon />}
                Show on map
              </Button>
              <Button
                size="1"
                variant="ghost"
                onClick={handleFindUnassigned}
                style={{fontWeight: 600}}
              >
                Find areas →
              </Button>
            </Flex>
          )}
        </Flex>
        <Flex direction="column" align="end">
          <Flex align="center" gap="0">
            <Text color="gray" style={STAT_LABEL_STYLE}>
              Max deviation
            </Text>
            <HelpTip tip="maxDeviation" openDelay={HELP_TIP_FAST_DELAY} />
          </Flex>
          <Text
            size="4"
            weight="bold"
            style={{
              fontVariantNumeric: 'tabular-nums',
              ...(allBalanced ? {color: SUCCESS_COLOR} : {}),
            }}
          >
            {maxDeviation !== undefined ? signedNumber(maxDeviation) : '—'}
          </Text>
        </Flex>
      </Flex>
      {planComplete && (
        <Flex align="center" justify="center" gap="1" pt="2">
          <CheckIcon style={{color: SUCCESS_COLOR}} />
          <Text size="1" weight="medium" style={{color: SUCCESS_COLOR}}>
            Every person assigned, every district balanced
          </Text>
        </Flex>
      )}
    </Flex>
  );
};
