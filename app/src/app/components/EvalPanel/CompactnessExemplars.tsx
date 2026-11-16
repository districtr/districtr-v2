'use client';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Flex, Spinner, Text} from '@radix-ui/themes';
import {FIPS_TO_ABBR, FIPS_TO_NAME} from '@constants/meta/usStates';
import {HOVER_BTN_STYLE} from './HoverTrigger';

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

// Layout, in px. The ranges stand in one row when the panel has room for the row's
// label and all of them, otherwise in rows of NARROW_RANGES_PER_ROW.
const ROW_LABEL_WIDTH = 104;
const RANGE_MIN_WIDTH = 76;
const NARROW_RANGES_PER_ROW = 3;
// An outline takes this share of its column's width, so outlines and gaps grow
// together with the panel. Past RANGE_MAX_WIDTH per range the table stops growing.
const OUTLINE_SHARE = 0.72;
const OUTLINE_MIN_SIZE = 56;
const RANGE_MAX_WIDTH = 132;
// The sample of one range, shown while the range is hovered or focused: rows of as
// many districts as there are ranges in a row.
const SAMPLE_ROWS = 3;
/** Districts of a range's sample that are shown at any panel width. */
const ALWAYS_SHOWN = NARROW_RANGES_PER_ROW * SAMPLE_ROWS;
// A pointer that only crosses the row on its way elsewhere opens nothing.
const HOVER_OPEN_DELAY_MS = 150;
// Long enough to cross the gap between two outlines without the sample closing.
const HOVER_CLOSE_DELAY_MS = 120;
const UNFOLD_MS = 150;
// Room around the sample for its shadow, in the unfolding clip.
const SHADOW_ROOM = 24;
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

// A trigger is as large as its content, so the space between two of them triggers nothing.
const TRIGGER_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  cursor: 'default',
  display: 'block',
};
const CELL_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 'var(--space-2) 0',
  minWidth: 0,
};
const ROW_LABEL_STYLE: React.CSSProperties = {...CELL_STYLE, textAlign: 'center'};
// The number of the range whose sample is open becomes a tab on the sample's frame.
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
  /** Column of the cell the sample unfolds from, in its first row. */
  fromColumn: number;
  outlineSize: number;
}

/**
 * The sample of one range, laid over the examples, on their columns, and unfolding
 * from the cell of the range's own example. It ignores the pointer, so the examples
 * under it stay hoverable.
 */
