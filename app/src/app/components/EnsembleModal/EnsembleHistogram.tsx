'use client';
import React, {useMemo, useState} from 'react';
import {Group} from '@visx/group';
import {Bar, Line} from '@visx/shape';
import {scaleLinear} from '@visx/scale';
import {AxisBottom, AxisLeft} from '@visx/axis';
import {HoverCard, Text as ThemeText} from '@radix-ui/themes';
import {formatEnsembleValue, type EnsembleValueFormat} from './ensembleMetrics';
import {spreadMarkers} from './ensembleExtremes';
import {ENSEMBLE_MODAL_TEXT, fillEnsembleText} from './ensembleModalText';
import type {EnsembleDistribution} from './ensembleTypes';

const MARGIN = {top: 12, right: 18, bottom: 40, left: 56};
/** Below this many occupied buckets the series reads as a handful of discrete
 * values: the axis is labelled at those values, and a continuous series' slivers
 * are widened into bars. Integer series already fill their unit-wide slots. */
const SPARSE_BUCKETS = 24;
const SPARSE_BAR_MIN_WIDTH = 8;
/** Markers closer than this are nudged apart so each stays visible. */
const MARKER_MIN_GAP = 4;
const LEGEND_HEIGHT = 20;
/** Extreme plans are dotted, against the solid plan and dashed step markers. */
const EXTREME_DASH = '1 3';
const EXTREME_THUMB_WIDTH = 180;
const DEFAULT_HEIGHT = 280;
/** Bar fills recede; the two markers carry the color weight. */
const BAR_FILL = 'var(--gray-a7)';
const BAR_FILL_HOVER = 'var(--gray-a9)';
const PLAN_COLOR = 'var(--accent-9)';
const SELECTED_COLOR = 'var(--amber-10)';
/** The sample's bars sit inside the ensemble's, this fraction of their width. */
const SAMPLE_BAR_FILL = 'var(--amber-a8)';
const SAMPLE_BAR_SHARE = 0.5;
const AXIS_COLOR = 'var(--gray-a8)';
const INK = 'var(--gray-12)';
const MUTED_INK = 'var(--gray-11)';

interface Bucket {
  /** Inclusive-exclusive value span the bar covers. */
  from: number;
  to: number;
  percent: number;
  count: number;
  /** Percent of the sampled plans in the span; absent without a sample. */
  samplePercent?: number;
}

/** An extreme plan a search found, marked at its value of the charted series. */
export interface HistogramExtreme {
  key: string;
  /** The objective's label, for the legend. */
  label: string;
  /** The objective in plain words, for the popover. */
  objective: string;
  color: string;
  value: number;
  thumbUrl: string;
}

const NO_EXTREMES: HistogramExtreme[] = [];
const NO_SAMPLE: number[] = [];

export interface EnsembleHistogramProps {
  dist: EnsembleDistribution;
  format: EnsembleValueFormat;
  /** Value for the plan being evaluated; drawn as the "Evaluated plan" marker. */
  planValue?: number;
  planLabel: string;
  /** Value for the plan selected in the individual-plans section. */
  selectedValue?: number;
  selectedLabel: string;
  /** Values of the sampled plans of that section, drawn as a second set of
   * bars: the share of the sample in each bucket. */
  sample?: number[];
  sampleLabel: string;
  width: number;
  height?: number;
  /** Named on the vertical axis, so the chart reads on its own. */
  percentAxisLabel?: string;
  /** The charted series, for the figure's accessible name. */
  metricLabel: string;
  /** Extreme plans to mark, each with a legend entry that previews its map. */
  extremes?: HistogramExtreme[];
}

/** Half the span a discrete value's bar covers: a third of the smallest gap
 * between neighbouring values, so bars never touch. */
const discreteHalfSpan = (values: number[]): number => {
  let gap = Infinity;
  for (let i = 1; i < values.length; i++) gap = Math.min(gap, values[i] - values[i - 1]);
  return Number.isFinite(gap) && gap > 0 ? gap / 3 : Math.max(Math.abs(values[0] ?? 1), 1) / 10;
};

/** Bucket spans: one unit wide and centered on the value for an integer series,
 * a fixed span centered on each exact value for a discrete one, the bucket's
 * own edges for a continuous one. */
const buildBuckets = (dist: EnsembleDistribution): Bucket[] => {
  const total = dist.counts.reduce((sum, count) => sum + count, 0) || 1;
  if (dist.kind === 'integer' || dist.kind === 'discrete') {
    const half = dist.kind === 'integer' ? 0.5 : discreteHalfSpan(dist.edges);
    return dist.edges.map((value, index) => ({
      from: value - half,
      to: value + half,
      count: dist.counts[index] ?? 0,
      percent: ((dist.counts[index] ?? 0) / total) * 100,
    }));
  }
  return dist.counts.map((count, index) => ({
    from: dist.edges[index],
    to: dist.edges[index + 1],
    count,
    percent: (count / total) * 100,
  }));
};

