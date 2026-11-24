'use client';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Flex, Spinner, Text} from '@radix-ui/themes';
import {FIPS_TO_ABBR, FIPS_TO_NAME} from '@constants/meta/usStates';
import {HOVER_CHIP_CLASS} from './HoverTrigger';

export type CompactnessScoreKey = 'polsby_popper' | 'reock';

interface ExemplarDistrict {
  statefp: string;
  district: number;
  polsby_popper: number;
  reock: number;
  width: number;
  height: number;
  /** Outline in a `width` × `height` box; holes are subpaths (fill-rule evenodd). */
  path: string;
}

interface ExemplarBucket {
  min: number;
  max: number;
  /** Districts of the source Congress in this range, before sampling. */
  total: number;
  /** The sample, in the order drawn. */
  districts: string[];
}

/** Shape of compactnessExemplars.json; docs/compactness-exemplars/README.md says where it comes from. */
interface CompactnessExemplarData {
  source: string;
  congress: number;
  electionYear: number;
  seed: number;
  sampleSize: number;
  buckets: Record<CompactnessScoreKey, ExemplarBucket[]>;
  districts: Record<string, ExemplarDistrict>;
}

const SCORE_NAME: Record<CompactnessScoreKey, string> = {
  polsby_popper: 'Polsby-Popper',
  reock: 'Reock',
};

const OUTLINE_FILL = 'steelblue';
const ROW_LINE = '1px solid var(--gray-a5)';
const SCORE_KEYS: CompactnessScoreKey[] = ['polsby_popper', 'reock'];

// Layout, in px. The ranges stand in one row per score when the panel has room for
// the row's label and all of them, otherwise in rows of NARROW_RANGES_PER_ROW.
const ROW_LABEL_WIDTH = 132;
const RANGE_MIN_WIDTH = 84;
const NARROW_RANGES_PER_ROW = 3;
// An outline takes this share of its column's width, so outlines and gaps grow
// together with the panel. Past RANGE_MAX_WIDTH per range the table stops growing.
const OUTLINE_SHARE = 0.72;
const OUTLINE_MIN_SIZE = 56;
const RANGE_MAX_WIDTH = 132;
// The sample of one range, shown while the range is hovered or focused: rows of as
// many districts as there are ranges in a row.
const SAMPLE_ROWS = 3;
// A pointer that only crosses the table on its way elsewhere opens nothing.
const HOVER_OPEN_DELAY_MS = 150;
// Long enough to cross the gap between two ranges without the sample closing.
const HOVER_CLOSE_DELAY_MS = 120;
const SAMPLE_LINE_COLOR = 'var(--gray-a6)';

const loadExemplars = async (): Promise<CompactnessExemplarData> =>
  (await import('@constants/compactnessExemplars.json')).default as CompactnessExemplarData;