const Sample: React.FC<SampleProps> = ({
  label,
  geoids,
  districtsById,
  perRow,
  fromColumn,
  outlineSize,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const rows = Math.ceil(geoids.length / perRow);

  useLayoutEffect(() => {
    const sample = ref.current;
    if (!sample?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const left = (fromColumn / perRow) * 100;
    const right = ((perRow - 1 - fromColumn) / perRow) * 100;
    const bottom = (1 - 1 / rows) * 100;
    sample.animate(
      [
        {clipPath: `inset(0 ${right}% ${bottom}% ${left}%)`},
        {clipPath: `inset(-${SHADOW_ROOM}px)`},
      ],
      {duration: UNFOLD_MS, easing: 'ease-out'}
    );
  }, [fromColumn, perRow, rows]);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className="print:hidden"
      style={{
        position: 'absolute',
        top: 0,
        left: ROW_LABEL_WIDTH,
        right: 0,
        zIndex: 10,
        pointerEvents: 'none',
        display: 'grid',
        gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`,
        backgroundColor: 'var(--color-panel-solid)',
        // Square where the range's tab meets a corner.
        borderRadius: `${fromColumn === 0 ? 0 : 'var(--radius-3)'} ${
          fromColumn === perRow - 1 ? 0 : 'var(--radius-3)'
        } var(--radius-3) var(--radius-3)`,
        boxShadow: `inset 0 0 0 1px ${SAMPLE_LINE_COLOR}, var(--shadow-4)`,
      }}
    >
      {geoids.map(geoid => (
        // The padding above the outline equals the example row's, so the range's
        // own example stands where it stood.
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
    </div>
  );
};

interface ExemplarRangesProps {
  scoreName: string;
  buckets: ExemplarBucket[];
  districtsById: Record<string, ExemplarDistrict>;
}

/**
 * The score ranges side by side, one example district under each. Hovering or
 * focusing a range's number or its example unfolds the range's sample over the
 * examples, each district with its short name; the range's own example keeps its
 * place in it, and the range's number becomes a tab on the sample's frame.
 *
 * The sample is the same for everyone. The one example shown before any hover is
 * drawn anew on each visit, from the first ALWAYS_SHOWN of the sample, so it is
 * among the districts the sample shows at any width.
 */
const ExemplarRanges: React.FC<ExemplarRangesProps> = ({scoreName, buckets, districtsById}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const [shownByDefault] = useState(() =>
    buckets.map(
      ({districts}) =>
        districts[Math.floor(Math.random() * Math.min(districts.length, ALWAYS_SHOWN))]
    )
  );

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
  const open = (index: number) => {
    clearTimers();
    setOpenIndex(index);
  };
  const close = () => {
    clearTimers();
    setOpenIndex(null);
  };
  const onPointerOver = (index: number) => {
    if (openIndex !== null) return open(index);
    clearTimers();
    openTimer.current = window.setTimeout(() => setOpenIndex(index), HOVER_OPEN_DELAY_MS);
  };
  const closeSoon = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpenIndex(null), HOVER_CLOSE_DELAY_MS);
  };
  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    []
  );

  // A tap elsewhere closes the sample: touch screens have no pointer to move away.
  const isOpen = openIndex !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const onTrigger = (event.target as Element).closest?.('[data-exemplar-trigger]');
      if (!onTrigger || !wrapperRef.current?.contains(onTrigger)) setOpenIndex(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const allInOneRow = width === null || width >= ROW_LABEL_WIDTH + buckets.length * RANGE_MIN_WIDTH;
  const rangesPerRow = allInOneRow ? buckets.length : NARROW_RANGES_PER_ROW;
  const columnWidth = width === null ? 0 : (width - ROW_LABEL_WIDTH) / rangesPerRow;
  const outlineSize = Math.round(Math.max(OUTLINE_MIN_SIZE, columnWidth * OUTLINE_SHARE));
  const rowStarts = buckets.map((_, i) => i).filter(i => i % rangesPerRow === 0);
  const columns = `${ROW_LABEL_WIDTH}px repeat(${rangesPerRow}, minmax(0, 1fr))`;

  /** A range's sample with the range's own example moved to the given place. */
  const sampleWithExampleAt = (index: number, place: number): string[] => {
    const geoids = buckets[index].districts.slice(0, rangesPerRow * SAMPLE_ROWS);
    const from = geoids.indexOf(shownByDefault[index]);
    [geoids[from], geoids[place]] = [geoids[place], geoids[from]];
    return geoids;
  };

  const triggerProps = (index: number) => ({
    type: 'button' as const,
    'data-exemplar-trigger': true,
    'aria-expanded': openIndex === index,
    style: TRIGGER_STYLE,
    onMouseEnter: () => onPointerOver(index),
    onMouseLeave: closeSoon,
    onFocus: () => open(index),
    onBlur: closeSoon,
    onClick: () => open(index),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    },
  });

  return (
    <div
      ref={wrapperRef}
      className="mb-3"
      style={{maxWidth: ROW_LABEL_WIDTH + buckets.length * RANGE_MAX_WIDTH}}
    >
      {rowStarts.map(start => {
        const row = buckets.slice(start, start + rangesPerRow).map((bucket, i) => ({
          bucket,
          index: start + i,
        }));
        const openHere =
          openIndex !== null && openIndex >= start && openIndex < start + rangesPerRow
            ? openIndex
            : null;
        return (
          <div key={start}>
            <div style={{display: 'grid', gridTemplateColumns: columns, borderBottom: ROW_LINE}}>
              <Text size="1" style={ROW_LABEL_STYLE}>
                A {scoreName} score of
              </Text>
              {row.map(({bucket, index}) => (
                <div
                  key={bucket.min}
                  style={openIndex === index ? OPEN_RANGE_CELL_STYLE : RANGE_CELL_STYLE}
                >
                  <button {...triggerProps(index)}>
                    <Text
                      size="2"
                      weight={openIndex === index ? 'bold' : 'regular'}
                      className="tabular-nums"
                      style={{textDecoration: HOVER_BTN_STYLE.textDecoration}}
                    >
                      {rangeLabel(bucket)}
                    </Text>
                  </button>
                </div>
              ))}
            </div>
            <div style={{position: 'relative'}}>
              <div style={{display: 'grid', gridTemplateColumns: columns, borderBottom: ROW_LINE}}>
                <Text size="1" style={ROW_LABEL_STYLE}>
                  …is exemplified by…
                </Text>
                {row.map(({bucket, index}) => (
                  <div key={bucket.min} style={CELL_STYLE}>
                    <button {...triggerProps(index)}>
                      <Outline district={districtsById[shownByDefault[index]]} size={outlineSize} />
                    </button>
                  </div>
                ))}
              </div>
              {openHere !== null && (
                <Sample
                  key={openHere}
                  label={`Districts with a ${scoreName} score of ${rangeLabel(buckets[openHere])}`}
                  geoids={sampleWithExampleAt(openHere, openHere - start)}
                  districtsById={districtsById}
                  perRow={rangesPerRow}
                  fromColumn={openHere - start}
                  outlineSize={outlineSize}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface CompactnessExemplarsProps {
  scoreKey: CompactnessScoreKey;
}

/**
 * Shows what a compactness score looks like: districts of a past Congress, grouped
 * into score ranges, a fixed random sample of each range.
 */
export const CompactnessExemplars: React.FC<CompactnessExemplarsProps> = ({scoreKey}) => {
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
      <Flex justify="center" align="center" mb="3" style={{minHeight: 120}}>
        <Spinner />
      </Flex>
    );
  }

  return (
    <ExemplarRanges
      scoreName={SCORE_NAME[scoreKey]}
      buckets={data.buckets[scoreKey]}
      districtsById={data.districts}
    />
  );
};