/** The sample's share of each bucket, by the same spans; the last span is
 * closed so a value at the top edge still counts. */
const withSample = (buckets: Bucket[], sample: number[]): Bucket[] => {
  const values = sample.filter(value => Number.isFinite(value));
  if (!values.length) return buckets;
  const counts = buckets.map(() => 0);
  values.forEach(value => {
    const index = buckets.findIndex(
      (bucket, i) =>
        value >= bucket.from &&
        (value < bucket.to || (i === buckets.length - 1 && value <= bucket.to))
    );
    if (index >= 0) counts[index] += 1;
  });
  return buckets.map((bucket, index) => ({
    ...bucket,
    samplePercent: (counts[index] / values.length) * 100,
  }));
};

/** Label for the span a bar covers: the integer itself, or the bucket's range. */
const bucketLabel = (bucket: Bucket, dist: EnsembleDistribution, format: EnsembleValueFormat) =>
  dist.kind === 'continuous'
    ? `${formatEnsembleValue(bucket.from, format)} to ${formatEnsembleValue(bucket.to, format)}`
    : formatEnsembleValue(
        dist.kind === 'integer'
          ? Math.round((bucket.from + bucket.to) / 2)
          : (bucket.from + bucket.to) / 2,
        format
      );

/**
 * The ensemble's distribution for one metric, with the current plan and the
 * selected plan marked on it, and the sampled plans' own shares inside the bars.
 *
 * Layout is computed once per metric, size or marker change and then only read
 * during hover, so moving the pointer over the bars re-renders a fill and a
 * tooltip and nothing else.
 */