const ordinal = (n: number): string => {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

const districtName = ({statefp, district}: ExemplarDistrict): string =>
  `${FIPS_TO_NAME[statefp] ?? `FIPS ${statefp}`}'s ${ordinal(district)} District`;

const districtShortName = ({statefp, district}: ExemplarDistrict): string =>
  `${FIPS_TO_ABBR[statefp] ?? statefp}-${ordinal(district)}`;

const rangeLabel = ({min, max}: ExemplarBucket): string => `${min.toFixed(2)}–${max.toFixed(2)}`;

const Outline: React.FC<{district: ExemplarDistrict; size: number}> = ({district, size}) => (
  <svg
    role="img"
    aria-label={districtName(district)}
    width={size}
    height={size}
    viewBox={`0 0 ${district.width} ${district.height}`}
    style={{display: 'block'}}
  >
    <path d={district.path} fillRule="evenodd" fill={OUTLINE_FILL} />
  </svg>
);

// A trigger is a soft chip as large as its content, so the space between two of them
// triggers nothing. The open one drops the chip's fill: its cell is the tab.
const TRIGGER_STYLE: React.CSSProperties = {font: 'inherit', display: 'block'};
const OPEN_TRIGGER_STYLE: React.CSSProperties = {...TRIGGER_STYLE, background: 'none'};
const CELL_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 'var(--space-2) 0',
  minWidth: 0,
};
const ROW_LABEL_STYLE: React.CSSProperties = {
  ...CELL_STYLE,
  flexDirection: 'column',
  textAlign: 'center',
};
// The number of the range whose sample is open becomes a tab on the sample's frame:
// on its top edge for a sample below the row, on its bottom edge for one above.
// Every number cell keeps the tab's border width, so opening moves no text.
const RANGE_CELL_STYLE: React.CSSProperties = {
  ...CELL_STYLE,
  borderStyle: 'solid',
  borderWidth: '1px 1px 0',
  borderColor: 'transparent',
  borderRadius: 'var(--radius-3) var(--radius-3) 0 0',
};
const OPEN_RANGE_CELL_STYLE: React.CSSProperties = {
  ...RANGE_CELL_STYLE,
  borderColor: SAMPLE_LINE_COLOR,
  backgroundColor: 'var(--color-panel-solid)',
  position: 'relative',
  zIndex: 11,
  // Down over the row line and the sample's top line, so tab and sample are one shape.
  marginBottom: -2,
};
const OPEN_RANGE_CELL_ABOVE_STYLE: React.CSSProperties = {
  ...OPEN_RANGE_CELL_STYLE,
  // The line moves from the top edge to the bottom edge; the padding takes the
  // difference, so the number stays where it is.
  borderWidth: '0 1px 1px',
  borderRadius: '0 0 var(--radius-3) var(--radius-3)',
  padding: 'calc(var(--space-2) + 1px) 0 calc(var(--space-2) - 1px)',
  // Up over the sample's bottom line and down over the row line.
  marginTop: -1,
  marginBottom: -1,
};

type Placement = 'below' | 'above';

/** Top and bottom, in viewport pixels, of what the reader sees around an element. */
const visibleBounds = (element: Element): {top: number; bottom: number} => {
  let top = 0;
  let bottom = window.innerHeight;
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY !== 'visible') {
      const rect = node.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
  }
  return {top, bottom};
};
const SHORT_NAME_STYLE: React.CSSProperties = {
  fontSize: 10,
  lineHeight: '12px',
  color: 'var(--gray-9)',
};

interface SampleProps {
  label: string;
  /** Districts in display order. */
  geoids: string[];
  districtsById: Record<string, ExemplarDistrict>;
  perRow: number;
  /** Column of the sample's range, where the range's tab joins the sample. */
  tabColumn: number;
  outlineSize: number;
  /** Where the districts come from, in the short names' type below the outlines. */
  source: string;
  /** Side of the range's row the sample lies on. */
  placement: Placement;
  containerRef: React.Ref<HTMLDivElement>;
}

/**
 * The sample of one range, laid over the content below or above the range's row,
 * on the table's columns. It ignores the pointer.
 */
