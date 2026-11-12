'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Flex, Slider, Spinner, Text} from '@radix-ui/themes';
import {FIPS_TO_NAME} from '@constants/meta/usStates';

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

const OUTLINE_SIZE = 96;
const OUTLINE_FILL = 'steelblue';
const SLIDER_WIDTH = 140;
const EDGE_FADE = 48;

const loadExemplars = async (): Promise<CompactnessExemplarData> =>
  (await import('@constants/compactnessExemplars.json')).default as CompactnessExemplarData;

const ordinal = (n: number): string => {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

const districtName = ({statefp, district}: ExemplarDistrict): string =>
  `${FIPS_TO_NAME[statefp] ?? `FIPS ${statefp}`}'s ${ordinal(district)} District`;

const rangeLabel = ({min, max}: ExemplarBucket): string => `${min.toFixed(2)}–${max.toFixed(2)}`;

/**
 * Index of the bucket to show before the user moves the slider: the bucket holding the
 * plan's mean score, else the nearest bucket, else (no plan score) the bucket with
 * the most districts.
 */
const initialBucketIndex = (buckets: ExemplarBucket[], planMean: number | null): number => {
  if (planMean === null) {
    return buckets.reduce((best, b, i) => (b.total > buckets[best].total ? i : best), 0);
  }
  // Buckets are assigned on the 3-decimal score, the value the panel shows.
  const shown = Math.round(planMean * 1000) / 1000;
  const distance = (b: ExemplarBucket) =>
    shown < b.min ? b.min - shown : shown >= b.max ? shown - b.max + 1e-9 : 0;
  return buckets.reduce((best, b, i) => (distance(b) < distance(buckets[best]) ? i : best), 0);
};

const samplingNote = ({total, districts}: ExemplarBucket): string => {
  if (total === 1) return 'Showing the only district in this range.';
  if (districts.length === total) return `Showing all ${total} districts in this range.`;
  return `Showing ${districts.length} of ${total} districts in this range, chosen at random.`;
};

interface BucketSliderProps {
  buckets: ExemplarBucket[];
  index: number;
  onChange: (index: number) => void;
  label: string;
}

/** One slider stop per score range, lowest range on the left. */
const BucketSlider: React.FC<BucketSliderProps> = ({buckets, index, onChange, label}) => {
  const sliderRef = useRef<HTMLSpanElement>(null);
  const valueText = rangeLabel(buckets[index]);
  // Radix Themes' Slider puts aria attributes on its root, and a screen reader
  // announces the focusable thumb, so the thumb is named here.
  useEffect(() => {
    const thumb = sliderRef.current?.querySelector('[role="slider"]');
    thumb?.setAttribute('aria-label', label);
    thumb?.setAttribute('aria-valuetext', valueText);
  }, [label, valueText]);

  return (
    <Slider
      ref={sliderRef}
      size="1"
      min={0}
      max={buckets.length - 1}
      step={1}
      value={[index]}
      onValueChange={([next]) => onChange(next)}
      className="print:hidden"
      style={{width: SLIDER_WIDTH, flex: 'none'}}
    />
  );
};

interface ExemplarStripProps {
  /** Ids of the districts to show, in order. */
  geoids: string[];
  districtsById: Record<string, ExemplarDistrict>;
  label: string;
}

/**
 * The districts of one score range in a row that scrolls sideways. An edge fades
 * out while more districts lie beyond it.
 */
const ExemplarStrip: React.FC<ExemplarStripProps> = ({geoids, districtsById, label}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState({left: false, right: false});

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => {
      const left = strip.scrollLeft > 1;
      const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
      setHidden(was => (was.left === left && was.right === right ? was : {left, right}));
    };
    // A new range starts from its first district.
    strip.scrollLeft = 0;
    update();
    strip.addEventListener('scroll', update, {passive: true});
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    return () => {
      strip.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [geoids]);

  const fade = `linear-gradient(to right, ${hidden.left ? 'transparent' : 'black'}, black ${EDGE_FADE}px, black calc(100% - ${EDGE_FADE}px), ${hidden.right ? 'transparent' : 'black'})`;

  return (
    <div
      ref={stripRef}
      role="group"
      aria-label={label}
      tabIndex={0}
      className="flex gap-3 overflow-x-auto pb-2 [scroll-snap-type:x_proximity] print:flex-wrap print:overflow-visible print:![mask-image:none]"
      style={{maskImage: fade, WebkitMaskImage: fade}}
    >
      {geoids.map(geoid => {
        const district = districtsById[geoid];
        const name = districtName(district);
        return (
          <figure
            key={geoid}
            className="m-0 flex w-[132px] flex-none flex-col items-center gap-1 [scroll-snap-align:start]"
          >
            <svg
              role="img"
              aria-label={name}
              width={OUTLINE_SIZE}
              height={OUTLINE_SIZE}
              viewBox={`0 0 ${district.width} ${district.height}`}
            >
              <path d={district.path} fillRule="evenodd" fill={OUTLINE_FILL} />
            </svg>
            <figcaption className="text-center">
              <Text size="1">{name}</Text>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
};

interface CompactnessExemplarsProps {
  scoreKey: CompactnessScoreKey;
  /** Mean of the plan's own scores; decides which range is shown first. */
  planMean: number | null;
}

/**
 * Shows what a compactness score looks like: districts of a past Congress, grouped
 * into score ranges, a fixed random sample of each range.
 */
export const CompactnessExemplars: React.FC<CompactnessExemplarsProps> = ({scoreKey, planMean}) => {
  const {data, isError} = useQuery({
    queryKey: ['compactness-exemplars'],
    queryFn: loadExemplars,
    staleTime: Infinity,
  });
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);

  const buckets = data?.buckets[scoreKey];
  const defaultIndex = useMemo(
    () => (buckets ? initialBucketIndex(buckets, planMean) : 0),
    [buckets, planMean]
  );

  if (isError) {
    return (
      <Text size="2" color="gray" as="p" mb="3">
        Example districts could not be loaded.
      </Text>
    );
  }
  if (!data || !buckets) {
    return (
      <Flex justify="center" align="center" mb="3" style={{minHeight: 220}}>
        <Spinner />
      </Flex>
    );
  }

  const selectedIndex = chosenIndex ?? defaultIndex;
  const bucket = buckets[selectedIndex];
  const scoreName = SCORE_NAME[scoreKey];

  return (
    <Flex direction="column" gap="2" mb="3">
      <Flex align="center" gap="2" wrap="wrap">
        <Text size="2">A {scoreName} score of</Text>
        <Text size="2" weight="bold" className="tabular-nums">
          {rangeLabel(bucket)}
        </Text>
        <BucketSlider
          buckets={buckets}
          index={selectedIndex}
          onChange={setChosenIndex}
          label={`${scoreName} score range of the example districts`}
        />
        <Text size="2">is exemplified by:</Text>
      </Flex>
      <ExemplarStrip
        geoids={bucket.districts}
        districtsById={data.districts}
        label={`Districts with a ${scoreName} score of ${rangeLabel(bucket)}`}
      />
      <Text size="1" color="gray" as="p">
        Congressional districts of the {ordinal(data.congress)} Congress, used in the{' '}
        {data.electionYear} election ({data.source}). {samplingNote(bucket)}
      </Text>
    </Flex>
  );
};