export const EnsembleHistogram: React.FC<EnsembleHistogramProps> = ({
  dist,
  format,
  planValue,
  planLabel,
  selectedValue,
  selectedLabel,
  sample = NO_SAMPLE,
  sampleLabel,
  width,
  height = DEFAULT_HEIGHT,
  percentAxisLabel,
  metricLabel,
  extremes = NO_EXTREMES,
}) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const layout = useMemo(() => {
    const buckets = withSample(buildBuckets(dist), sample);
    let domainMin = buckets.length ? buckets[0].from : 0;
    let domainMax = buckets.length ? buckets[buckets.length - 1].to : 1;
    // The axis stretches to hold a plan whose value falls outside everything the
    // ensemble reached — that gap is the whole point of the comparison.
    [planValue, selectedValue, ...extremes.map(extreme => extreme.value)].forEach(value => {
      if (value === undefined || !Number.isFinite(value)) return;
      const low = dist.kind === 'integer' ? Math.floor(value) - 0.5 : value;
      const high = dist.kind === 'integer' ? Math.ceil(value) + 0.5 : value;
      domainMin = Math.min(domainMin, low);
      domainMax = Math.max(domainMax, high);
    });
    if (domainMax <= domainMin) domainMax = domainMin + 1;
    const maxPercent = buckets.reduce(
      (max, bucket) => Math.max(max, bucket.percent, bucket.samplePercent ?? 0),
      0
    );
    const xScale = scaleLinear<number>({domain: [domainMin, domainMax], range: [0, innerWidth]});
    // The tallest bar reaches two thirds of the plot, so a full-height marker
    // line cannot be mistaken for a bar: bars encode share, markers position.
    const yMax = Math.min(100, Math.max(1, maxPercent * 1.5));
    const yScale = scaleLinear<number>({domain: [0, yMax], range: [innerHeight, 0], nice: true});
    const occupied = buckets.filter(bucket => bucket.count > 0);
    const sparse = occupied.length <= SPARSE_BUCKETS;
    // Discrete values draw their own bars at the computed span; only a sparse
    // continuous series has slivers worth widening.
    const widen = sparse && dist.kind === 'continuous';
    const tickValues = sparse
      ? occupied.map(bucket =>
          dist.kind === 'integer'
            ? Math.round((bucket.from + bucket.to) / 2)
            : (bucket.from + bucket.to) / 2
        )
      : undefined;
    const percentDigits = maxPercent < 5 ? 1 : 0;
    return {buckets, xScale, yScale, tickValues, percentDigits, widen};
  }, [dist, planValue, selectedValue, sample, extremes, innerWidth, innerHeight]);

  if (innerWidth <= 0 || innerHeight <= 0) return null;
  const {buckets, xScale, yScale, tickValues, percentDigits, widen} = layout;

  // Coinciding values (the plan and an extreme on the same seat count, say)
  // would hide one line under another; nudge them apart instead.
  const finite = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value);
  const placed = [
    finite(planValue) ? {id: 'plan', x: xScale(planValue)} : null,
    finite(selectedValue) ? {id: 'selected', x: xScale(selectedValue)} : null,
    ...extremes.map(extreme =>
      finite(extreme.value) ? {id: `extreme:${extreme.key}`, x: xScale(extreme.value)} : null
    ),
  ].filter((item): item is {id: string; x: number} => item !== null);
  const spread = spreadMarkers(
    placed.map(item => item.x),
    MARKER_MIN_GAP
  );
  const positions = new Map(placed.map((item, index) => [item.id, spread[index]]));
  const planX = positions.get('plan');
  const selectedX = positions.get('selected');
  const sampleLow = buckets.length ? buckets[0].from : 0;
  const sampleHigh = buckets.length ? buckets[buckets.length - 1].to : 0;
  const outsideSample = (value: number) => value < sampleLow || value > sampleHigh;

  const marker = (
    x: number | undefined,
    key: string,
    color: string,
    dash: string | undefined,
    strokeWidth = 1
  ) => {
    if (x === undefined) return null;
    return (
      <Line
        key={key}
        from={{x, y: 0}}
        to={{x, y: innerHeight}}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
      />
    );
  };

  const legendSwatch = (color: string, dash: string | undefined) => (
    <svg width={22} height={10} aria-hidden="true">
      <line x1={1} y1={5} x2={21} y2={5} stroke={color} strokeWidth={2} strokeDasharray={dash} />
    </svg>
  );

  const legendItem = (value: number | undefined, label: string, color: string, dashed: boolean) =>
    value === undefined || !Number.isFinite(value) ? null : (
      <span key={label} style={{display: 'inline-flex', alignItems: 'center', gap: 6}}>
        {legendSwatch(color, dashed ? '4 3' : undefined)}
        <ThemeText size="1" style={{color: INK}}>
          {label}
        </ThemeText>
      </span>
    );

  const hoveredBucket = hovered === null ? null : buckets[hovered];

  return (
    <div style={{position: 'relative', width}}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Distribution of ${metricLabel} across the ensemble`}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          {buckets.map((bucket, index) => {
            const left = xScale(bucket.from);
            const right = xScale(bucket.to);
            const span = right - left;
            // A 2px gap between neighbouring bars, dropped once bars get so thin
            // that the gap would eat them.
            const gap = span > 4 ? 2 : 0;
            // A sparse series gets bars at least twice as wide as its slivers,
            // centred on the bucket, so each value reads as a bar of its own.
            const barWidth = widen
              ? Math.max(SPARSE_BAR_MIN_WIDTH, 2 * (span - gap))
              : Math.max(1, span - gap);
            // A widened bar stays inside the plot rather than crossing the axis.
            const barX = widen
              ? Math.min(innerWidth - barWidth, Math.max(0, (left + right) / 2 - barWidth / 2))
              : left + gap / 2;
            const barHeight = innerHeight - yScale(bucket.percent);
            const sampleWidth = Math.max(1, barWidth * SAMPLE_BAR_SHARE);
            const samplePercent = bucket.samplePercent ?? 0;
            return (
              <React.Fragment key={index}>
                <Bar
                  x={barX}
                  y={yScale(bucket.percent)}
                  width={barWidth}
                  height={Math.max(barHeight, bucket.count > 0 ? 1 : 0)}
                  rx={barWidth >= 4 ? 2 : 0}
                  fill={hovered === index ? BAR_FILL_HOVER : BAR_FILL}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                />
                {samplePercent > 0 && (
                  <Bar
                    x={barX + (barWidth - sampleWidth) / 2}
                    y={yScale(samplePercent)}
                    width={sampleWidth}
                    height={Math.max(1, innerHeight - yScale(samplePercent))}
                    fill={SAMPLE_BAR_FILL}
                    pointerEvents="none"
                  />
                )}
              </React.Fragment>
            );
          })}
          {extremes.map(extreme =>
            marker(
              positions.get(`extreme:${extreme.key}`),
              `extreme:${extreme.key}`,
              extreme.color,
              EXTREME_DASH,
              1.5
            )
          )}
          {extremes.map(extreme => {
            // An extreme beyond everything the sample reached stands alone on
            // the axis, so its value is written beside the line.
            const x = positions.get(`extreme:${extreme.key}`);
            if (x === undefined || !outsideSample(extreme.value)) return null;
            const rightSide = x > innerWidth / 2;
            return (
              <text
                key={`extreme-label:${extreme.key}`}
                x={x + (rightSide ? -4 : 4)}
                y={10}
                fontSize={10}
                fill={extreme.color}
                textAnchor={rightSide ? 'end' : 'start'}
                pointerEvents="none"
              >
                {formatEnsembleValue(extreme.value, format)}
              </text>
            );
          })}
          {marker(selectedX, 'selected', SELECTED_COLOR, '4 3')}
          {marker(planX, 'plan', PLAN_COLOR, undefined)}
          <AxisLeft
            scale={yScale}
            numTicks={5}
            label={percentAxisLabel}
            labelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'middle'}}
            labelOffset={28}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickFormat={value => `${Number(value).toFixed(percentDigits)}%`}
            tickLabelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'end', dx: -4, dy: 4}}
          />
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={tickValues ? undefined : 6}
            tickValues={tickValues}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickFormat={value => formatEnsembleValue(Number(value), format)}
            tickLabelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'middle', dy: 2}}
          />
        </Group>
      </svg>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: 16,
          rowGap: 4,
          minHeight: LEGEND_HEIGHT,
          alignItems: 'center',
          paddingLeft: MARGIN.left,
          marginTop: 4,
          marginBottom: 12,
        }}
      >
        {legendItem(planValue, planLabel, PLAN_COLOR, false)}
        {sample.length > 0 && (
          <span style={{display: 'inline-flex', alignItems: 'center', gap: 6}}>
            <svg width={22} height={10} aria-hidden="true">
              <rect x={6} y={0} width={10} height={10} fill={SAMPLE_BAR_FILL} />
            </svg>
            <ThemeText size="1" style={{color: INK}}>
              {sampleLabel}
            </ThemeText>
          </span>
        )}
        {legendItem(selectedValue, selectedLabel, SELECTED_COLOR, true)}
        {extremes.map(extreme => (
          <ExtremeLegendItem
            key={extreme.key}
            extreme={extreme}
            format={format}
            metricLabel={metricLabel}
            swatch={legendSwatch(extreme.color, EXTREME_DASH)}
          />
        ))}
      </div>
      {hoveredBucket && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: 'var(--color-panel-solid)',
            border: '1px solid var(--gray-a6)',
            borderRadius: 4,
            padding: '2px 6px',
            pointerEvents: 'none',
          }}
        >
          <ThemeText size="1" style={{color: INK}}>
            {bucketLabel(hoveredBucket, dist, format)} · {hoveredBucket.percent.toFixed(1)}% of
            plans
            {hoveredBucket.samplePercent !== undefined &&
              ` · ${fillEnsembleText(ENSEMBLE_MODAL_TEXT.sampleHover, {
                share: `${hoveredBucket.samplePercent.toFixed(0)}%`,
              })}`}
          </ThemeText>
        </div>
      )}
    </div>
  );
};

/**
 * A legend entry for one extreme plan. Hovering or clicking it opens a small
 * card with the plan's map; the thumbnail is requested only once the card opens.
 */
const ExtremeLegendItem: React.FC<{
  extreme: HistogramExtreme;
  format: EnsembleValueFormat;
  metricLabel: string;
  swatch: React.ReactNode;
}> = ({extreme, format, metricLabel, swatch}) => {
  const [open, setOpen] = useState(false);
  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCard.Trigger>
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {swatch}
          <ThemeText size="1" style={{color: INK, textDecoration: 'underline dotted'}}>
            {extreme.label}
          </ThemeText>
        </button>
      </HoverCard.Trigger>
      <HoverCard.Content size="1" maxWidth={`${EXTREME_THUMB_WIDTH + 24}px`}>
        <img
          src={extreme.thumbUrl}
          alt={fillEnsembleText(ENSEMBLE_MODAL_TEXT.extremeThumbAlt, {label: extreme.label})}
          width={EXTREME_THUMB_WIDTH}
          style={{display: 'block', height: 'auto', marginBottom: 6}}
        />
        <ThemeText as="p" size="1" weight="bold" style={{color: INK}}>
          {extreme.label}
        </ThemeText>
        <ThemeText as="p" size="1" style={{color: MUTED_INK}}>
          {extreme.objective}
        </ThemeText>
        <ThemeText as="p" size="1" style={{color: INK, marginTop: 4}}>
          {fillEnsembleText(ENSEMBLE_MODAL_TEXT.extremeValue, {
            metric: metricLabel,
            value: formatEnsembleValue(extreme.value, format),
          })}
        </ThemeText>
      </HoverCard.Content>
    </HoverCard.Root>
  );
};