const Sample: React.FC<SampleProps> = ({
  label,
  geoids,
  districtsById,
  perRow,
  tabColumn,
  outlineSize,
  source,
  placement,
  containerRef,
}) => {
  // Square where the range's tab meets a corner.
  const tabLeft = tabColumn === 0 ? 0 : 'var(--radius-3)';
  const tabRight = tabColumn === perRow - 1 ? 0 : 'var(--radius-3)';
  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={label}
      style={{
        position: 'absolute',
        ...(placement === 'below' ? {top: 0} : {bottom: 0}),
        left: ROW_LABEL_WIDTH,
        right: 0,
        zIndex: 10,
        pointerEvents: 'none',
        display: 'grid',
        gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`,
        backgroundColor: 'var(--color-panel-solid)',
        borderRadius:
          placement === 'below'
            ? `${tabLeft} ${tabRight} var(--radius-3) var(--radius-3)`
            : `var(--radius-3) var(--radius-3) ${tabRight} ${tabLeft}`,
        boxShadow: `inset 0 0 0 1px ${SAMPLE_LINE_COLOR}, var(--shadow-4)`,
      }}
    >
      {geoids.map(geoid => (
        <figure
          key={geoid}
          className="m-0 flex flex-col items-center gap-1"
          style={{padding: 'var(--space-2) 0'}}
        >
          <Outline district={districtsById[geoid]} size={outlineSize} />
          <figcaption style={SHORT_NAME_STYLE}>
            {districtShortName(districtsById[geoid])}
          </figcaption>
        </figure>
      ))}
      <p
        className="m-0 text-center"
        style={{
          ...SHORT_NAME_STYLE,
          gridColumn: '1 / -1',
          padding: '0 var(--space-2) var(--space-2)',
        }}
      >
        {source}
      </p>
    </div>
  );
};

interface OpenRange {
  scoreKey: CompactnessScoreKey;
  index: number;
}

/**
 * The score ranges of both scores, one row per score, so the same range of the two
 * scores stands in one column. Hovering or focusing a range opens that range's
 * sample below its row, or above it when the sample fits better there, each district
 * with its short name, and the range's number becomes a tab on the sample's frame.
 * The sample is the same for everyone.
 */
const ExemplarRanges: React.FC<{data: CompactnessExemplarData}> = ({data}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [openRange, setOpenRange] = useState<OpenRange | null>(null);
  const [placement, setPlacement] = useState<Placement>('below');
  const sampleRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const rangeCount = data.buckets[SCORE_KEYS[0]].length;
  const source =
    `Congressional districts of the ${ordinal(data.congress)} Congress, used in the ` +
    `${data.electionYear} election (${data.source}).`;

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => setWidth(wrapper.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };
  const open = (range: OpenRange) => {
    clearTimers();
    setOpenRange(range);
  };
  const close = () => {
    clearTimers();
    setOpenRange(null);
  };
  const onPointerOver = (range: OpenRange) => {
    if (openRange !== null) return open(range);
    clearTimers();
    openTimer.current = window.setTimeout(() => setOpenRange(range), HOVER_OPEN_DELAY_MS);
  };
  const closeSoon = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpenRange(null), HOVER_CLOSE_DELAY_MS);
  };
  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    []
  );

  // A sample that reaches past what the reader sees would lengthen the panel's
  // scroll, and the scrollbar that brings can move its range away from the pointer.
  // So before a sample is painted it takes the side of its row with room for it:
  // below when it fits there, otherwise the side with more room.
  useLayoutEffect(() => {
    const sample = sampleRef.current;
    const row = sample?.closest('[data-exemplar-row]');
    if (!sample || !row) return;
    const rowRect = row.getBoundingClientRect();
    const visible = visibleBounds(row);
    const roomBelow = visible.bottom - rowRect.bottom;
    const roomAbove = rowRect.top - visible.top;
    setPlacement(sample.offsetHeight <= roomBelow || roomBelow >= roomAbove ? 'below' : 'above');
  }, [openRange, width]);

  // A tap elsewhere closes the sample: touch screens have no pointer to move away.
  const isOpen = openRange !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const onTrigger = (event.target as Element).closest?.('[data-exemplar-trigger]');
      if (!onTrigger || !wrapperRef.current?.contains(onTrigger)) setOpenRange(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const allInOneRow = width === null || width >= ROW_LABEL_WIDTH + rangeCount * RANGE_MIN_WIDTH;
  const rangesPerRow = allInOneRow ? rangeCount : NARROW_RANGES_PER_ROW;
  const columnWidth = width === null ? 0 : (width - ROW_LABEL_WIDTH) / rangesPerRow;
  const outlineSize = Math.round(Math.max(OUTLINE_MIN_SIZE, columnWidth * OUTLINE_SHARE));
  const rowStarts = Array.from({length: rangeCount}, (_, i) => i).filter(
    i => i % rangesPerRow === 0
  );
  const columns = `${ROW_LABEL_WIDTH}px repeat(${rangesPerRow}, minmax(0, 1fr))`;

  const isOpenAt = (scoreKey: CompactnessScoreKey, index: number) =>
    openRange?.scoreKey === scoreKey && openRange.index === index;

  const triggerProps = (range: OpenRange) => ({
    type: 'button' as const,
    'data-exemplar-trigger': true,
    'aria-expanded': isOpenAt(range.scoreKey, range.index),
    className: HOVER_CHIP_CLASS,
    style: isOpenAt(range.scoreKey, range.index) ? OPEN_TRIGGER_STYLE : TRIGGER_STYLE,
    onMouseEnter: () => onPointerOver(range),
    onMouseLeave: closeSoon,
    onFocus: () => open(range),
    onBlur: closeSoon,
    onClick: () => open(range),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    },
  });

  return (
    <div
      ref={wrapperRef}
      className="mb-3"
      style={{maxWidth: ROW_LABEL_WIDTH + rangeCount * RANGE_MAX_WIDTH}}
    >
      {rowStarts.map(start => {
        const openHere =
          openRange !== null && openRange.index >= start && openRange.index < start + rangesPerRow
            ? openRange
            : null;
        return (
          <div key={start}>
            {SCORE_KEYS.map(scoreKey => {
              const sample = openHere?.scoreKey === scoreKey && (
                <Sample
                  label={`Districts with a ${SCORE_NAME[scoreKey]} score of ${rangeLabel(
                    data.buckets[scoreKey][openHere.index]
                  )}`}
                  geoids={data.buckets[scoreKey][openHere.index].districts.slice(
                    0,
                    rangesPerRow * SAMPLE_ROWS
                  )}
                  districtsById={data.districts}
                  perRow={rangesPerRow}
                  tabColumn={openHere.index - start}
                  outlineSize={outlineSize}
                  source={source}
                  placement={placement}
                  containerRef={sampleRef}
                />
              );
              return (
                <div key={scoreKey} data-exemplar-row>
                  <div style={{position: 'relative'}}>{placement === 'above' && sample}</div>
                  <div
                    style={{display: 'grid', gridTemplateColumns: columns, borderBottom: ROW_LINE}}
                  >
                    <div style={ROW_LABEL_STYLE}>
                      <Text size="1">{SCORE_NAME[scoreKey]}</Text>
                      <Text size="1" color="gray">
                        hover to see examples
                      </Text>
                    </div>
                    {data.buckets[scoreKey].slice(start, start + rangesPerRow).map((bucket, i) => {
                      const index = start + i;
                      const isOpenHere = isOpenAt(scoreKey, index);
                      return (
                        <div
                          key={bucket.min}
                          style={
                            !isOpenHere
                              ? RANGE_CELL_STYLE
                              : placement === 'above'
                                ? OPEN_RANGE_CELL_ABOVE_STYLE
                                : OPEN_RANGE_CELL_STYLE
                          }
                        >
                          <button {...triggerProps({scoreKey, index})}>
                            <Text
                              size="2"
                              weight={isOpenHere ? 'bold' : 'regular'}
                              className="tabular-nums"
                            >
                              {rangeLabel(bucket)}
                            </Text>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{position: 'relative'}}>{placement === 'below' && sample}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Shows what the two compactness scores look like: districts of a past Congress,
 * grouped into score ranges, a fixed random sample of each range.
 */
export const CompactnessExemplars: React.FC = () => {
  const {data, isError} = useQuery({
    queryKey: ['compactness-exemplars'],
    queryFn: loadExemplars,
    staleTime: Infinity,
  });

  if (isError) {
    return (
      <Text size="2" color="gray" as="p" mb="3">
        Example districts could not be loaded.
      </Text>
    );
  }
  if (!data) {
    return (
      <Flex justify="center" align="center" mb="3" style={{minHeight: 60}}>
        <Spinner />
      </Flex>
    );
  }

  return <ExemplarRanges data={data} />;
};
